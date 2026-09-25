"use server";

// Fuvarozás 2 — a megbízások olvasó/író rétege az ÚJ modellen
// (fuvar_megbizasok.allapot + fuvar_megallok + fuvar_elszamolas +
// fuvar_megbizas_esemeny + fuvar_partnerek). Terv: claude/fuvarozas-atallas-
// ellenorzes.md 11.1 (átmenetek) és 9. (elszámolás).
//
// KETTŐS ÍRÁS a cutoverig: minden állapotváltás a RÉGI jelölőket is írja
// (teljesitve, postazva, papirok_beerkeztek_at, szamla_szam, ellenorzott),
// hogy a régi Fuvarozás fülek ugyanazt mutassák. Az olvasás az elszámolás
// mezőit coalesce-szel veszi (új tábla, ha van; különben a régi oszlop).
// A régi kód írásait a 002 migráció triggere húzza át az allapot-ra.

import { pool, query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyViewPermission, requireAnyEditPermission } from "@/lib/auth/require-permission";
import {
  ellenorizAtmenet,
  lehetsegesCelok,
  lepesAllapotbol,
  type Allapot,
  type Lepes,
  type AtmenetForras,
  type AtmenetKontextus,
} from "@/lib/fuvarozas/allapot";
import { keresEgyezik, keresNapok, keresSzoveg, szakaszSorbol, type KeresoIndex, type Szakasz } from "@/lib/fuvarozas2/munkaasztal";
import { varosNev } from "@/lib/fuvarozas/varos";
import { megalloReszlete, type MegalloReszlet } from "@/lib/fuvarozas/sofor-adatok";
import { findJarmuByPlate } from "@/lib/fuvarozas/vehicles";

export type MegbizasSor = {
  id: string;
  jelleg: "ber" | "sajat";
  allapot: Allapot;
  allapot_at: string | null;
  partner_id: string | null;
  partner_nev: string | null;
  hivatkozas: string | null;
  hivatkozas_nincs: boolean;
  jarmu_kod: string | null;
  jarmu_cimke: string | null;
  sofor: string | null;
  felrako: string | null;
  lerako: string | null;
  felrakas_nap: string | null;
  lerakas_nap: string | null;
  megallo_db: number;
  fuvardij: number | null;
  fuvardij_penznem: string;
  aru: string | null;
  mennyiseg: string | null;
  hianylista: unknown[];
  forras: string;
  torolt: boolean;
  // elszámolás (coalesce új/régi)
  papirok_beerkeztek_at: string | null;
  szamla_szam: string | null;
  /** Kiegészítő számlák (pl. kiállási díj, „… kieg.”) — lib/fuvarozas/szamla-parositas.ts parositKiegSzamlakat. */
  kieg_szamla_szamok: string[];
  email_elment_at: string | null;
  postazva_at: string | null;
  postazasi_cim: string | null;
  fizetesi_hatarido_nap: number | null;
  /** A partner papír-beküldési határideje napban (a „Következő teendő" oszlophoz, D2). */
  papir_hatarido_nap: number | null;
  foto_van: boolean;
  dokumentum_url: string | null;
  megjegyzes: string | null;
  /** Saját fuvar előkészítésben (a sofőr még nem látja) — lib/fuvarozas2/sajat-fuvar.ts. */
  elokeszites: boolean;
  /** Az előkészítésben kiválasztott kocsi kódja (a `jarmu` csak a „Kocsira adom”-mal kap értéket). */
  elokeszites_jarmu: string | null;
  /** Saját fuvarhoz párosított Számlázz.hu-s szállítólevél (S-WLLWR-…) — lib/fuvarozas2/szallitolevel.ts. */
  szallitolevel: string | null;
};

