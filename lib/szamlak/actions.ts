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

/** Egy kategórián (és Raklapnál alkategórián) belüli számlalista, esedékesség szerint rendezve. */
export async function getSzamlak(kategoria: SzamlaKategoria): Promise<SzamlaRow[]> {
  return query<SzamlaRow>(
    `select ${SZAMLA_COLUMNS}
     from szamla
     where kategoria = $1
     order by fizetve asc, fizetesi_hatarido asc nulls last, kiallitas_datum desc
     limit 500`,
    [kategoria]
  );
}

/** Kategóriánkénti (Raklapnál alkategóriánkénti) kintlévőség-összesítő, pénznemenként külön. */
export async function getSzamlaOsszesito(): Promise<SzamlaOsszesitoSor[]> {
  return query<SzamlaOsszesitoSor>(
    `select
       kategoria, alkategoria, penznem,
       coalesce(sum(brutto) filter (where not fizetve), 0) as nyitott_osszeg,
       coalesce(sum(brutto) filter (where not fizetve and fizetesi_hatarido < current_date), 0) as lejart_osszeg,
       count(*) filter (where not fizetve) as nyitott_darab,
       count(*) filter (where not fizetve and fizetesi_hatarido < current_date) as lejart_darab
     from szamla
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

export type SzamlaAllapot = {
  utolso_futas_at: string | null;
  ev: number;
  utolso_sorszam: number;
  pending_darab: number;
};

/** A Kezdőlap/Számlák fejlécéhez: mikor futott le legutóbb a szinkron, hol tart. */
export async function getSzamlaSzinkronAllapot(): Promise<SzamlaAllapot> {
  const allapot = (
    await query<{ utolso_futas_at: string | null; ev: number; utolso_sorszam: number }>(
      `select utolso_futas_at::text, ev, utolso_sorszam from szamlak_poll_allapot where id = 1`
    )
  )[0] ?? { utolso_futas_at: null, ev: new Date().getFullYear(), utolso_sorszam: 0 };
  const pending = (
    await query<{ n: number }>(`select count(*)::int as n from szamlak_poll_pending where feladva = false`)
  )[0];
  return { ...allapot, pending_darab: pending?.n ?? 0 };
}
