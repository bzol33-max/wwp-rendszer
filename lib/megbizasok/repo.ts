import "server-only";
import { query, withTransaction, type Querier } from "@/lib/db";
import type { AtmenetKontextus } from "@/lib/megbizasok/allapotgep";
import type { Megallo, MegbizasSor } from "@/lib/fuvarozas2/megbizasok";

/** Új modellű, jelölő-trigger nélkül futó tranzakció (2026-10-06). */
export async function ujKodTranzakcio<T>(fn: (tx: Querier) => Promise<T>): Promise<T> {
  return withTransaction(async (tx) => {
    await tx(`select set_config('fuvarozas2.uj_kod', '1', true)`);
    return fn(tx);
  });
}

export async function irEsemenyt(tx: Querier, adat: {
  megbizasId: string; esemeny: string; allapotElott?: string | null; allapotUtan?: string | null;
  forras: string; ki?: string | null; reszletek?: Record<string, unknown>; kliensUuid?: string | null;
}) {
  const kliens = adat.kliensUuid ? ", kliens_uuid" : "";
  const extra = adat.kliensUuid ? ", $8" : "";
  return tx(
    `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek${kliens})
     values ($1, $2, $3, $4, $5, $6, $7${extra})${adat.kliensUuid ? " on conflict (kliens_uuid) do nothing" : ""}`,
    [adat.megbizasId, adat.esemeny, adat.allapotElott ?? null, adat.allapotUtan ?? null, adat.forras, adat.ki ?? null, JSON.stringify(adat.reszletek ?? {}), ...(adat.kliensUuid ? [adat.kliensUuid] : [])]
  );
}

export async function elszamolasUpsert(tx: Querier, megbizasId: string, mezok: {
  szamlaSzam: string | null; szamlaId: string | null; szamlaKelte: string | null;
}) {
  return tx(
    `insert into fuvar_elszamolas (megbizas_id, szamla_szam, szamla_id, szamla_kelte)
     values ($1, $2, $3, $4) on conflict (megbizas_id) do update set
     szamla_szam = excluded.szamla_szam, szamla_id = excluded.szamla_id, szamla_kelte = excluded.szamla_kelte, frissitve_at = now()`,
    [megbizasId, mezok.szamlaSzam, mezok.szamlaId, mezok.szamlaKelte]
  );
}

export const SOR_SQL = `
  select m.id::text, m.jelleg, m.allapot, m.allapot_at::text, m.partner_id::text, m.rakott_km::float8 as rakott_km,
    coalesce(p.nev, m.megrendelo) as partner_nev, m.kitol,
    coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas, m.hivatkozas_nincs,
    j.kod as jarmu_kod, coalesce(j.cimke, m.jarmu) as jarmu_cimke, coalesce(a.name, m.sofor) as sofor,
    coalesce((select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1), m.felrako) as felrako,
    coalesce((select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1), m.lerako) as lerako,
    to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap,
    to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
    (select count(*) from fuvar_megallok g where g.megbizas_id = m.id)::int as megallo_db,
    m.fuvardij, m.fuvardij_penznem, m.aru, m.mennyiseg, m.hianylista, m.forras,
    (m.torolt_at is not null) as torolt,
    coalesce(e.papirok_beerkeztek_at, m.papirok_beerkeztek_at)::text as papirok_beerkeztek_at,
    coalesce(e.szamla_szam, m.szamla_szam) as szamla_szam, m.kieg_szamla_szamok,
    e.email_elment_at::text,
    coalesce(e.postazva_at, case when m.postazva then m.postazva_at end)::text as postazva_at,
    coalesce(e.postazasi_cim, m.postazasi_cim, p.postazasi_cim) as postazasi_cim,
    coalesce(e.fizetesi_hatarido_nap, m.fizetesi_hatarido_nap, p.fizetesi_hatarido_nap) as fizetesi_hatarido_nap,
    p.papir_bekuldesi_hatarido_nap as papir_hatarido_nap,
    exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = m.id and d.tipus = 'fuvarlevel') as foto_van,
    m.dokumentum_url, m.megjegyzes, m.elokeszites, m.elokeszites_jarmu,
    (select s.bizonylatszam from szallitolevel_import s where s.megbizas_id = m.id and s.parositas_allapot = 'parositva' order by s.kelt desc limit 1) as szallitolevel
  from fuvar_megbizasok m
  left join fuvar_partnerek p on p.id = m.partner_id
  left join fuvar_jarmuvek j on j.id = m.jarmu_id
  left join alkalmazottak a on a.id = m.sofor_id
  left join fuvar_elszamolas e on e.megbizas_id = m.id
`;

/** Az állapotgép-ellenőrzés DB-ből vett kontextusa (megállók, partner, szállítólevél). */
export async function kontextus(sor: MegbizasSor, megallok?: Megallo[]): Promise<AtmenetKontextus> {
  const m = megallok ?? (await query<Megallo>(`select gps_erkezes::text, sofor_kesz_at::text from fuvar_megallok where megbizas_id = $1`, [sor.id]));
  const [p] = sor.partner_id
    ? await query<{ szamla_email_nem_kell: boolean; posta_nem_kell: boolean }>(`select szamla_email_nem_kell, posta_nem_kell from fuvar_partnerek where id = $1`, [sor.partner_id])
    : [undefined];
  const [sz] = await query<{ n: string }>(`select count(*) as n from szallitolevel_import where megbizas_id = $1 and parositas_allapot = 'parositva'`, [sor.id]);
  return {
    sajatFuvar: sor.jelleg === "sajat",
    gpsErintesVolt: m.some((x) => x.gps_erkezes || x.sofor_kesz_at),
    szamlaVan: !!sor.szamla_szam,
    fotoVan: sor.foto_van,
    emailElment: !!sor.email_elment_at,
    papirBeerkezett: !!sor.papirok_beerkeztek_at,
    postazva: !!sor.postazva_at,
    partnerNemKerEmailt: p?.szamla_email_nem_kell ?? false,
    partnerNemKerPostat: p?.posta_nem_kell ?? false,
    szallitolevelParositva: Number(sz?.n ?? 0) > 0,
    torolt: sor.torolt,
  };
}

/** A bérfuvar-űrlap mezői egy megbízásra. */
export const BER_SQL = `
  select to_char(m.datum, 'YYYY-MM-DD') as datum, coalesce(to_char(m.lerakas_datum, 'YYYY-MM-DD'), '') as "lerakasDatum",
    coalesce(m.idopont, '') as idopont, coalesce(m.felrako, '') as felrako, coalesce(m.lerako, '') as lerako,
    coalesce(m.megrendelo, '') as megrendelo, coalesce(m.pozicioszam, '') as pozicioszam, m.pozicioszam_nincs as "pozicioszamNincs",
    coalesce(m.aru, '') as aru, coalesce(m.mennyiseg, '') as mennyiseg, coalesce(m.suly, '') as suly,
    coalesce(m.jarmu, '') as jarmu, coalesce(m.sofor, '') as sofor,
    coalesce(m.fuvardij::text, '') as fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as "fuvardijPenznem",
    coalesce(m.koltseg::text, '') as koltseg, coalesce(m.megjegyzes, '') as megjegyzes,
    coalesce(e.postazasi_cim, m.postazasi_cim, '') as "postazasiCim"
  from fuvar_megbizasok m left join fuvar_elszamolas e on e.megbizas_id = m.id
  where m.id = $1 and m.jelleg = 'ber' and m.torolt_at is null`;
