"use server";

// FIGYELEM: "use server" fájl — csak async függvényeket exportálhat, lásd
// lib/fuvarozas/megbizasok.ts mintáját. Típusok: kontokivonat-constants.ts.
//
// Kontókivonat-feltöltés: UniCredit "HISTORY_xxxx.xlsx" és CIB havi PDF
// kivonat, akár egyszerre több fájl (pl. az éves anyag). Két lépés:
//  1. olvasKivonatFajlt() — fájlonként beolvassa a bevételi tételeket,
//  2. parositKivonatTranzakciokat() — az összes fájl tételeit EGYÜTT párosítja
//     (lásd kontokivonat-parositas.ts), így egy számla egy utaláshoz kerül.
// A feltöltés önmagában NEM ír az adatbázisba — a review-képernyőn elfogadott
// tételeket a fogadjaElParositasokat() könyveli: a nyitott számlákat
// fizetettre állítja, a már fizetetteknél a fizetés dátumát az utalás
// értéknapjára pontosítja, és a banki utalást felírja a kontokivonat_konyvelt
// táblába (egy újrafeltöltött kivonat így nem könyvel duplán).
//
// Részfizetés: ha egy utalás egyetlen számlára jön, de kevesebb a hátralékánál,
// csak a szamla.fizetett_osszeg nő — a számla nyitott marad, és a következő
// utalás zárja le. A kerekítés/banki költség miatti pár forintos maradékot a
// REST_TOLERANCIA nyeli el.

import { query } from "@/lib/db";
import { requireEditPermission } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { olvasKivonatot, parositKivonatot, type ParositasSzamla } from "./kontokivonat-parositas";
import type {
  KivonatBeolvasottFajl,
  KivonatKonyvelesEredmeny,
  KivonatKonyvelesTetel,
  KivonatParositas,
  KivonatTranzakcio,
} from "./kontokivonat-constants";

/**
 * Ennyi maradékot tekintünk kiegyenlítettnek: az utolsó részlet a banki
 * költség vagy kerekítés miatt lehet pár forinttal kevesebb, ettől ne maradjon
 * nyitva a számla. Forintnál 100 Ft, devizánál 1 egység (pl. 1 EUR).
 */
function restTolerancia(penznem: string): number {
  return ["FT", "HUF"].includes(penznem.trim().toUpperCase()) ? 100 : 1;
}

/** Egy (a böngészőből base64-ként érkező) kivonatfájl beolvasása — nem ír az adatbázisba. */
export async function olvasKivonatFajlt(base64: string, fajlNev: string): Promise<KivonatBeolvasottFajl> {
  await requireEditPermission("szamlak");
  const beolvasas = await olvasKivonatot(new Uint8Array(Buffer.from(base64, "base64")));
  const datumok = beolvasas.tranzakciok.map((t) => t.datum).sort();
  return {
    fajlNev,
    forras: beolvasas.forras,
    tranzakcioSzam: beolvasas.osszesAdatSor,
    bevetelSzam: beolvasas.tranzakciok.length,
    datumtol: datumok[0] ?? null,
    datumig: datumok[datumok.length - 1] ?? null,
    kihagyottKiadas: beolvasas.kihagyottKiadas,
    kihagyottKartya: beolvasas.kihagyottKartya,
    kihagyottSajat: beolvasas.kihagyottSajat,
    tranzakciok: beolvasas.tranzakciok,
  };
}

/** Az (akár több fájlból összegyűjtött) bevételi tételek párosítása a számlákkal — nem ír az adatbázisba. */
export async function parositKivonatTranzakciokat(tranzakciok: KivonatTranzakcio[]): Promise<KivonatParositas[]> {
  await requireEditPermission("szamlak");
  const egyedi = [...new Map(tranzakciok.map((t) => [t.kulcs, t])).values()];

  const szamlak = await query<ParositasSzamla>(
    `select s.id::text, s.szamlaszam, s.vevo_nev as "vevoNev",
            (s.brutto + s.helyesbites_osszeg)::float8 as brutto, s.penznem,
            to_char(s.kiallitas_datum, 'YYYY-MM-DD') as "kiallitasDatum",
            to_char(s.fizetesi_hatarido, 'YYYY-MM-DD') as "fizetesiHatarido",
            s.fizetve, s.fizetett_osszeg::float8 as "fizetettOsszeg",
            to_char(s.fizetve_datum at time zone 'Europe/Budapest', 'YYYY-MM-DD') as "fizetveDatum",
            exists (select 1 from kontokivonat_konyvelt k where s.id = any(k.szamla_idk)) as "bankIgazolt"
     from szamla s
     where not s.sztorno and not s.sztornozva`
  );

  const kulcsok = egyedi.map((t) => t.kulcs);
  const konyvelt = kulcsok.length
    ? await query<{ kulcs: string }>(`select kulcs from kontokivonat_konyvelt where kulcs = any($1::text[])`, [kulcsok])
    : [];

  return parositKivonatot(egyedi, szamlak, new Set(konyvelt.map((k) => k.kulcs)));
}

