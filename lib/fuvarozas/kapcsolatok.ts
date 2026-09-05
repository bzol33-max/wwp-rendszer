"use server";

import { query } from "@/lib/db";
import type { KapcsolatRow, AddKapcsolatInput } from "@/lib/fuvarozas/kapcsolatok-constants";
import { KAPCSOLATOK_SEED } from "@/lib/fuvarozas/kapcsolatok-seed-data";

export async function getKapcsolatok(): Promise<KapcsolatRow[]> {
  return query<KapcsolatRow>(
    `select id::text, ceg, kapcsolattarto, telefon, email, megjegyzes, forras
     from fuvar_kapcsolatok
     order by ceg asc, kapcsolattarto asc nulls last, id asc`
  );
}

export async function addKapcsolat(input: AddKapcsolatInput) {
  await query(
    `insert into fuvar_kapcsolatok (ceg, kapcsolattarto, telefon, email, megjegyzes, forras)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.ceg,
      input.kapcsolattarto || null,
      input.telefon || null,
      input.email || null,
      input.megjegyzes || null,
      input.forras || null,
    ]
  );
}

export async function deleteKapcsolat(id: string) {
  await query(`delete from fuvar_kapcsolatok where id = $1`, [id]);
}

/**
 * IDEIGLENES: a Drive "Fuvarmegbizások" mappájából (és a hozzájuk tartozó
 * e-mailekből) egyszer kinyert partner-kapcsolatok feltöltése
 * (lib/fuvarozas/kapcsolatok-seed-data.ts). Csak a UI-ból, kézzel
 * indítható, és csak akkor tölt fel, ha a tábla még üres — miután lefutott,
 * ez a függvény, a hívása és az adatfájl is törölhető.
 */
export async function seedKapcsolatok(): Promise<{ inserted: number; skipped: boolean }> {
  const existing = await query<{ n: number }>(`select count(*)::int as n from fuvar_kapcsolatok`);
  if (existing[0].n > 0) {
    return { inserted: 0, skipped: true };
  }
  for (const entry of KAPCSOLATOK_SEED) {
    await addKapcsolat(entry);
  }
  return { inserted: KAPCSOLATOK_SEED.length, skipped: false };
}
