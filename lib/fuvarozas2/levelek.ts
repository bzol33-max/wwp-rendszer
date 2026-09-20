"use server";

// Fuvarozás 2 — a Levelek fül olvasó/író rétege.

import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyViewPermission, requireAnyEditPermission } from "@/lib/auth/require-permission";
import type { LevelOsztaly } from "@/lib/fuvarozas2/level-osztalyozo";

export type LevelSor = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  felado: string;
  felado_nev: string | null;
  targy: string | null;
  snippet: string | null;
  erkezett: string;
  csatolmany_nevek: string[];
  osztaly: LevelOsztaly;
  kezi_osztaly: LevelOsztaly | null;
  bizalom: number;
  indoklas: string[];
  partner_nev: string | null;
  hivatkozas: string | null;
  rendszam: string | null;
  csatolmany_kell: boolean;
  csatolmany_megjott_at: string | null;
  drive_url: string | null;
  megbizas_id: string | null;
  allapot: string;
  allapot_by: string | null;
};

export async function getLevelek(szuro: { allapot?: string; osztalyok?: string[]; limit?: number } = {}): Promise<LevelSor[]> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const felt: string[] = ["1=1"];
  const par: unknown[] = [];
  if (szuro.allapot) { par.push(szuro.allapot); felt.push(`l.allapot = $${par.length}`); }
  if (szuro.osztalyok?.length) { par.push(szuro.osztalyok); felt.push(`coalesce(l.kezi_osztaly, l.osztaly) = any($${par.length}::text[])`); }
  return query<LevelSor>(
    `select l.id::text, l.gmail_message_id, l.gmail_thread_id, l.felado, l.felado_nev, l.targy, l.snippet,
       l.erkezett::text, l.csatolmany_nevek, l.osztaly, l.kezi_osztaly, l.bizalom, l.indoklas,
       coalesce(p.nev, l.partner_kod) as partner_nev, l.hivatkozas, l.rendszam,
       l.csatolmany_kell, l.csatolmany_megjott_at::text, l.drive_url, l.megbizas_id::text, l.allapot, l.allapot_by
     from fuvar_level l left join fuvar_partnerek p on p.id = l.partner_id
     where ${felt.join(" and ")}
     order by l.erkezett desc
     limit ${Math.min(szuro.limit ?? 200, 500)}`,
    par
  );
}

export type FigyeloAllapot = { utolso_eletjel?: string; utolso_bevetel?: string; utolso_darab?: number };

export async function getFigyeloAllapot(): Promise<FigyeloAllapot & { beallitva: boolean; osszesen: number; mai: number; eletjelPerce: number | null }> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [a] = await query<{ ertek: FigyeloAllapot }>(`select ertek from gmail_figyelo_allapot where kulcs = 'figyelo'`);
  const [sz] = await query<{ osszesen: number; mai: number }>(
    `select count(*)::int as osszesen,
      count(*) filter (where erkezett >= (now() at time zone 'Europe/Budapest')::date)::int as mai from fuvar_level`
  );
  const eletjel = a?.ertek?.utolso_eletjel ? Date.parse(a.ertek.utolso_eletjel) : NaN;
  return {
    ...(a?.ertek ?? {}),
    beallitva: !!a,
    osszesen: sz?.osszesen ?? 0,
    mai: sz?.mai ?? 0,
    eletjelPerce: Number.isNaN(eletjel) ? null : Math.round((Date.now() - eletjel) / 60000),
  };
}

/** Ember átsorolja a levelet (a determinisztikus szabály tanul belőle: a naplóban látszik). */
export async function setLevelOsztaly(id: string, osztaly: LevelOsztaly): Promise<void> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  const session = await requireSession();
  const kell = osztaly === "megbizas" || osztaly === "papirok";
  await query(
    `update fuvar_level set kezi_osztaly = $2, allapot_by = $3, allapot_at = now(),
       csatolmany_kell = case when $4 and csatolmany_megjott_at is null and array_length(csatolmany_nevek, 1) > 0 then true else csatolmany_kell end
     where id = $1`,
    [id, osztaly, session.name ?? session.username, kell]
  );
}

export async function setLevelAllapot(id: string, allapot: "uj" | "feldolgozva" | "elvetve" | "megvalaszolva"): Promise<void> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  const session = await requireSession();
  await query(
    `update fuvar_level set allapot = $2, allapot_by = $3, allapot_at = now(),
       csatolmany_kell = case when $2 = 'elvetve' then false else csatolmany_kell end where id = $1`,
    [id, allapot, session.name ?? session.username]
  );
}

/** „Kérem a csatolmányt" — a figyelő a következő körben feltölti a Drive-ba. */
export async function kerCsatolmanyt(id: string): Promise<void> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  await query(`update fuvar_level set csatolmany_kell = true where id = $1 and csatolmany_megjott_at is null`, [id]);
}
