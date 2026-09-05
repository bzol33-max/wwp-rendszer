"use server";

import { query } from "@/lib/db";
import type { KapcsolatRow, AddKapcsolatInput } from "@/lib/fuvarozas/kapcsolatok-constants";
import { KAPCSOLATOK_SEED } from "@/lib/fuvarozas/kapcsolatok-seed-data";
import { KAPCSOLATOK_FIXES, KAPCSOLATOK_UJ } from "@/lib/fuvarozas/kapcsolatok-fix-data";

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

/**
 * IDEIGLENES: a Gmail "Fuvarmegbízás" címkével ellátott levelek (406 levél /
 * 189 szál) alapján végzett pontosítási kör. Javítja a korábban hibásan
 * rögzített adatokat (pl. Hajdúspedíció e-mail/név), és felveszi az újonnan
 * azonosított partnereket/kapcsolattartókat
 * (lib/fuvarozas/kapcsolatok-fix-data.ts). Kézzel, a UI-ból indítható, és
 * duplikáció ellen véd: egy javítás csak akkor fut le, ha a régi érték még
 * megvan, egy új sor pedig csak akkor kerül be, ha ugyanaz a cég+e-mail
 * (vagy cég+kapcsolattartó) kombináció még nincs a táblában. Miután lefutott,
 * ez a függvény, a hívása és a kapcsolatok-fix-data.ts is törölhető.
 */
export async function fixKapcsolatok(): Promise<{ updated: number; inserted: number; skippedInserted: number }> {
  let updated = 0;
  for (const fix of KAPCSOLATOK_FIXES) {
    const rows = await query<{ id: string }>(
      fix.match.kapcsolattarto !== undefined
        ? `select id::text from fuvar_kapcsolatok where ceg = $1 and kapcsolattarto = $2`
        : `select id::text from fuvar_kapcsolatok where ceg = $1`,
      fix.match.kapcsolattarto !== undefined ? [fix.match.ceg, fix.match.kapcsolattarto] : [fix.match.ceg]
    );
    for (const row of rows) {
      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const [key, value] of Object.entries(fix.patch)) {
        sets.push(`${key} = $${i}`);
        params.push(value);
        i++;
      }
      if (sets.length === 0) continue;
      params.push(row.id);
      await query(`update fuvar_kapcsolatok set ${sets.join(", ")} where id = $${i}`, params);
      updated++;
    }
  }

  let inserted = 0;
  let skippedInserted = 0;
  for (const entry of KAPCSOLATOK_UJ) {
    const existing = await query<{ n: number }>(
      entry.email
        ? `select count(*)::int as n from fuvar_kapcsolatok where ceg = $1 and email = $2`
        : `select count(*)::int as n from fuvar_kapcsolatok where ceg = $1 and kapcsolattarto = $2`,
      entry.email ? [entry.ceg, entry.email] : [entry.ceg, entry.kapcsolattarto ?? null]
    );
    if (existing[0].n > 0) {
      skippedInserted++;
      continue;
    }
    await addKapcsolat(entry);
    inserted++;
  }

  return { updated, inserted, skippedInserted };
}
