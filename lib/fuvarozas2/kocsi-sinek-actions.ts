"use server";

// Havi kiadás és havi cél kézi beírása a Megbízások havi sávján (2026-11-18,
// Q5b-F terv). Csak fuvarozás-szerkesztő írhatja; a részletezés később.

import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireEditPermission } from "@/lib/auth/require-permission";

export async function mentHaviBeallitasAction(ev: number, ho: number, kiadasFt: number | null, celFt: number | null): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  if (!Number.isInteger(ev) || ev < 2024 || ev > 2100 || !Number.isInteger(ho) || ho < 1 || ho > 12) return { ok: false, hiba: "Érvénytelen hónap." };
  const szam = (x: number | null) => (x == null ? null : Number.isFinite(x) && x >= 0 && x < 1e12 ? Math.round(x) : undefined);
  const k = szam(kiadasFt), c = szam(celFt);
  if (k === undefined || c === undefined) return { ok: false, hiba: "Az összeg 0 és 1 000 milliárd Ft között legyen." };
  const session = await requireSession();
  await query(
    `insert into fuvar_havi_beallitas (ev, ho, kiadas_ft, cel_ft, updated_by)
     values ($1, $2, $3, $4, $5)
     on conflict (ev, ho) do update set kiadas_ft = excluded.kiadas_ft, cel_ft = excluded.cel_ft, updated_by = excluded.updated_by, updated_at = now()`,
    [ev, ho, k, c, session.name ?? session.username]
  );
  return { ok: true };
}
