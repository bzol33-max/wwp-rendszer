"use server";

// Hét nézet B1 (docs/het-b1-terv.md): nem-fuvar bejegyzés felvitele és
// törlése. A logika és az ellenőrzés: lib/fuvarozas2/bejegyzes-alap.ts.

import { revalidatePath } from "next/cache";
import { requireEditPermission } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { query } from "@/lib/db";
import { ellenorizBejegyzes, type BejegyzesBemenet } from "@/lib/fuvarozas2/bejegyzes-alap";

export async function ujBejegyzes(be: BejegyzesBemenet): Promise<{ ok: true; id: string } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const kodok = (await query<{ kod: string }>(`select kod from fuvar_jarmuvek where aktiv`)).map((r) => r.kod);
  const r = ellenorizBejegyzes(
    {
      jarmuKod: String(be?.jarmuKod ?? ""), tipus: String(be?.tipus ?? ""), nap: String(be?.nap ?? ""), egeszNap: be?.egeszNap === true,
      tol: be?.tol != null ? String(be.tol) : null, ig: be?.ig != null ? String(be.ig) : null,
      hely: be?.hely != null ? String(be.hely) : null, megjegyzes: be?.megjegyzes != null ? String(be.megjegyzes) : null,
      ismetles: be?.ismetles != null ? String(be.ismetles) : null, ismetlesIg: be?.ismetlesIg != null ? String(be.ismetlesIg) : null,
    },
    kodok
  );
  if (!r.ok) return r;
  const v = r.ertek;
  const sor = await query<{ id: string }>(
    `insert into fuvar_bejegyzesek (jarmu_kod, tipus, nap, tol, ig, hely, megjegyzes, ismetles, ismetles_ig, letrehozta)
     values ($1, $2, $3::date, $4::time, $5::time, $6, $7, $8, $9::date, $10)
     returning id::text`,
    [v.jarmuKod, v.tipus, v.nap, v.tol, v.ig, v.hely, v.megjegyzes, v.ismetles, v.ismetlesIg, session.name ?? session.username]
  );
  revalidatePath("/fuvarozas2/tervezes");
  return { ok: true, id: sor[0].id };
}

export async function torolBejegyzes(id: string): Promise<{ ok: boolean }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  if (!/^\d+$/.test(String(id))) return { ok: false };
  const sor = await query<{ id: string }>(
    `update fuvar_bejegyzesek set torolt_at = now(), torolte = $2 where id = $1 and torolt_at is null returning id::text`,
    [id, session.name ?? session.username]
  );
  revalidatePath("/fuvarozas2/tervezes");
  return { ok: sor.length > 0 };
}