const SOR_SQL = `
  select m.id::text, m.jelleg, m.allapot, m.allapot_at::text, m.partner_id::text,
    coalesce(p.nev, m.megrendelo) as partner_nev,
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

export async function getMegbizasok(szuro: {
  allapotok?: Allapot[];
  jelleg?: "ber" | "sajat";
  toroltIs?: boolean;
  limit?: number;
} = {}): Promise<MegbizasSor[]> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const felt: string[] = ["m.allapot is not null"];
  const par: unknown[] = [];
  if (!szuro.toroltIs) felt.push("m.torolt_at is null");
  if (szuro.allapotok?.length) {
    par.push(szuro.allapotok);
    felt.push(`m.allapot = any($${par.length}::text[])`);
  }
  if (szuro.jelleg) {
    par.push(szuro.jelleg);
    felt.push(`m.jelleg = $${par.length}`);
  }
  const limit = Math.min(szuro.limit ?? 500, 2000);
  return query<MegbizasSor>(`${SOR_SQL} where ${felt.join(" and ")} order by m.datum desc, m.id desc limit ${limit}`, par);
}

export type Megallo = {
  id: string;
  sorszam: number;
  tipus: "felrako" | "lerako";
  hely_tipus: string;
  cim_nyers: string;
  telepules: string | null;
  tervezett_nap: string | null;
  ablak_tol: string | null;
  ablak_ig: string | null;
  sofor_megerkezett_at: string | null;
  sofor_kesz_at: string | null;
  sofor_kesz_by: string | null;
  gps_erkezes: string | null;
  gps_tavozas: string | null;
};
export type Esemeny = {
  id: string;
  esemeny: string;
  allapot_elott: string | null;
  allapot_utan: string | null;
  forras: string;
  ki: string | null;
  mikor: string;
  reszletek: Record<string, unknown>;
};
export type Dokumentum = { id: string; tipus: string | null; fajlnev: string | null; dokumentum_url: string | null; created_at: string };

export async function getMegbizas(id: string): Promise<{
  sor: MegbizasSor;
  megallok: Megallo[];
  esemenyek: Esemeny[];
  dokumentumok: Dokumentum[];
  celok: Allapot[];
} | null> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [sor] = await query<MegbizasSor>(`${SOR_SQL} where m.id = $1`, [id]);
  if (!sor || !sor.allapot) return null;
  const [megallok, esemenyek, dokumentumok] = await Promise.all([
    query<Megallo>(
      `select id::text, sorszam, tipus, hely_tipus, cim_nyers, telepules, to_char(tervezett_nap, 'YYYY-MM-DD') as tervezett_nap,
         ablak_tol::text, ablak_ig::text, sofor_megerkezett_at::text, sofor_kesz_at::text, sofor_kesz_by, gps_erkezes::text, gps_tavozas::text
       from fuvar_megallok where megbizas_id = $1 order by sorszam`,
      [id]
    ),
    query<Esemeny>(
      `select id::text, esemeny, allapot_elott, allapot_utan, forras, ki, mikor::text, reszletek
       from fuvar_megbizas_esemeny where megbizas_id = $1 order by mikor desc, id desc limit 100`,
      [id]
    ),
    query<Dokumentum>(`select id::text, tipus, fajlnev, dokumentum_url, created_at::text from fuvar_dokumentumok where fuvar_id = $1 order by created_at`, [id]),
  ]);
  const k = await kontextus(sor, megallok);
  return { sor, megallok, esemenyek, dokumentumok, celok: lehetsegesCelok(sor.allapot, "ember", k) };
}

async function kontextus(sor: MegbizasSor, megallok?: Megallo[]): Promise<AtmenetKontextus> {
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

/** A „szamlazhato” kézi jelöléshez a fotó hiánya helyett a kézi döntés is elég (11.1/7). */
export async function valtAllapot(
  id: string,
  hova: Allapot,
  opciok: { kezi?: boolean; megjegyzes?: string; kliensUuid?: string } = {}
): Promise<{ ok: true; allapot: Allapot } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas", "elszamolas"]);
  const session = await requireSession();
  const [sor] = await query<MegbizasSor>(`${SOR_SQL} where m.id = $1`, [id]);
  if (!sor?.allapot) return { ok: false, hiba: "Nincs ilyen megbízás." };
  const k = await kontextus(sor);
  if (opciok.kezi && hova === "szamlazhato") k.fotoVan = true;
  // Saját fuvar kézi lezárása szállítólevél-párosítás nélkül (amíg a K2 kör
  // — szállítólevél-import — nincs meg): naplózva `kezi: true`-val.
  if (opciok.kezi && hova === "lezart" && sor.jelleg === "sajat") k.szallitolevelParositva = true;
  const forras: AtmenetForras = "ember";
  const e = ellenorizAtmenet(sor.allapot, hova, forras, k);
  if (!e.ok) return { ok: false, hiba: e.hiba };

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`select set_config('fuvarozas2.uj_kod', '1', true)`); // a 002 napló-trigger ne duplázzon
    // Kettős írás — a régi jelölők, hogy a régi fülek ugyanazt mondják.
    const regi: string[] = [];
    const par: unknown[] = [id, hova, session.name ?? session.username];
    const set = (sql: string) => regi.push(sql);
    switch (hova) {
      case "tervezett":
        set("ellenorzott = true");
        if (sor.allapot === "folyamatban") set("teljesitve = false, teljesitve_at = null");
        break;
      case "folyamatban":
        set("ellenorzott = true");
        break;
      case "teljesitve":
        set("ellenorzott = true, teljesitve = true, teljesitve_at = coalesce(teljesitve_at, now())");
        if (sor.allapot === "szamlazhato" || sor.allapot === "szamlazva") set("szamla_szam = null");
        break;
      case "szamlazhato":
        set("teljesitve = true, teljesitve_at = coalesce(teljesitve_at, now())");
        break;
      case "postazva":
        // A feladott papír a kézben volt: a beérkezés dátuma is beíródik.
        set("postazva = true, postazva_at = coalesce(postazva_at, now()), papirok_beerkeztek_at = coalesce(papirok_beerkeztek_at, now())");
        break;
      case "lezart":
        if (sor.jelleg === "ber") set("postazva = true, postazva_at = coalesce(postazva_at, now() - interval '6 minutes')");
        else set("teljesitve = true, teljesitve_at = coalesce(teljesitve_at, now())");
        break;
    }
    await client.query(
      `update fuvar_megbizasok set allapot = $2, allapot_at = now()${regi.length ? ", " + regi.join(", ") : ""} where id = $1`,
      [id, hova]
    );
    if (sor.jelleg === "ber") {
      await client.query(`insert into fuvar_elszamolas (megbizas_id) values ($1) on conflict (megbizas_id) do nothing`, [id]);
      if (hova === "postazva") await client.query(`update fuvar_elszamolas set postazva_at = coalesce(postazva_at, now()), postazva_by = $2, papirok_beerkeztek_at = coalesce(papirok_beerkeztek_at, now()), papirok_beerkeztek_by = coalesce(papirok_beerkeztek_by, $2), frissitve_at = now() where megbizas_id = $1`, [id, par[2]]);
      if (hova === "email_elment") await client.query(`update fuvar_elszamolas set email_elment_at = coalesce(email_elment_at, now()), email_elment_by = $2, frissitve_at = now() where megbizas_id = $1`, [id, par[2]]);
      if (hova === "teljesitve" && sor.allapot === "szamlazva") await client.query(`update fuvar_elszamolas set szamla_id = null, szamla_szam = null, szamla_kelte = null, frissitve_at = now() where megbizas_id = $1`, [id]);
    }
    const esemeny =
      hova === "teljesitve" && ["szamlazhato", "szamlazva"].includes(sor.allapot) ? "visszaallitas"
      : hova === "tervezett" && sor.allapot === "folyamatban" ? "visszaallitas"
      : hova === "postazva" && sor.allapot === "lezart" ? "visszaallitas"
      : hova === "tervezett" ? "jovahagyva"
      : hova === "folyamatban" ? "megerkezett"
      : hova === "teljesitve" ? "teljesitve"
      : hova === "szamlazhato" ? "szamlazhato"
      : hova === "szamlazva" ? "szamla_parositva"
      : hova === "email_elment" ? "szamla_email_elkuldve"
      : hova === "postazva" ? "postazva"
      : "lezart";
    await client.query(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek, kliens_uuid)
       values ($1, $4, $5, $2, 'ember', $3, $6, $7) on conflict do nothing`,
      [id, hova, par[2], esemeny, sor.allapot, JSON.stringify({ atmenet: e.atmenet.szam, megjegyzes: opciok.megjegyzes ?? null, kezi: !!opciok.kezi }), opciok.kliensUuid ?? null]
    );
    // „Postázva ✓” = kész (Budaházi Zoltán, 2026-09-25): a 11. él (számla +
    // postázva) ugyanitt lezárja, nem kell külön „Lezárás” gomb.
    const lezar = hova === "postazva" && sor.allapot !== "lezart" && ellenorizAtmenet("postazva", "lezart", "rendszer", { ...k, postazva: true }).ok;
    if (lezar) {
      await client.query(`update fuvar_megbizasok set allapot = 'lezart', allapot_at = now() where id = $1`, [id]);
      await client.query(
        `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, allapot_elott, allapot_utan, forras, ki, reszletek)
         values ($1, 'lezart', 'postazva', 'lezart', 'rendszer', $2, $3)`,
        [id, par[2], JSON.stringify({ atmenet: 11, automatikus: true })]
      );
    }
    await client.query("commit");
    if (lezar) return { ok: true, allapot: "lezart" };
    return { ok: true, allapot: hova };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Szabina: az eredeti papír beérkezett / visszavonva (B7). Nem állapotváltás — a 10. él feltétele. */
