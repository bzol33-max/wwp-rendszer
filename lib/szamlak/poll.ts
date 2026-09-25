// A Számlázz.hu-szinkron motorja: EGYETLEN központi hely kérdezi le a
// Számlázz.hu API-t (lásd korábbi döntés — más modulok innen, a `szamla`
// táblából olvasnak, nem az API-ból közvetlenül).
//
// A Számlázz.hu Számla Agent API-jának nincs listázó végpontja, csak
// egyedi számla kérdezhető le sorszám alapján — ezért sorszámról sorszámra
// haladva próbálgatjuk őket. A cég TÖBB számlatömböt (előtagot) is használ
// Számlázz.hu-ban — ezeket valós, kiállított számlákról olvastuk le:
// "WLLWR" (pl. "WLLWR-2026-283") és "WNYH" (pl. "WNYH-2026-1") — formátum:
// "{ELOTAG}-{ÉV}-{SORSZÁM}". Minden előtag saját, egymástól FÜGGETLEN
// sorszám-keresőt kap (lásd ELOTAGOK lent), mert a sorszámozásuk is
// egymástól független.
//
// FONTOS tervezési döntés: egy adott pillanatban "nem található" sorszám
// nem jelenti, hogy soha nem is lesz — a Számlázz.hu-ban egy sorszám
// lefoglalása megelőzheti a tényleges kiállítást. Ezért a fő kereső
// (szamlak_poll_allapot.utolso_sorszam, előtagonként) és a "még hiányzó"
// sorszámok listája (szamlak_poll_pending) EGYMÁSTÓL FÜGGETLENÜL haladnak:
// a hiányzó sorszámokat minden körben újra megvizsgáljuk, függetlenül
// attól, hogy a fő kereső időközben már jóval előrébb jár.

import { query } from "@/lib/db";
import { decodeEntities, lekerdezSzamla, SzamlazzHuError, type SzamlazzHuSzamla } from "./szamlazzhu-client";
import { kategorizalSzamla, alkategorizalRaklap } from "./categorize";
import { frissitSztornoJelolest } from "./sztorno";
import { szinkronizalSzamlaSzamokat } from "@/lib/fuvarozas/megbizasok";
import { szinkronizalSzallitoleveleket } from "@/lib/fuvarozas2/szallitolevel";

/** A cég ismert Számlázz.hu számlatömb-előtagjai — mindegyik saját, független sorszám-keresőt kap. */
const ELOTAGOK = ["WLLWR", "WNYH"];
/** Egy lekérdezési körben legfeljebb ennyi ÚJ sorszámot próbálunk (a kezdeti,
 *  sok száz számlát behozó felzárkózás fokozatosan, több kör alatt fusson le). */
const MAX_UJ_PROBALKOZAS_KORONKENT = 60;
/** Ennyi egymást követő "nem található" után feladjuk az adott kör előrehaladását
 *  (feltételezve, hogy elértük a jelenlegi frontot — nincs értelme messze előre
 *  találgatni olyan számokat, amik még nem is léteznek). */
const MAX_EGYMASUTANI_HIANY = 5;
/** Ennyi napig próbálkozunk egy hiányzó sorszámmal, mielőtt véglegesen feladjuk. */
const FELADAS_NAPOK = 400;

function budapestEv(): number {
  return Number(
    new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric" }).format(new Date())
  );
}

async function mentSzamla(adat: SzamlazzHuSzamla) {
  const kategoria = kategorizalSzamla(adat.tetelekSzoveg);
  const alkategoria = kategoria === "raklap" ? alkategorizalRaklap(adat.vevoNev) : null;
  await query(
    `insert into szamla
       (szamlaszam, vevo_nev, rendelesszam, fizmod, penznem, teljesites_datum,
        kiallitas_datum, fizetesi_hatarido, netto, afa, brutto, kategoria,
        alkategoria, tetelek_szoveg, raw_xml, lekerdezve_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
     on conflict (szamlaszam) do update set
       vevo_nev = excluded.vevo_nev,
       rendelesszam = excluded.rendelesszam,
       fizmod = excluded.fizmod,
       penznem = excluded.penznem,
       teljesites_datum = excluded.teljesites_datum,
       kiallitas_datum = excluded.kiallitas_datum,
       fizetesi_hatarido = excluded.fizetesi_hatarido,
       netto = excluded.netto,
       afa = excluded.afa,
       brutto = excluded.brutto,
       kategoria = excluded.kategoria,
       alkategoria = excluded.alkategoria,
       tetelek_szoveg = excluded.tetelek_szoveg,
       raw_xml = excluded.raw_xml,
       lekerdezve_at = now()`,
    [
      adat.szamlaszam,
      adat.vevoNev,
      adat.rendelesszam,
      adat.fizmod,
      adat.penznem,
      adat.teljesitesDatum,
      adat.kiallitasDatum,
      adat.fizetesiHatarido,
      adat.netto,
      adat.afa,
      adat.brutto,
      kategoria,
      alkategoria,
      adat.tetelekSzoveg,
      adat.rawXml,
    ]
  );
}

