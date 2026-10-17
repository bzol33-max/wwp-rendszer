"use server";

// Hét nézet B1 (docs/het-b1-terv.md): nem-fuvar bejegyzés felvitele és
// törlése. A logika és az ellenőrzés: lib/fuvarozas2/bejegyzes-alap.ts.

import { revalidatePath } from "next/cache";
import { requireEditPermission } from "@/lib/auth/require-permission";
import { requireSession } from "@/lib/auth/dal";
import { query } from "@/lib/db";
import { ellenorizBejegyzes, torlesTerv, type BejegyzesBemenet, type TorlesMod } from "@/lib/fuvarozas2/bejegyzes-alap";

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

export async function torolBejegyzes(
  id: string, mod: TorlesMod = "egesz", alkalom: string | null = null
): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const ki = session.name ?? session.username;
  if (!/^\d{1,18}$/.test(String(id))) return { ok: false, hiba: "Hibás azonosító." };
  const m: TorlesMod = mod === "alkalom" || mod === "ettol" ? mod : "egesz";
  const sorok = await query<{ nap: string; ismetles: "nincs" | "heti"; ismetles_ig: string | null; kihagyott: string[] }>(
    `select to_char(nap, 'YYYY-MM-DD') as nap, ismetles, to_char(ismetles_ig, 'YYYY-MM-DD') as ismetles_ig,
            array(select to_char(d, 'YYYY-MM-DD') from unnest(kihagyott) d) as kihagyott
       from fuvar_bejegyzesek where id = $1 and torolt_at is null`,
    [id]
  );
  const s = sorok[0];
  if (!s) return { ok: false, hiba: "A bejegyzés már nincs meg." };
  const terv = torlesTerv(
    { id, jarmuKod: "", tipus: "egyeb", nap: s.nap, tol: null, ig: null, hely: null, megjegyzes: null, ismetles: s.ismetles, ismetlesIg: s.ismetles_ig, kihagyott: s.kihagyott },
    m, alkalom != null ? String(alkalom) : null
  );
  if (terv.muvelet === "hiba") return { ok: false, hiba: terv.hiba };
  const frissitve =
    terv.muvelet === "torol"
      ? await query(`update fuvar_bejegyzesek set torolt_at = now(), torolte = $2 where id = $1 and torolt_at is null returning id`, [id, ki])
      : terv.muvelet === "kihagy"
        ? await query(`update fuvar_bejegyzesek set kihagyott = array(select distinct unnest(kihagyott || $2::date) order by 1) where id = $1 and torolt_at is null returning id`, [id, terv.nap])
        : await query(`update fuvar_bejegyzesek set ismetles_ig = $2::date where id = $1 and torolt_at is null and nap <= $2::date returning id`, [id, terv.ig]);
  revalidatePath("/fuvarozas2/tervezes");
  return frissitve.length ? { ok: true } : { ok: false, hiba: "Nem sikerült törölni." };
}
