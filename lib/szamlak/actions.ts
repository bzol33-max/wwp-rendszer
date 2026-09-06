"use server";

// FIGYELEM: "use server" fájl — csak async függvényeket exportálhat, lásd
// lib/fuvarozas/megbizasok.ts mintáját. Típusok: szamla-constants.ts.

import { query } from "@/lib/db";
import { futtatSzamlaSzinkron, type PollEredmeny } from "./poll";
import type { SzamlaKategoria, SzamlaOsszesitoSor, SzamlaRow } from "./szamla-constants";

const TIME_FMT = "YYYY-MM-DD";

const SZAMLA_COLUMNS = `
  id::text, szamlaszam, vevo_nev, rendelesszam, fizmod, penznem,
  to_char(teljesites_datum, '${TIME_FMT}') as teljesites_datum,
  to_char(kiallitas_datum, '${TIME_FMT}') as kiallitas_datum,
  to_char(fizetesi_hatarido, '${TIME_FMT}') as fizetesi_hatarido,
  netto, afa, brutto, kategoria, alkategoria, tetelek_szoveg,
  fizetve, fizetve_datum::text, lekerdezve_at::text
`;

/**
 * Egy kategórián (és Raklapnál alkategórián) belüli számlalista, esedékesség
 * szerint rendezve. A rontott/sztornózott számla-párok (lib/szamlak/sztorno.ts)
 * ki vannak zárva — sem az eredeti (hibás) számla, sem a hozzá tartozó
 * negatív törlő/helyesbítő tétel nem jelenik meg itt, hogy ne látszódjon
 * tévesen "Fizetve"-ként a hibás összeg.
 */
export async function getSzamlak(kategoria: SzamlaKategoria): Promise<SzamlaRow[]> {
  return query<SzamlaRow>(
    `select ${SZAMLA_COLUMNS}
     from szamla
     where kategoria = $1
       and not sztorno
       and not sztornozva
     order by fizetve asc, fizetesi_hatarido asc nulls last, kiallitas_datum desc
     limit 500`,
    [kategoria]
  );
}

export type SzamlaEgyebCegSor = {
  vevo_nev: string;
  penznem: string;
  nyitott_osszeg: number;
  lejart_osszeg: number;
  nyitott_darab: number;
  lejart_darab: number;
};

/**
 * A "Raklap — Egyéb" alkategória (minden olyan vevő, aki nem Fabrika/Keter)
 * cégenkénti bontása — enélkül egyetlen, sokféle vevőt összemosó számban
 * veszne el az információ, hogy melyik partnernél van kintlévőség.
 */
export async function getSzamlaEgyebCegenkent(): Promise<SzamlaEgyebCegSor[]> {
  return query<SzamlaEgyebCegSor>(
    `select
       vevo_nev, penznem,
       coalesce(sum(brutto) filter (where not fizetve), 0) as nyitott_osszeg,
       coalesce(sum(brutto) filter (where not fizetve and fizetesi_hatarido < current_date), 0) as lejart_osszeg,
       count(*) filter (where not fizetve) as nyitott_darab,
       count(*) filter (where not fizetve and fizetesi_hatarido < current_date) as lejart_darab
     from szamla
     where kategoria = 'raklap'
       and alkategoria = 'egyeb'
       and not sztorno
       and not sztornozva
     group by vevo_nev, penznem
     having count(*) filter (where not fizetve) > 0
     order by nyitott_osszeg desc`
  );
}

export type SzamlaLejaratLista = {
  /** A legközelebbi (még nem lejárt) esedékességű, nyitott számlák, max. 10 db. */
  kovetkezo: SzamlaRow[];
  /** Az összes lejárt esedékességű, nyitott számla, a legrégebben lejárt elöl. */
  lejart: SzamlaRow[];
  lejartOsszesen: number;
};

/**
 * Kategóriánkénti (Fuvar/Raklap) gyors lejárat-áttekintés a Kezdőlap-szerű
 * csempékhez: a legközelebbi 10 esedékesség, plusz az összes lejárt tétel —
 * a sztornó-párok itt is ki vannak zárva.
 */