async function felveszPendingbe(szamlaszam: string) {
  await query(
    `insert into szamlak_poll_pending (szamlaszam)
     values ($1)
     on conflict (szamlaszam) do update set
       utoljara_probalt_at = now(),
       probalkozasok = szamlak_poll_pending.probalkozasok + 1`,
    [szamlaszam]
  );
}

async function torolPendingbol(szamlaszam: string) {
  await query(`delete from szamlak_poll_pending where szamlaszam = $1`, [szamlaszam]);
}

export type PollEredmeny = {
  ujMegtalalt: number;
  /** Új Számlázz.hu-s szállítólevél (S-WLLWR-…), és hány saját fuvarhoz párosult. */
  szallitolevelUj?: number;
  szallitolevelParositva?: number;
  pendingMegoldva: number;
  hibak: string[];
  sztornoDarab?: number;
  szamlaSzamParositva?: number;
  rendelesszamJavitva?: number;
  kifizetesJelolve?: number;
};

/**
 * A Számlázz.hu-s szállítólevelek (2026-09-25, Budaházi Zoltán): saját
 * sorszámozásuk van („S-WLLWR-2026-162”), és a saját fuvarhoz párosulnak
 * (vevő + rendszám + a fuvar dátuma). NEM a `szamla` táblába kerülnek — az a
 * számlák és a kintlévőség forrása —, hanem a `szallitolevel_import`-ba.
 * A rendszám a megjegyzésben áll: „Rendszám:NMZ-492,XZV-926”.
 */
const SZALLITOLEVEL_ELOTAG = "S-WLLWR";
/**
 * Az első indulás kezdőpontja: 2026 szeptemberében a 162-es körül jártak,
 * a régebbiekhez nincs párosítandó saját fuvar — nem kérdezzük le mindet.
 */
const SZALLITOLEVEL_KEZDO_SORSZAM: Record<number, number> = { 2026: 150 };
const MAX_SZALLITOLEVEL_KORONKENT = 20;

function rendszamAMegjegyzesbol(megjegyzes: string | null): string | null {
  const m = /Rendsz[áa]m\s*:?\s*([^\n;<]+)/i.exec(megjegyzes ?? "");
  return m ? m[1].trim().slice(0, 60) : null;
}

