"use server";

// Fuvarozás 2 — partner-törzs (2.1) és az E5 kézi rendezés: névváltozatok
// összevonása. Az összevonás a megbízásokat és a kapcsolatokat a megtartott
// partnerre írja át, a beolvasztott partner nevét a nevvaltozatok-ba teszi
// (a jövőbeli import így már pontos kulccsal talál), és naplóz.

import { pool, query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyViewPermission, requireEditPermission } from "@/lib/auth/require-permission";
import { normalizaltCegKulcs } from "@/lib/fuvarozas/fuvar-constants";

export type Partner = {
  id: string;
  nev: string;
  nev_kulcs: string;
  nevvaltozatok: string[];
  szekhely: string | null;
  szamlazasi_cim: string | null;
  postazasi_cim: string | null;
  szamlazasi_email: string | null;
  fizetesi_hatarido_nap: number | null;
  papir_bekuldesi_hatarido_nap: number | null;
  szamlan_kert_szam: string;
  sablon_azonosito: string | null;
  szamla_email_nem_kell: boolean;
  posta_nem_kell: boolean;
  megbizas_pdf_csatolva: boolean;
  email_domainek: string[];
  megjegyzes: string | null;
  megbizas_db: number;
  utolso_megbizas: string | null;
};

export async function getPartnerek(): Promise<Partner[]> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  return query<Partner>(
    `select p.id::text, p.nev, p.nev_kulcs, p.nevvaltozatok, p.szekhely, p.szamlazasi_cim, p.postazasi_cim, p.szamlazasi_email,
       p.fizetesi_hatarido_nap, p.papir_bekuldesi_hatarido_nap, p.szamlan_kert_szam, p.sablon_azonosito,
       p.szamla_email_nem_kell, p.posta_nem_kell, p.megbizas_pdf_csatolva, p.email_domainek, p.megjegyzes,
       (select count(*) from fuvar_megbizasok m where m.partner_id = p.id and m.torolt_at is null)::int as megbizas_db,
       (select to_char(max(m.datum), 'YYYY-MM-DD') from fuvar_megbizasok m where m.partner_id = p.id) as utolso_megbizas
     from fuvar_partnerek p
     order by megbizas_db desc, p.nev`
  );
}

/** Összevonási javaslatok: ugyanaz a rövidített kulcs (cégforma és írásjelek nélkül), vagy az egyik a másik előtagja. */
export async function getOsszevonasJavaslatok(): Promise<{ a: Partner; b: Partner; indok: string }[]> {
  const partnerek = await getPartnerek();
  const rovid = (k: string) => k.replace(/(kft|zrt|bt|nyrt|ev|gmbh|sro|srl|ltd|kkt)$/g, "").replace(/[^a-z0-9]/g, "");
  const out: { a: Partner; b: Partner; indok: string }[] = [];
  for (let i = 0; i < partnerek.length; i++) {
    for (let j = i + 1; j < partnerek.length; j++) {
      const a = partnerek[i], b = partnerek[j];
      const ra = rovid(a.nev_kulcs), rb = rovid(b.nev_kulcs);
      if (!ra || !rb) continue;
      if (ra === rb) out.push({ a, b, indok: "ugyanaz a név cégforma nélkül" });
      else if ((ra.length >= 6 && rb.startsWith(ra)) || (rb.length >= 6 && ra.startsWith(rb))) out.push({ a, b, indok: "az egyik a másik rövidítése" });
    }
  }
  return out;
}

export async function updatePartner(id: string, mezok: Partial<Omit<Partner, "id" | "nev_kulcs" | "megbizas_db" | "utolso_megbizas">>): Promise<void> {
  await requireEditPermission("fuvarozas");
  const engedett = ["nev", "nevvaltozatok", "szekhely", "szamlazasi_cim", "postazasi_cim", "szamlazasi_email", "fizetesi_hatarido_nap",
    "papir_bekuldesi_hatarido_nap", "szamlan_kert_szam", "sablon_azonosito", "szamla_email_nem_kell", "posta_nem_kell", "megbizas_pdf_csatolva", "email_domainek", "megjegyzes"] as const;
  const set: string[] = [];
  const par: unknown[] = [id];
  for (const k of engedett) {
    if (!(k in mezok)) continue;
    par.push((mezok as Record<string, unknown>)[k]);
    set.push(`${k} = $${par.length}`);
    if (k === "nev") {
      par.push(normalizaltCegKulcs(String(mezok.nev ?? "")));
      set.push(`nev_kulcs = $${par.length}`);
    }
  }
  if (set.length === 0) return;
  set.push("frissitve_at = now()");
  await query(`update fuvar_partnerek set ${set.join(", ")} where id = $1`, par);
}

/** E5: a `forrasIds` partnereket a `celId`-be olvasztja. */
export async function osszevonPartnereket(celId: string, forrasIds: string[]): Promise<{ megbizasok: number }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const ki = session.name ?? session.username;
  const forras = forrasIds.filter((x) => x !== celId);
  if (forras.length === 0) return { megbizasok: 0 };
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: nevek } = await client.query<{ nev: string; nevvaltozatok: string[] }>(`select nev, nevvaltozatok from fuvar_partnerek where id = any($1::bigint[])`, [forras]);
    const { rowCount } = await client.query(`update fuvar_megbizasok set partner_id = $1 where partner_id = any($2::bigint[])`, [celId, forras]);
    await client.query(`update fuvar_kapcsolatok set partner_id = $1 where partner_id = any($2::bigint[])`, [celId, forras]);
    await client.query(`update radar_kiiras set partner_id = $1 where partner_id = any($2::bigint[])`, [celId, forras]);
    await client.query(`delete from partner_pontszam where partner_id = any($1::bigint[])`, [forras]);
    const valtozatok = nevek.flatMap((n) => [n.nev, ...n.nevvaltozatok]);
    await client.query(
      `update fuvar_partnerek set nevvaltozatok = (select array_agg(distinct v) from unnest(nevvaltozatok || $2::text[]) v), frissitve_at = now() where id = $1`,
      [celId, valtozatok]
    );
    await client.query(`delete from fuvar_partnerek where id = any($1::bigint[])`, [forras]);
    await client.query(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek)
       select m.id, 'modositva', 'ember', $2, $3 from fuvar_megbizasok m where m.partner_id = $1 and m.torolt_at is null`,
      [celId, ki, JSON.stringify({ partner_osszevonas: valtozatok })]
    );
    await client.query("commit");
    return { megbizasok: rowCount ?? 0 };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