export async function getSzamlaLejaratLista(kategoria: SzamlaKategoria): Promise<SzamlaLejaratLista> {
  const kovetkezo = await query<SzamlaRow>(
    `select ${SZAMLA_COLUMNS}
     from szamla
     where kategoria = $1
       and not fizetve
       and not sztorno
       and not sztornozva
       and (fizetesi_hatarido is null or fizetesi_hatarido >= current_date)
     order by fizetesi_hatarido asc nulls last, kiallitas_datum desc
     limit 10`,
    [kategoria]
  );
  const lejart = await query<SzamlaRow>(
    `select ${SZAMLA_COLUMNS}
     from szamla
     where kategoria = $1
       and not fizetve
       and not sztorno
       and not sztornozva
       and fizetesi_hatarido < current_date
     order by fizetesi_hatarido asc
     limit 50`,
    [kategoria]
  );
  const lejartOsszesen = (
    await query<{ n: number }>(
      `select count(*)::int as n
       from szamla
       where kategoria = $1 and not fizetve and not sztorno and not sztornozva and fizetesi_hatarido < current_date`,
      [kategoria]
    )
  )[0]?.n ?? 0;

  return { kovetkezo, lejart, lejartOsszesen };
}

/** Kategóriánkénti (Raklapnál alkategóriánkénti) kintlévőség-összesítő, pénznemenként külön — a sztornó-párok nélkül. */
export async function getSzamlaOsszesito(): Promise<SzamlaOsszesitoSor[]> {
  return query<SzamlaOsszesitoSor>(
    `select
       kategoria, alkategoria, penznem,
       coalesce(sum(brutto) filter (where not fizetve), 0) as nyitott_osszeg,
       coalesce(sum(brutto) filter (where not fizetve and fizetesi_hatarido < current_date), 0) as lejart_osszeg,
       count(*) filter (where not fizetve) as nyitott_darab,
       count(*) filter (where not fizetve and fizetesi_hatarido < current_date) as lejart_darab
     from szamla
     where not sztorno and not sztornozva
     group by kategoria, alkategoria, penznem
     order by kategoria, alkategoria nulls first, penznem`
  );
}

/** "Fizetve" jelölés — kézi, mert a Számlázz.hu nem küld fizetettségi visszajelzést ehhez a workflow-hoz. */
export async function jeloltFizetve(id: string) {
  await query(`update szamla set fizetve = true, fizetve_datum = now() where id = $1`, [id]);
}

/** Visszavonás — csak az 5 perces ablakon belül van értelme (a UI ez alapján kínálja fel). */
export async function visszavonFizetve(id: string) {
  await query(`update szamla set fizetve = false, fizetve_datum = null where id = $1`, [id]);
}

/** A "Frissítés most" gomb: azonnal lefuttat egy szinkron kört, a napszaktól függetlenül. */
export async function frissitesMost(): Promise<PollEredmeny> {
  return futtatSzamlaSzinkron();
}

export type SzamlaElotagAllapot = {
  elotag: string;
  utolso_futas_at: string | null;
  ev: number;
  utolso_sorszam: number;
};

export type SzamlaAllapot = {
  /** A legkésőbbi futás időpontja az összes előtag közül (a fejléc egyetlen összefoglaló üzenetéhez). */
  utolso_futas_at: string | null;
  pending_darab: number;
  /** Rontott/sztornózott számlaként felismert és a listákból kizárt tételek száma (mindkét fél együtt). */
  sztorno_darab: number;
  /** Előtagonkénti részletes állapot (hol tart melyik számlatömb sorszám-keresője). */
  elotagok: SzamlaElotagAllapot[];
};

/** A Kezdőlap/Számlák fejlécéhez: mikor futott le legutóbb a szinkron, hol tart — minden ismert előtagra. */
export async function getSzamlaSzinkronAllapot(): Promise<SzamlaAllapot> {
  const elotagok = await query<SzamlaElotagAllapot>(
    `select elotag, utolso_futas_at::text, ev, utolso_sorszam from szamlak_poll_allapot order by elotag`
  );
  const pending = (
    await query<{ n: number }>(`select count(*)::int as n from szamlak_poll_pending where feladva = false`)
  )[0];
  const sztorno = (
    await query<{ n: number }>(`select count(*)::int as n from szamla where sztorno or sztornozva`)
  )[0];
  const utolsoFutasAt = elotagok
    .map((e) => e.utolso_futas_at)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1) ?? null;
  return {
    utolso_futas_at: utolsoFutasAt,
    pending_darab: pending?.n ?? 0,
    sztorno_darab: sztorno?.n ?? 0,
    elotagok,
  };
}