export async function setPapirBeerkezett(id: string, be: boolean): Promise<void> {
  await requireAnyEditPermission(["elszamolas", "fuvarozas"]);
  const session = await requireSession();
  const ki = session.name ?? session.username;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`insert into fuvar_elszamolas (megbizas_id) values ($1) on conflict (megbizas_id) do nothing`, [id]);
    await client.query(
      `update fuvar_elszamolas set papirok_beerkeztek_at = case when $2 then coalesce(papirok_beerkeztek_at, now()) else null end,
         papirok_beerkeztek_by = case when $2 then $3 else null end, frissitve_at = now() where megbizas_id = $1`,
      [id, be, ki]
    );
    await client.query(`update fuvar_megbizasok set papirok_beerkeztek_at = case when $2 then coalesce(papirok_beerkeztek_at, now()) else null end where id = $1`, [id, be]);
    await client.query(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'papir_beerkezett', 'ember', $2, $3)`,
      [id, ki, JSON.stringify({ beerkezett: be })]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Kézi számlaszám (a Számlázz.hu-szinkron helyett/mellett). Számlázható → számlázva átmenettel. */
export async function setSzamlaSzam(id: string, szamlaSzam: string | null): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["elszamolas", "fuvarozas"]);
  const session = await requireSession();
  const ki = session.name ?? session.username;
  const szam = szamlaSzam?.trim() || null;
  const [sz] = szam ? await query<{ id: string; kelt: string | null }>(`select id::text, to_char(kiallitas_datum, 'YYYY-MM-DD') as kelt from szamla where szamlaszam = $1`, [szam]) : [undefined];
  await query(`insert into fuvar_elszamolas (megbizas_id) values ($1) on conflict (megbizas_id) do nothing`, [id]);
  await query(
    `update fuvar_elszamolas set szamla_szam = $2, szamla_id = $3, szamla_kelte = $4,
       fizetesi_esedekesseg = case when $4::date is not null and fizetesi_hatarido_nap is not null then $4::date + fizetesi_hatarido_nap else fizetesi_esedekesseg end,
       frissitve_at = now() where megbizas_id = $1`,
    [id, szam, sz?.id ?? null, sz?.kelt ?? null]
  );
  await query(`update fuvar_megbizasok set szamla_szam = $2 where id = $1`, [id, szam]);
  await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'szamla_parositva', 'ember', $2, $3)`, [
    id, ki, JSON.stringify({ szamla_szam: szam, szamla_id: sz?.id ?? null }),
  ]);
  const [sor] = await query<{ allapot: Allapot }>(`select allapot from fuvar_megbizasok where id = $1`, [id]);
  if (szam && (sor?.allapot === "szamlazhato" || sor?.allapot === "teljesitve")) return (await valtAllapot(id, "szamlazva")).ok ? { ok: true } : { ok: false, hiba: "A számlaszám elmentve, de az állapot nem váltott." };
  if (!szam && sor?.allapot === "szamlazva") await valtAllapot(id, "teljesitve");
  return { ok: true };
}