async function szallitolevelekKeresese(agentKulcs: string, ev: number, eredmeny: PollEredmeny): Promise<void> {
  const [allapot] = await query<{ ev: number; utolso_sorszam: number }>(
    `select ev, utolso_sorszam from szamlak_poll_allapot where elotag = $1`,
    [SZALLITOLEVEL_ELOTAG]
  );
  let utolso = allapot?.ev === ev ? allapot.utolso_sorszam : (SZALLITOLEVEL_KEZDO_SORSZAM[ev] ?? 0);
  let proba = utolso;
  let hiany = 0;
  let uj = 0;
  for (let i = 0; i < MAX_SZALLITOLEVEL_KORONKENT && hiany < MAX_EGYMASUTANI_HIANY; i++) {
    proba++;
    const szam = `${SZALLITOLEVEL_ELOTAG}-${ev}-${proba}`;
    try {
      const t = await lekerdezSzamla(szam, agentKulcs);
      if (!t) { hiany++; continue; }
      hiany = 0;
      utolso = proba;
      const raklapDb = t.tetelek
        .filter((x) => x.mennyiseg !== null && (!x.egyseg || /db|darab/i.test(x.egyseg)))
        .reduce((a, x) => a + (x.mennyiseg ?? 0), 0);
      await query(
        `insert into szallitolevel_import (bizonylatszam, kelt, vevo, rendszam, tetelek, raklap_db, forras_fajl)
         values ($1, $2, $3, $4, $5::jsonb, $6, 'szamlazzhu')
         on conflict (bizonylatszam) do update set kelt = excluded.kelt, vevo = excluded.vevo, rendszam = excluded.rendszam,
           tetelek = excluded.tetelek, raklap_db = excluded.raklap_db
         where szallitolevel_import.parositas_allapot <> 'parositva'`,
        [t.szamlaszam, t.teljesitesDatum ?? t.kiallitasDatum, t.vevoNev, rendszamAMegjegyzesbol(t.megjegyzes) ?? rendszamAMegjegyzesbol(t.rawXml), JSON.stringify(t.tetelek), raklapDb || null]
      );
      uj++;
    } catch (err) {
      eredmeny.hibak.push(`${szam}: ${err instanceof SzamlazzHuError ? err.message : "ismeretlen hiba"}`);
      break;
    }
  }
  await query(
    `insert into szamlak_poll_allapot (elotag, ev, utolso_sorszam, utolso_futas_at)
     values ($1, $2, $3, now())
     on conflict (elotag) do update set ev = $2, utolso_sorszam = $3, utolso_futas_at = now()`,
    [SZALLITOLEVEL_ELOTAG, ev, utolso]
  );
  eredmeny.szallitolevelUj = uj;
}

/**
 * Egy körben legfeljebb ennyi, korábban null rendelésszámmal mentett
 * fuvarszámlát próbálunk újralekérdezni (lásd javitRendelesszamHianyokat) —
 * korlátozva, hogy egy nagyobb elmaradás se terhelje túl a Számlázz.hu API-t
 * egyetlen kör alatt; a maradék a következő körben folytatódik.
 */
const MAX_RENDELESSZAM_JAVITAS_KORONKENT = 30;

/**
 * A "rendelesszam" mező kiolvasása korábban egy nagybetűzés-eltérés miatt
 * (lásd szamlazzhu-client.ts) mindig null-t adott vissza — emiatt a
 * fuvarszámla ↔ megbízás párosítás (szinkronizalSzamlaSzamokat) egyetlen
 * már behúzott számlánál sem működhetett, akkor sem, ha a hiv. szám
 * egyébként pontosan egyezett. A parsing mostantól javítva van, de a MÁR
 * elmentett számlák rendelesszam-ja emiatt még null a szamla táblában — ezt
 * itt, korlátozott ütemben, újralekérdezéssel pótoljuk.
 */
/**
 * A dekódolatlanul elmentett rendelésszámok (pl. „&#193;J/2026/09/1279”)
 * helyben javítása — újralekérdezés nélkül, a kliens dekóderével.
 */
async function dekodoljRendelesszamokat(): Promise<number> {
  const sorok = await query<{ id: string; rendelesszam: string }>(
    `select id::text, rendelesszam from szamla where rendelesszam like '%&%;%'`
  );
  let javitva = 0;
  for (const r of sorok) {
    const uj = decodeEntities(r.rendelesszam).trim();
    if (uj && uj !== r.rendelesszam) {
      await query(`update szamla set rendelesszam = $2 where id = $1`, [r.id, uj]);
      javitva++;
    }
  }
  return javitva;
}

async function javitRendelesszamHianyokat(agentKulcs: string): Promise<number> {
  const hianyosak = await query<{ szamlaszam: string }>(
    `select szamlaszam from szamla
     where kategoria = 'fuvar' and rendelesszam is null
     order by szamlaszam
     limit $1`,
    [MAX_RENDELESSZAM_JAVITAS_KORONKENT]
  );
  let javitva = 0;
  for (const sor of hianyosak) {
    try {
      const talalat = await lekerdezSzamla(sor.szamlaszam, agentKulcs);
      if (talalat?.rendelesszam) {
        await mentSzamla(talalat);
        javitva++;
      }
    } catch {
      // egy hibás lekérdezés ne állítsa meg a többit — legközelebb újra próbáljuk
    }
  }
  return javitva;
}

