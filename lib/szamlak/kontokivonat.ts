"use server";

// FIGYELEM: "use server" fájl — csak async függvényeket exportálhat, lásd
// lib/fuvarozas/megbizasok.ts mintáját. Típusok: kontokivonat-constants.ts.
//
// A bank "HISTORY_xxxx.xlsx" kontókivonatának feltöltése: a beolvasást és a
// bevételek ⇄ számlák párosítását a kontokivonat-parositas.ts végzi (lásd
// ott a párosítási elveket). A feltöltés önmagában NEM ír az adatbázisba — a
// review-képernyőn elfogadott tételeket a fogadjaElParositasokat() könyveli,
// és a lekönyvelt banki utalást a kontokivonat_konyvelt táblába is felírja,
// hogy egy újrafeltöltött (vagy átfedő) kivonat ne könyvelje újra.

import { query } from "@/lib/db";
import { requireEditPermission } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { olvasKivonatot, parositKivonatot, type ParositasSzamla } from "./kontokivonat-parositas";
import type { KivonatEredmeny, KivonatKonyvelesTetel } from "./kontokivonat-constants";

/**
 * A böngészőből base64-ként érkező .xlsx feldolgozása: a bevételi tételek
 * párosítási javaslattal térnek vissza, a kiadás/kártya sorok csak összesítve.
 */
export async function dolgozzFelKivonatot(base64: string, fajlNev: string): Promise<KivonatEredmeny> {
  await requireEditPermission("szamlak");
  const beolvasas = await olvasKivonatot(Buffer.from(base64, "base64"));

  const szamlak = await query<ParositasSzamla>(
    `select id::text, szamlaszam, vevo_nev as "vevoNev",
            (brutto + helyesbites_osszeg)::float8 as brutto, penznem,
            to_char(kiallitas_datum, 'YYYY-MM-DD') as "kiallitasDatum",
            to_char(fizetesi_hatarido, 'YYYY-MM-DD') as "fizetesiHatarido",
            fizetve
     from szamla
     where not sztorno and not sztornozva`
  );

  const kulcsok = beolvasas.tranzakciok.map((t) => t.kulcs);
  const konyvelt = kulcsok.length
    ? await query<{ kulcs: string }>(`select kulcs from kontokivonat_konyvelt where kulcs = any($1::text[])`, [kulcsok])
    : [];

  const parositasok = parositKivonatot(beolvasas.tranzakciok, szamlak, new Set(konyvelt.map((k) => k.kulcs)));
  const datumok = beolvasas.tranzakciok.map((t) => t.datum).sort();

  return {
    fajlNev,
    tranzakcioSzam: beolvasas.osszesAdatSor,
    datumtol: datumok[0] ?? null,
    datumig: datumok[datumok.length - 1] ?? null,
    parositasok,
    kihagyottKiadas: beolvasas.kihagyottKiadas,
    kihagyottKartya: beolvasas.kihagyottKartya,
  };
}

/**
 * A review-képernyőn elfogadott tételek könyvelése: a banki utalás felírása
 * (egyszer — egy már felírt kulcsot kihagy), és a hozzárendelt számlák
 * "Fizetve" jelölése az utalás értéknapjával.
 */
export async function fogadjaElParositasokat(
  tetelek: KivonatKonyvelesTetel[]
): Promise<{ sikeres: number; marKonyvelt: number }> {
  await requireEditPermission("szamlak");
  const session = await requireSession();
  let sikeres = 0;
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
    const jelolve = await query<{ id: string }>(
      `update szamla
       set fizetve = true,
           fizetve_datum = ($2::date)::timestamp at time zone 'Europe/Budapest'
       where id = any($1::bigint[]) and not fizetve
       returning id::text as id`,
      [szamlaIdk, t.datum]
    );
    sikeres += jelolve.length;
  }

  return { sikeres, marKonyvelt };
}