/** Megjegyzés / szabad szöveges módosítás naplózva (a többi mező szerkesztése a régi részletben marad a cutoverig). */
export async function setMegjegyzes(id: string, megjegyzes: string | null): Promise<void> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  await query(`update fuvar_megbizasok set megjegyzes = $2 where id = $1`, [id, megjegyzes?.trim() || null]);
  await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'modositva', 'ember', $2, $3)`, [
    id, session.name ?? session.username, JSON.stringify({ mezo: "megjegyzes" }),
  ]);
}

/**
 * A Megbízások képernyő (tervvászon D2) egy lekérdezésben: a szűrt lista és
 * a bal oldali szűrősáv darabszámai. A számok MINDIG a teljes (nem szűrt)
 * halmazból jönnek, hogy a sáv ne ürüljön ki, amint az ember rákattint egyre.
 */
export async function getMegbizasokVaszon(szuro: {
  jelleg?: "ber" | "sajat";
  allapot?: Allapot;
  lepes?: Lepes;
  jarmu?: string;
  partner?: string;
  idoszak?: "ez_a_het" | "mult_het" | "regebbi" | "mind";
} = {}): Promise<{
  sorok: MegbizasSor[];
  ma: string;
  szamok: {
    jelleg: { ber: number; sajat: number };
    allapot: Record<string, number>;
    lepes: Record<string, number>;
    jarmu: { kod: string; cimke: string; n: number }[];
    jarmuNelkul: number;
    idoszak: Record<string, number>;
    mind: number;
  };
}> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);
  const mind = await query<MegbizasSor>(`${SOR_SQL} where m.allapot is not null and m.torolt_at is null order by coalesce(m.lerakas_datum, m.datum) desc, m.id desc limit 1000`);

  const { idoszakVodor } = await import("@/lib/fuvarozas2/megbizas-szuro");
  const allapot: Record<string, number> = {};
  const lepes: Record<string, number> = {};
  const idoszak: Record<string, number> = {};
  const jarmuMap = new Map<string, { kod: string; cimke: string; n: number }>();
  let ber = 0, sajat = 0, jarmuNelkul = 0;
  for (const s of mind) {
    allapot[s.allapot] = (allapot[s.allapot] ?? 0) + 1;
    const l = lepesAllapotbol(s.allapot);
    lepes[l] = (lepes[l] ?? 0) + 1;
    const v = idoszakVodor(s.lerakas_nap, ma);
    idoszak[v] = (idoszak[v] ?? 0) + 1;
    if (s.jelleg === "ber") ber++; else sajat++;
    if (s.jarmu_kod) {
      const e = jarmuMap.get(s.jarmu_kod) ?? { kod: s.jarmu_kod, cimke: s.jarmu_cimke ?? s.jarmu_kod, n: 0 };
      e.n++;
      jarmuMap.set(s.jarmu_kod, e);
    } else jarmuNelkul++;
  }

  const sorok = mind.filter((s) => {
    if (szuro.jelleg && s.jelleg !== szuro.jelleg) return false;
    if (szuro.allapot && s.allapot !== szuro.allapot) return false;
    if (szuro.lepes && lepesAllapotbol(s.allapot) !== szuro.lepes) return false;
    if (szuro.jarmu === "nincs" && s.jarmu_kod) return false;
    if (szuro.jarmu && szuro.jarmu !== "nincs" && s.jarmu_kod !== szuro.jarmu) return false;
    if (szuro.partner && s.partner_id !== szuro.partner) return false;
    if (szuro.idoszak && szuro.idoszak !== "mind" && idoszakVodor(s.lerakas_nap, ma) !== szuro.idoszak) return false;
    return true;
  });

  return {
    sorok, ma,
    szamok: {
      jelleg: { ber, sajat },
      allapot,
      lepes,
      jarmu: [...jarmuMap.values()].sort((a, b) => b.n - a.n),
      jarmuNelkul,
      idoszak,
      mind: mind.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Munkaasztal (2026-09-25): oldalsáv-szakaszok, kereső mindenre, és a
// „kocsi most” panel. A szakasz- és keresési szabály tiszta modulban van
// (lib/fuvarozas2/munkaasztal.ts, scripts/teszt-munkaasztal.ts).

export type MunkaasztalSor = MegbizasSor & { szakasz: Szakasz };

/**
 * A munkaasztal kocsijai: a törzs aktív járművei, a sofőr keresztnevével
 * (a törzsben ritkán van sofőr-hozzárendelés, ezért a saját járművek
 * listájából — vehicles.ts). A rendszám nélküli, gyártás alatti kocsi csak
 * akkor jelenik meg, ha van nyitott fuvarja.
 */
async function munkaasztalJarmuvei(): Promise<{ kod: string; cimke: string; sofor: string | null; rendszamos: boolean }[]> {
  const sorok = await query<{ kod: string; cimke: string; sofor: string | null }>(
    `select j.kod, j.cimke, a.name as sofor from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id where j.aktiv order by j.kod`
  );
  return sorok.map((j) => {
    const sajat = findJarmuByPlate(j.kod);
    return { ...j, sofor: sajat?.sofor ?? j.sofor?.split(" ").pop() ?? null, rendszamos: !!sajat };
  });
}

export async function getMunkaasztal(szuro: {
  szakasz?: Szakasz;
  jelleg?: "ber" | "sajat";
  kocsi?: string;
  q?: string;
}): Promise<{
  sorok: MunkaasztalSor[];
  ma: string;
  szamok: {
    szakasz: Record<Szakasz, number>;
    kocsik: { kod: string; cimke: string; sofor: string | null; n: number }[];
    kocsiNelkul: number;
    jelleg: { ber: number; sajat: number };
  };
  kereso: KeresoIndex;
}> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);
  const osszes = (await query<MegbizasSor>(
    `${SOR_SQL} where m.allapot is not null and m.torolt_at is null order by coalesce(m.lerakas_datum, m.datum) desc, m.id desc limit 3000`
  )).map((s) => ({ ...s, szakasz: szakaszSorbol(s) }));
  const jarmuvek = await munkaasztalJarmuvei();
  const soforKod = new Map(jarmuvek.map((j) => [j.kod, j.sofor]));

  const szakaszDb = { elokeszites: 0, beerkezett: 0, folyamatban: 0, szamlazasra: 0, postara: 0, archiv: 0 } as Record<Szakasz, number>;
  const kocsiDb = new Map<string, number>();
  let kocsiNelkul = 0, ber = 0, sajat = 0;
  for (const s of osszes) {
    if (s.jelleg === "ber") ber++; else sajat++;
    if (szuro.jelleg && s.jelleg !== szuro.jelleg) continue;
    szakaszDb[s.szakasz]++;
    if (s.szakasz === "folyamatban") {
      if (s.jarmu_kod) kocsiDb.set(s.jarmu_kod, (kocsiDb.get(s.jarmu_kod) ?? 0) + 1);
      else kocsiNelkul++;
    }
  }

  const q = szuro.q?.trim();
  const szakasz = szuro.szakasz ?? "folyamatban";
  let sorok = osszes.filter((s) => {
    if (szuro.jelleg && s.jelleg !== szuro.jelleg) return false;
    if (q) return keresEgyezik({ ...s, sofor: [s.sofor, s.jarmu_kod ? soforKod.get(s.jarmu_kod) : null].filter(Boolean).join(" ") }, q);
    if (s.szakasz !== szakasz) return false;
    if (szuro.kocsi === "nincs") return !s.jarmu_kod;
    if (szuro.kocsi) return s.jarmu_kod === szuro.kocsi;
    return true;
  });
  // Ami még előttünk van, időrendben; ami mögöttünk, a legújabb elöl.
  if (!q && (szakasz === "elokeszites" || szakasz === "beerkezett" || szakasz === "folyamatban")) {
    sorok = [...sorok].sort((a, b) => (a.felrakas_nap ?? "").localeCompare(b.felrakas_nap ?? "") || a.id.localeCompare(b.id));
  }

  return {
    sorok: sorok.slice(0, 300),
    ma,
    kereso: keresoIndex(osszes.filter((s) => !szuro.jelleg || s.jelleg === szuro.jelleg), jarmuvek, soforKod),
    szamok: {
      szakasz: szakaszDb,
      kocsik: jarmuvek
        .filter((j) => j.rendszamos || (kocsiDb.get(j.kod) ?? 0) > 0)
        .map((j) => ({ kod: j.kod, cimke: j.cimke, sofor: j.sofor, n: kocsiDb.get(j.kod) ?? 0 })),
      kocsiNelkul,
      jelleg: { ber, sajat },
    },
  };
}

/** A kereső javaslataihoz: a sorok kereshető szövege és a választható cégek, városok, kocsik, számok. */
function keresoIndex(
  sorok: (MegbizasSor & { szakasz: Szakasz })[],
  jarmuvek: { kod: string; sofor: string | null }[],
  soforKod: Map<string, string | null>
): KeresoIndex {
  const reszek = (cim: string | null) => (cim ?? "").split(/;|\s\+\s/).map((x) => x.trim()).filter(Boolean);
  const rovid = (cim: string | null) => {
    const v = varosNev(cim ?? "").trim();
    return v && v.length <= 32 ? v : (cim ?? "—").slice(0, 32);
  };
  const egyedi = (xs: (string | null | undefined)[]) => {
    const latott = new Map<string, string>();
    for (const x of xs) {
      const v = x?.trim();
      if (v && !latott.has(v.toLowerCase())) latott.set(v.toLowerCase(), v);
    }
    return [...latott.values()];
  };
  return {
    fuvarok: sorok.slice(0, 1500).map((s) => {
      const f = reszek(s.felrako);
      const l = reszek(s.lerako);
      return {
        id: s.id,
        cim: s.partner_nev ?? (s.jelleg === "sajat" ? "Saját fuvar" : "(nincs megbízó)"),
        ut: `${rovid(f[0] ?? null)} → ${rovid(l[l.length - 1] ?? null)}`,
        nap: s.felrakas_nap,
        szakasz: s.szakasz,
        szoveg: keresSzoveg({ ...s, sofor: [s.sofor, s.jarmu_kod ? soforKod.get(s.jarmu_kod) : null].filter(Boolean).join(" ") }),
        napok: keresNapok(s),
      };
    }),
    cegek: egyedi(sorok.map((s) => s.partner_nev)),
    varosok: egyedi(sorok.flatMap((s) => [...reszek(s.felrako), ...reszek(s.lerako)].map((c) => varosNev(c))))
      // Ha a címből nem jön ki városnév, a varosNev a teljes szöveget adja
      // („BMW HU Plant Debrecen”) — az nem város.
      .filter((v) => v.length >= 2 && v.length <= 32 && v.split(/\s+/).length <= 2),
    kocsik: jarmuvek.map((j) => ({ kod: j.kod, cimke: j.sofor ? `${j.sofor} · ${j.kod}` : j.kod })),
    szamok: egyedi(sorok.flatMap((s) => [s.szamla_szam, ...(s.kieg_szamla_szamok ?? []), s.szallitolevel, s.hivatkozas])),
  };
}

export type KocsiMostMegallo = {
  sorszam: number;
  tipus: "felrako" | "lerako";
  cim: string;
  ceg: string | null;
  kontakt: string | null;
  rakomany: string | null;
  ido: string | null;
  kesz: boolean;
};

export type KocsiMost = {
  jarmuvek: { kod: string; cimke: string; sofor: string | null; dolgozik: boolean }[];
  kod: string | null;
  most: (MegbizasSor & { megallok: KocsiMostMegallo[] }) | null;
  kovetkezo: MegbizasSor | null;
};

/**
 * Amit a kocsi éppen csinál (a legkorábbi folyamatban lévő, vagy a ma
 * induló tervezett fuvarja), megállónként a sofőr jelöléseivel, és a
 * következő fuvarja. A megállók sorszáma a sofőr appjával azonos
 * (modell-szinkron.ts: felrakók, aztán lerakók), így a „kész” jelölés a
 * fuvar_megallo_allapot indexéből jön.
 */
export async function getKocsiMost(kod?: string): Promise<KocsiMost> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);
  const osszesJarmu = await munkaasztalJarmuvei();
  const nyitott = await query<MegbizasSor>(
    `${SOR_SQL} where m.torolt_at is null and j.kod is not null and m.allapot in ('ellenorzesre_var','tervezett','folyamatban')
     order by m.datum asc, m.id asc limit 200`
  );
  const aktivja = (k: string) =>
    nyitott.find((s) => s.jarmu_kod === k && s.allapot === "folyamatban") ??
    nyitott.find((s) => s.jarmu_kod === k && s.allapot === "tervezett" && (s.felrakas_nap ?? "") <= ma) ??
    null;
  const jarmuvek = osszesJarmu.filter((j) => j.rendszamos || nyitott.some((s) => s.jarmu_kod === j.kod));
  const lista = jarmuvek.map((j) => ({ kod: j.kod, cimke: j.cimke, sofor: j.sofor, dolgozik: !!aktivja(j.kod) }));
  const valasztott = kod && jarmuvek.some((j) => j.kod === kod) ? kod : (lista.find((j) => j.dolgozik)?.kod ?? jarmuvek[0]?.kod ?? null);
  if (!valasztott) return { jarmuvek: lista, kod: null, most: null, kovetkezo: null };

  const most = aktivja(valasztott);
  const kovetkezo = nyitott.find((s) => s.jarmu_kod === valasztott && s.id !== most?.id && (s.felrakas_nap ?? "") >= ma) ?? null;
  if (!most) return { jarmuvek: lista, kod: valasztott, most: null, kovetkezo };

  const [megallok, kesz, extra] = await Promise.all([
    query<{ sorszam: number; tipus: "felrako" | "lerako"; cim_nyers: string; sofor_kesz_at: string | null; gps_tavozas: string | null }>(
      `select sorszam, tipus, cim_nyers, sofor_kesz_at::text, gps_tavozas::text from fuvar_megallok where megbizas_id = $1 order by sorszam`,
      [most.id]
    ),
    query<{ megallo_index: number }>(`select megallo_index from fuvar_megallo_allapot where fuvar_id = $1 and kesz`, [most.id]),
    query<{ megallo_reszletek: MegalloReszlet[] | null }>(`select megallo_reszletek from fuvar_megbizasok where id = $1`, [most.id]),
  ]);
  const keszIndex = new Set(kesz.map((k) => Number(k.megallo_index)));
  const darab = { felrako: 0, lerako: 0 };
  for (const m of megallok) darab[m.tipus]++;
  const szamlalo = { felrako: 0, lerako: 0 };
  return {
    jarmuvek: lista,
    kod: valasztott,
    kovetkezo,
    most: {
      ...most,
      megallok: megallok.map((m) => {
        const r = megalloReszlete(extra[0]?.megallo_reszletek, m.tipus, szamlalo[m.tipus]++, darab[m.tipus], m.cim_nyers);
        return {
          sorszam: m.sorszam,
          tipus: m.tipus,
          cim: m.cim_nyers,
          ceg: r?.ceg ?? null,
          kontakt: r?.kontakt ?? null,
          rakomany: r?.rakomany ?? null,
          ido: r?.ido ?? null,
          kesz: keszIndex.has(m.sorszam - 1) || !!m.sofor_kesz_at || !!m.gps_tavozas,
        };
      }),
    },
  };
}