/**
 * A fő kereső állásának helyreállítása előtagonként: az állás sosem lehet
 * nagyobb a ténylegesen megtalált legnagyobb sorszámnál. Egy korábbi hiba
 * miatt a kereső a "nem található" sorszámokon is továbblépett, így minden
 * körben 5 sorszámmal a valós front elé szaladt, és a pending lista körönként
 * nőtt (mind újra lekérdezve minden körben). A front fölötti pending sorokat
 * töröljük — azokat a fő kereső újként úgyis megpróbálja, amikor odaér.
 */
async function helyreallitFrontot(elotag: string, ev: number): Promise<number> {
  const allapotSor = (
    await query<{ ev: number; utolso_sorszam: number }>(
      `select ev, utolso_sorszam from szamlak_poll_allapot where elotag = $1`,
      [elotag]
    )
  )[0];
  const tarolt = allapotSor?.ev === ev ? allapotSor.utolso_sorszam : 0;

  const minta = `^${elotag}-${ev}-[0-9]+$`;
  const maxTalalt = (
    await query<{ n: number }>(
      `select coalesce(max(case when szamlaszam ~ $1 then split_part(szamlaszam, '-', 3)::int end), 0)::int as n
       from szamla`,
      [minta]
    )
  )[0]?.n ?? 0;

  const front = Math.min(tarolt, maxTalalt);
  await query(
    `delete from szamlak_poll_pending
     where case when szamlaszam ~ $1 then split_part(szamlaszam, '-', 3)::int > $2 else false end`,
    [minta, front]
  );
  return front;
}

/** Egy lekérdezési körben legfeljebb ennyi nyitott számlát kérdezünk le újra (lásd frissitNyitottSzamlakat). */
const MAX_NYITOTT_FRISSITES_KORONKENT = 10;

/**
 * A már behúzott, még nyitott számlák lassú, körbeforgó újralekérdezése (a
 * legrégebben frissítettek elöl) — így a Számlázz.hu-ban utólag rögzített
 * kifizetés (és pl. módosított határidő) is bekerül a raw_xml-be.
 */
async function frissitNyitottSzamlakat(agentKulcs: string): Promise<void> {
  const sorok = await query<{ szamlaszam: string }>(
    `select szamlaszam from szamla
     where not fizetve and not sztorno and not sztornozva
     order by lekerdezve_at asc
     limit $1`,
    [MAX_NYITOTT_FRISSITES_KORONKENT]
  );
  for (const sor of sorok) {
    const talalat = await lekerdezSzamla(sor.szamlaszam, agentKulcs);
    if (talalat) await mentSzamla(talalat);
  }
}

/**
 * A Számlázz.hu-ban rögzített kifizetések (<kifizetesek><kifizetes> —
 * készpénzes számláknál kiállításkor automatikusan kitöltött) alapján a
 * TELJESEN kifizetett, még nyitott számlák "Fizetve"-re állítása, a
 * legutolsó kifizetés dátumával. Csak nyitottat állít fizetettre, visszafelé
 * soha nem ír (a kézi jelölés mindig megmarad).
 */
async function jelolRogzitettKifizeteseket(): Promise<number> {
  const sorok = await query<{ id: string; brutto: string; raw_xml: string }>(
    `select id::text, (brutto + helyesbites_osszeg)::text as brutto, raw_xml
     from szamla
     where not fizetve and not sztorno and not sztornozva
       and raw_xml like '%<kifizetes>%'`
  );
  let jelolve = 0;
  for (const sor of sorok) {
    let osszeg = 0;
    let utolsoDatum: string | null = null;
    for (const blokk of sor.raw_xml.matchAll(/<kifizetes>([\s\S]*?)<\/kifizetes>/g)) {
      const o = Number(blokk[1].match(/<osszeg>([^<]*)<\/osszeg>/)?.[1]?.replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(o)) osszeg += o;
      const d = blokk[1].match(/<datum>(\d{4}-\d{2}-\d{2})<\/datum>/)?.[1];
      if (d && (!utolsoDatum || d > utolsoDatum)) utolsoDatum = d;
    }
    if (osszeg > 0 && osszeg >= Number(sor.brutto) - 0.5) {
      await query(
        `update szamla
         set fizetve = true,
             fizetve_datum = coalesce(($2::date)::timestamp at time zone 'Europe/Budapest', now())
         where id = $1 and not fizetve`,
        [sor.id, utolsoDatum]
      );
      jelolve++;
    }
  }
  return jelolve;
}