/**
 * Az elfogadott tételek könyvelése: a banki utalás felírása (egyszer — egy már
 * felírt kulcsot kihagy); a hozzárendelt nyitott számlák "Fizetve" jelölése, a
 * már fizetetteknél a fizetés dátumának pontosítása — mindkettő az utalás
 * értéknapjával. Egy másik utalással már igazolt számla dátumát nem írja felül.
 * Ha az utalás egyetlen nyitott számlára jön, de a hátralékát nem fedezi, akkor
 * részfizetésként csak a fizetett_osszeg nő, a számla nyitott marad.
 */
export async function fogadjaElParositasokat(
  tetelek: KivonatKonyvelesTetel[]
): Promise<KivonatKonyvelesEredmeny> {
  await requireEditPermission("szamlak");
  const session = await requireSession();
  let sikeres = 0;
  let datumFrissitve = 0;
  let reszfizetes = 0;
  let marKonyvelt = 0;

  for (const { tranzakcio: t, szamlaIdk } of tetelek) {
    if (szamlaIdk.length === 0) continue;
    const felirva = await query<{ kulcs: string }>(
      `insert into kontokivonat_konyvelt (kulcs, datum, osszeg, penznem, partner_nev, kozlemeny, szamla_idk, konyvelte)
       values ($1, $2::date, $3, $4, $5, $6, $7::bigint[], $8)
       on conflict (kulcs) do nothing
       returning kulcs`,
      [t.kulcs, t.datum, t.osszeg, t.penznem, t.partnerNev, t.memo, szamlaIdk, session.username]
    );
    if (felirva.length === 0) {
      marKonyvelt++;
      continue;
    }

    // Részfizetés — egyetlen nyitott számla, amelynek hátralékát ez az utalás
    // nem futja (a pár forintos maradékot a tolerancia elnyeli: az ilyen
    // utalás már a teljes kiegyenlítésnek számít, lentebb).
    if (szamlaIdk.length === 1) {
      const nyitott = await query<{ hatralek: number }>(
        `select (brutto + helyesbites_osszeg - fizetett_osszeg)::float8 as hatralek
         from szamla
         where id = $1::bigint and not fizetve`,
        [szamlaIdk[0]]
      );
      if (nyitott.length > 0 && t.osszeg < nyitott[0].hatralek - restTolerancia(t.penznem)) {
        await query(
          `update szamla set fizetett_osszeg = fizetett_osszeg + $2 where id = $1::bigint`,
          [szamlaIdk[0], t.osszeg]
        );
        reszfizetes++;
        continue;
      }
    }

    const ujFizetve = await query<{ id: string }>(
      `update szamla
       set fizetve = true,
           fizetve_datum = ($2::date)::timestamp at time zone 'Europe/Budapest'
       where id = any($1::bigint[]) and not fizetve
       returning id::text as id`,
      [szamlaIdk, t.datum]
    );
    sikeres += ujFizetve.length;

    const frissitett = await query<{ id: string }>(
      `update szamla s
       set fizetve_datum = ($2::date)::timestamp at time zone 'Europe/Budapest'
       where s.id = any($1::bigint[])
         and s.fizetve
         and not (s.id = any($3::bigint[]))
         and not exists (
           select 1 from kontokivonat_konyvelt k
           where s.id = any(k.szamla_idk) and k.kulcs <> $4
         )
       returning s.id::text as id`,
      [szamlaIdk, t.datum, ujFizetve.map((r) => r.id), t.kulcs]
    );
    datumFrissitve += frissitett.length;
  }

  return { sikeres, datumFrissitve, reszfizetes, marKonyvelt };
}
