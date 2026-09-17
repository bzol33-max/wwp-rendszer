"use server";

// FIGYELEM: "use server" fájl — csak async függvényeket exportálhat, lásd
// lib/fuvarozas/megbizasok.ts mintáját. Típusok: szamla-constants.ts.

import { query } from "@/lib/db";
import { requireEditPermission } from "@/lib/auth/require-permission";
import { futtatSzamlaSzinkron, type PollEredmeny } from "./poll";
import type {
  SzamlaAlkategoria,
  SzamlaHaviBevetelSor,
  SzamlaKategoria,
  SzamlaKiemeltStatisztika,
  SzamlaOsszesitoSor,
  SzamlaRow,
} from "./szamla-constants";

const TIME_FMT = "YYYY-MM-DD";

/** A budapesti "ma" — a DB munkamenet UTC-ben fut, a current_date éjfél és 2 óra között még a tegnapot adná. */
const MA_SQL = `(now() at time zone 'Europe/Budapest')::date`;
/** Forintos számla: a Számlázz.hu a pénznemet "Ft"-ként küldi (<devizanem>), nem "HUF"-ként. */
const HUF_SQL = `penznem in ('Ft', 'HUF')`;
/** A részleges (negatív) helyesbítésekkel csökkentett összeg — lásd sztorno.ts. */
const BRUTTO_SQL = `(brutto + helyesbites_osszeg)`;

const SZAMLA_COLUMNS = `
  id::text, szamlaszam, vevo_nev, rendelesszam, fizmod, penznem,
  to_char(teljesites_datum, '${TIME_FMT}') as teljesites_datum,
  to_char(kiallitas_datum, '${TIME_FMT}') as kiallitas_datum,
  to_char(fizetesi_hatarido, '${TIME_FMT}') as fizetesi_hatarido,
  netto, afa, ${BRUTTO_SQL} as brutto, kategoria, alkategoria, tetelek_szoveg,
  fizetve, fizetve_datum::text, lekerdezve_at::text
`;

export type SzamlaListaSzuro = {
  /** undefined = minden kategória (pl. a Kifizetett-listánál nincs értelme kategóriára szűrni). */
  kategoria?: SzamlaKategoria;
  /** undefined = nem szűr alkategóriára; null = kifejezetten az alkategória nélküli (pl. Fuvar) sorokra. */
  alkategoria?: SzamlaAlkategoria | null;
  vevoNev?: string;
  penznem?: string;
  /** true = kiállítás dátuma szerint, időrendben (a legrégebbi elöl) — pl. a több céget összefogó "Egyéb" csempénél hasznos. */
  idorendben?: boolean;
  /** true = csak a kifizetett számlák (a "Kifizetve" összecsukott szekcióhoz). */
  csakFizetve?: boolean;
  /** Csak a nyitott (nem fizetett) számlák — a felső Nyitott/Lejárt/7 napos csempékhez. */
  csakNyitott?: boolean;
  /** "lejart" = a határidő elmúlt; "het" = ma és ma+7 nap között esedékes. */
  hatarido?: "lejart" | "het";
};

/**
 * Egy csempére kattintva megnyíló, szűrt számlalista (kategória, alkategória,
 * vevő és/vagy pénznem szerint), alapesetben esedékesség szerint rendezve
 * (vagy időrendben, ha a szuro.idorendben be van kapcsolva). A rontott/
 * sztornózott számla-párok (lib/szamlak/sztorno.ts) ki vannak zárva.
 */
export async function getSzamlaLista(szuro: SzamlaListaSzuro): Promise<SzamlaRow[]> {
  const feltetelek: string[] = ["not sztorno", "not sztornozva"];
  const parameterek: unknown[] = [];

  if (szuro.kategoria) {
    parameterek.push(szuro.kategoria);
    feltetelek.push(`kategoria = $${parameterek.length}`);
  }
  if (szuro.alkategoria === null) {
    feltetelek.push("alkategoria is null");
  } else if (szuro.alkategoria !== undefined) {
    parameterek.push(szuro.alkategoria);
    feltetelek.push(`alkategoria = $${parameterek.length}`);
  }
  if (szuro.vevoNev) {
    parameterek.push(szuro.vevoNev);
    feltetelek.push(`vevo_nev = $${parameterek.length}`);
  }
  if (szuro.penznem) {
    parameterek.push(szuro.penznem);
    feltetelek.push(`penznem = $${parameterek.length}`);
  }
  if (szuro.csakFizetve) {
    feltetelek.push("fizetve");
  }
  if (szuro.csakNyitott) {
    feltetelek.push("not fizetve");
  }
  if (szuro.hatarido === "lejart") {
    feltetelek.push(`fizetesi_hatarido < ${MA_SQL}`);
  } else if (szuro.hatarido === "het") {
    feltetelek.push(`fizetesi_hatarido between ${MA_SQL} and ${MA_SQL} + 7`);
  }

  const rendezes = szuro.idorendben
    ? "kiallitas_datum asc, szamlaszam asc"
    : szuro.csakFizetve
      ? "fizetve_datum desc"
      : "fizetve asc, fizetesi_hatarido asc nulls last, kiallitas_datum desc";

  return query<SzamlaRow>(
    `select ${SZAMLA_COLUMNS}
     from szamla
     where ${feltetelek.join(" and ")}
     order by ${rendezes}
     limit 500`,
    parameterek
  );
}