const FUTAS_KULCS = Symbol.for("wwp.szamlak.szinkronFolyamatban");
type FutasTarolo = { [FUTAS_KULCS]?: Promise<PollEredmeny> | null };

/**
 * Egy teljes lekérdezési kör. Egyszerre csak egy futhat: ha az ütemező
 * (15 percenként) vagy a "Frissítés most" gomb egy még futó kör közben hívja,
 * ugyanarra a futásra vár, nem indít egy párhuzamosat. (globalThis-en tárolva,
 * mert az instrumentation és a server action külön modul-példányt kaphat.)
 */
export function futtatSzamlaSzinkron(): Promise<PollEredmeny> {
  const tarolo = globalThis as FutasTarolo;
  if (!tarolo[FUTAS_KULCS]) {
    tarolo[FUTAS_KULCS] = futtatSzamlaSzinkronKor().finally(() => {
      tarolo[FUTAS_KULCS] = null;
    });
  }
  return tarolo[FUTAS_KULCS];
}

/** 0) a fő kereső helyreállítása, 1) a pending sorszámok újrapróbálása, 2) a fő kereső előrehaladása, ... */
async function futtatSzamlaSzinkronKor(): Promise<PollEredmeny> {
  const agentKulcs = process.env.SZAMLAZZHU_API_KEY;
  const eredmeny: PollEredmeny = { ujMegtalalt: 0, pendingMegoldva: 0, hibak: [] };
  if (!agentKulcs) {
    eredmeny.hibak.push("SZAMLAZZHU_API_KEY nincs beállítva — a szinkron kihagyva.");
    return eredmeny;
  }

  const ev = budapestEv();

  // 0) A fő kereső állása sosem lehet a ténylegesen megtalált front előtt.
  const frontok = new Map<string, number>();
  for (const elotag of ELOTAGOK) {
    frontok.set(elotag, await helyreallitFrontot(elotag, ev));
  }

  // 1) Pending sorszámok — ezek a fő kereső állásától FÜGGETLENÜL, minden
  // körben újra próbálkoznak, amíg meg nem oldódnak vagy fel nem adjuk őket.
  const pendingSorok = await query<{
    szamlaszam: string;
    eloszor_probalt_at: string;
  }>(`select szamlaszam, eloszor_probalt_at from szamlak_poll_pending where feladva = false`);

  for (const sor of pendingSorok) {
    const napokElotte = (Date.now() - new Date(sor.eloszor_probalt_at).getTime()) / (1000 * 60 * 60 * 24);
    try {
      const talalat = await lekerdezSzamla(sor.szamlaszam, agentKulcs);
      if (talalat) {
        await mentSzamla(talalat);
        await torolPendingbol(sor.szamlaszam);
        eredmeny.pendingMegoldva++;
      } else if (napokElotte >= FELADAS_NAPOK) {
        await query(`update szamlak_poll_pending set feladva = true where szamlaszam = $1`, [sor.szamlaszam]);
      } else {
        await felveszPendingbe(sor.szamlaszam);
      }
    } catch (err) {
      eredmeny.hibak.push(
        `${sor.szamlaszam}: ${err instanceof SzamlazzHuError ? err.message : "ismeretlen hiba"}`
      );
    }
  }

  // 2) A fő kereső előrehaladása — új, még sosem próbált sorszámok,
  // ELŐTAGONKÉNT KÜLÖN-KÜLÖN (egymástól független sorszámozás). Az állás
  // CSAK egy ténylegesen megtalált számláig lép előre: a közbülső "nem
  // található" sorszámok (lyukak) a pending listába kerülnek, a legutolsó
  // találat UTÁNI hiányok viszont nem — azokat a következő kör újra, újként
  // próbálja, így a kereső nem szalad a valós front elé.
  for (const elotag of ELOTAGOK) {
    let utolsoSorszam = frontok.get(elotag) ?? 0;
    let probaSorszam = utolsoSorszam;
    let hianyzok: string[] = [];

    for (let i = 0; i < MAX_UJ_PROBALKOZAS_KORONKENT; i++) {
      const kovetkezo = probaSorszam + 1;
      probaSorszam = kovetkezo;
      const szamlaszam = `${elotag}-${ev}-${kovetkezo}`;
      try {
        const talalat = await lekerdezSzamla(szamlaszam, agentKulcs);
        if (talalat) {
          await mentSzamla(talalat);
          for (const hiany of hianyzok) await felveszPendingbe(hiany);
          hianyzok = [];
          utolsoSorszam = kovetkezo;
          eredmeny.ujMegtalalt++;
        } else {
          hianyzok.push(szamlaszam);
          if (hianyzok.length >= MAX_EGYMASUTANI_HIANY) break;
        }
      } catch (err) {
        eredmeny.hibak.push(
          `${szamlaszam}: ${err instanceof SzamlazzHuError ? err.message : "ismeretlen hiba"}`
        );
        break; // hálózati/kulcs-hiba esetén ne pörgessük tovább feleslegesen
      }
    }

    await query(
      `insert into szamlak_poll_allapot (elotag, ev, utolso_sorszam, utolso_futas_at)
       values ($1, $2, $3, now())
       on conflict (elotag) do update set ev = $2, utolso_sorszam = $3, utolso_futas_at = now()`,
      [elotag, ev, utolsoSorszam]
    );
  }

  // 2b) Nyitott számlák lassú újralekérdezése (utólag rögzített kifizetés).
  try {
    await frissitNyitottSzamlakat(agentKulcs);
  } catch (err) {
    eredmeny.hibak.push(
      `Nyitott számlák frissítése: ${err instanceof Error ? err.message : "ismeretlen hiba"}`
    );
  }

  // 3) A korábbi rendelesszam-parsing hiba miatt null-lal mentett
  // fuvarszámlák pótlólagos, korlátozott ütemű újralekérdezése — lásd
  // javitRendelesszamHianyokat.
  try {
    eredmeny.rendelesszamJavitva = (await dekodoljRendelesszamokat()) + (await javitRendelesszamHianyokat(agentKulcs));
  } catch (err) {
    eredmeny.hibak.push(
      `Rendelésszám-javítás: ${err instanceof Error ? err.message : "ismeretlen hiba"}`
    );
  }

  // 4) Rontott/sztornózott számla-párok újrafelismerése — minden kör végén,
  // hogy egy frissen behúzott vagy kézzel importált (pl. tömeges fizetve-
  // import) adat is azonnal helyesen legyen jelölve.
  const sztornoEredmeny = await frissitSztornoJelolest();
  eredmeny.sztornoDarab = sztornoEredmeny.sztornoDarab;

  // 4b) A Számlázz.hu-ban rögzített teljes kifizetésű (pl. készpénzes) számlák
  // automatikus "Fizetve" jelölése — a sztornó-jelölés UTÁN, hogy a
  // helyesbített összeggel számoljon.
  try {
    eredmeny.kifizetesJelolve = await jelolRogzitettKifizeteseket();
  } catch (err) {
    eredmeny.hibak.push(
      `Kifizetés-jelölés: ${err instanceof Error ? err.message : "ismeretlen hiba"}`
    );
  }

  // 4c) Számlázz.hu-s szállítólevelek (S-WLLWR-…) behúzása, és párosításuk a
  // saját fuvarokhoz (a párosítás a `szallitolevel_import` táblából dolgozik).
  try {
    await szallitolevelekKeresese(agentKulcs, ev, eredmeny);
    eredmeny.szallitolevelParositva = await szinkronizalSzallitoleveleket();
  } catch (err) {
    eredmeny.hibak.push(`Szállítólevelek: ${err instanceof Error ? err.message : "ismeretlen hiba"}`);
  }

  // 5) A Fuvarozás — Számla/Posta fülön a bér fuvarok "Számla szám" mezőjének
  // automatikus kitöltése a most már meglévő fuvarszámlák alapján (a
  // megbízó hivatkozási száma ↔ a számla rendelésszáma párosítással).
  try {
    eredmeny.szamlaSzamParositva = await szinkronizalSzamlaSzamokat();
  } catch (err) {
    eredmeny.hibak.push(
      `Fuvar számlaszám-párosítás: ${err instanceof Error ? err.message : "ismeretlen hiba"}`
    );
  }

  return eredmeny;
}