export type SzamlaFejlecSor = {
  penznem: string;
  nyitott_osszeg: number;
  nyitott_darab: number;
  lejart_osszeg: number;
  lejart_darab: number;
  /** A ma és ma+7 nap között esedékes, nyitott számlák. */
  het_osszeg: number;
  het_darab: number;
};

/** A Számlák oldal felső 3 csempéjéhez (Nyitott / Lejárt / 7 napon belül esedékes), pénznemenként. */
export async function getSzamlaFejlec(): Promise<SzamlaFejlecSor[]> {
  return query<SzamlaFejlecSor>(
    `select
       penznem,
       coalesce(sum(${BRUTTO_SQL}), 0)::float8 as nyitott_osszeg,
       count(*)::int as nyitott_darab,
       coalesce(sum(${BRUTTO_SQL}) filter (where fizetesi_hatarido < ${MA_SQL}), 0)::float8 as lejart_osszeg,
       count(*) filter (where fizetesi_hatarido < ${MA_SQL})::int as lejart_darab,
       coalesce(sum(${BRUTTO_SQL}) filter (where fizetesi_hatarido between ${MA_SQL} and ${MA_SQL} + 7), 0)::float8 as het_osszeg,
       count(*) filter (where fizetesi_hatarido between ${MA_SQL} and ${MA_SQL} + 7)::int as het_darab
     from szamla
     where not fizetve and not sztorno and not sztornozva
     group by penznem
     order by case when penznem in ('Ft', 'HUF') then 0 else 1 end, penznem`
  );
}

export type SzamlaTeendok = {
  /** Az összes lejárt, nyitott számla (minden kategória), a legrégebben lejárt elöl. */
  lejart: SzamlaRow[];
  /** A legközelebbi 10 (még nem lejárt) esedékesség, minden kategóriából. */
  kovetkezo: SzamlaRow[];
};

/**
 * A "Teendők" lista: a korábbi 4 külön tábla (Fuvar/Raklap × Következő/Lejárt)
 * helyett egyetlen, kategória-címkés lista — a sztornó-párok itt is ki vannak zárva.
 */
export async function getSzamlaTeendok(): Promise<SzamlaTeendok> {
  const [lejart, kovetkezo] = await Promise.all([
    query<SzamlaRow>(
      `select ${SZAMLA_COLUMNS}
       from szamla
       where not fizetve and not sztorno and not sztornozva
         and fizetesi_hatarido < ${MA_SQL}
       order by fizetesi_hatarido asc
       limit 200`
    ),
    query<SzamlaRow>(
      `select ${SZAMLA_COLUMNS}
       from szamla
       where not fizetve and not sztorno and not sztornozva
         and (fizetesi_hatarido is null or fizetesi_hatarido >= ${MA_SQL})
       order by fizetesi_hatarido asc nulls last, kiallitas_datum desc
       limit 10`
    ),
  ]);
  return { lejart, kovetkezo };
}

/**
 * Az összes lejárt esedékességű, nyitott számla, kategóriától függetlenül,
 * a legrégebben lejárt elöl — az Áttekintés (lib/attekintes/actions.ts)
 * "Számlák" csempéjéhez és a hozzá tartozó részletes listához.
 */
export async function getOsszesLejartSzamla(): Promise<SzamlaRow[]> {
  return query<SzamlaRow>(
    `select ${SZAMLA_COLUMNS}
     from szamla
     where not fizetve
       and not sztorno
       and not sztornozva
       and fizetesi_hatarido < ${MA_SQL}
     order by fizetesi_hatarido asc
     limit 300`
  );
}

/** Kategóriánkénti (Raklapnál alkategóriánkénti) kintlévőség-összesítő, pénznemenként külön — a sztornó-párok nélkül. */
export async function getSzamlaOsszesito(): Promise<SzamlaOsszesitoSor[]> {
  return query<SzamlaOsszesitoSor>(
    `select
       kategoria, alkategoria, penznem,
       coalesce(sum(${BRUTTO_SQL}) filter (where not fizetve), 0) as nyitott_osszeg,
       coalesce(sum(${BRUTTO_SQL}) filter (where not fizetve and fizetesi_hatarido < ${MA_SQL}), 0) as lejart_osszeg,
       count(*) filter (where not fizetve) as nyitott_darab,
       count(*) filter (where not fizetve and fizetesi_hatarido < ${MA_SQL}) as lejart_darab
     from szamla
     where not sztorno and not sztornozva
     group by kategoria, alkategoria, penznem
     having count(*) filter (where not fizetve) > 0
     order by kategoria, alkategoria nulls first, penznem`
  );
}

function budapestHonap(): number {
  return Number(new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "numeric" }).format(new Date()));
}

/**
 * Havi bevétel-bontás (Fuvar/Raklap, csak HUF) a folyó évre, a fejléc
 * diagramjához — kiállítás dátuma szerint, csak a már ténylegesen eltelt
 * hónapokra (nincs kitalált előrejelzés a jövőbeli hónapokra).
 */
export async function getSzamlaHaviBevetel(): Promise<SzamlaHaviBevetelSor[]> {
  const sorok = await query<{ honap: number; kategoria: SzamlaKategoria; osszeg: number }>(
    `select
       extract(month from kiallitas_datum)::int as honap,
       kategoria,
       sum(${BRUTTO_SQL})::float8 as osszeg
     from szamla
     where ${HUF_SQL}
       and not sztorno and not sztornozva
       and extract(year from kiallitas_datum) = extract(year from ${MA_SQL})
       and kiallitas_datum <= ${MA_SQL}
     group by honap, kategoria`
  );

  const jelenlegiHonap = budapestHonap();
  const map = new Map<number, SzamlaHaviBevetelSor>();
  for (let h = 1; h <= jelenlegiHonap; h++) {
    map.set(h, { honap: h, fuvar: 0, raklap: 0, osszes: 0 });
  }
  for (const s of sorok) {
    const sor = map.get(s.honap);
    if (!sor) continue;
    if (s.kategoria === "fuvar") sor.fuvar = s.osszeg;
    else sor.raklap = s.osszeg;
    sor.osszes = sor.fuvar + sor.raklap;
  }
  return [...map.values()];
}

/** A diagram alatti statisztika-sorhoz és a Nyitott csempe "legnagyobb vevő" sorához — csak HUF adatok. */
export async function getSzamlaKiemeltStatisztika(): Promise<SzamlaKiemeltStatisztika> {
  const legnagyobbVevo = await query<{ vevo_nev: string; osszeg: number }>(
    `select vevo_nev, sum(${BRUTTO_SQL})::float8 as osszeg
     from szamla
     where not fizetve and not sztorno and not sztornozva and ${HUF_SQL}
     group by vevo_nev
     order by osszeg desc
     limit 1`
  );

  const havi = await getSzamlaHaviBevetel();
  const evesYtdHuf = havi.reduce((sum, h) => sum + h.osszes, 0);
  // A folyó hónap még félkész — az átlagba és a növekedésbe csak a lezárt
  // hónapok számítanak, különben hó elején mindig hamis visszaesést mutatna.
  const lezartHonapok = havi.slice(0, -1);
  const haviAtlagHuf =
    lezartHonapok.length > 0 ? lezartHonapok.reduce((sum, h) => sum + h.osszes, 0) / lezartHonapok.length : 0;

  let csucsHonap: number | null = null;
  let csucsHonapOsszegHuf = 0;
  for (const h of havi) {
    if (h.osszes > csucsHonapOsszegHuf) {
      csucsHonapOsszegHuf = h.osszes;
      csucsHonap = h.honap;
    }
  }

  let novekedesSzazalek: number | null = null;
  if (lezartHonapok.length >= 2) {
    const utolso = lezartHonapok[lezartHonapok.length - 1];
    const elozo = lezartHonapok[lezartHonapok.length - 2];
    if (elozo.osszes > 0) {
      novekedesSzazalek = ((utolso.osszes - elozo.osszes) / elozo.osszes) * 100;
    }
  }

  return {
    evesYtdHuf,
    haviAtlagHuf,
    csucsHonap,
    csucsHonapOsszegHuf,
    novekedesSzazalek,
    legnagyobbNyitottVevo: legnagyobbVevo[0]?.vevo_nev ?? null,
    legnagyobbNyitottVevoOsszegHuf: legnagyobbVevo[0]?.osszeg ?? 0,
  };
}

export type SzamlaKifizetettOsszesitoSor = {
  penznem: string;
  osszeg: number;
  darab: number;
};

/** A "Kifizetve" összecsukott szekció fejlécéhez — darabszám és összeg pénznemenként. */
export async function getKifizetettOsszesito(): Promise<SzamlaKifizetettOsszesitoSor[]> {
  return query<SzamlaKifizetettOsszesitoSor>(
    `select penznem, sum(${BRUTTO_SQL})::float8 as osszeg, count(*)::int as darab
     from szamla
     where fizetve and not sztorno and not sztornozva
     group by penznem
     order by penznem`
  );
}

/** "Fizetve" jelölés — kézi, mert a Számlázz.hu nem küld fizetettségi visszajelzést ehhez a workflow-hoz. */
export async function jeloltFizetve(id: string) {
  await requireEditPermission("szamlak");
  await query(`update szamla set fizetve = true, fizetve_datum = now() where id = $1`, [id]);
}

/** Visszavonás — csak az 5 perces ablakon belül van értelme (a UI ez alapján kínálja fel). */
export async function visszavonFizetve(id: string) {
  await requireEditPermission("szamlak");
  await query(`update szamla set fizetve = false, fizetve_datum = null where id = $1`, [id]);
}

/** A "Frissítés most" gomb: azonnal lefuttat egy szinkron kört, a napszaktól függetlenül. */
export async function frissitesMost(): Promise<PollEredmeny> {
  await requireEditPermission("szamlak");
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
