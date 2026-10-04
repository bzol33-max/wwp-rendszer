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

import { getPartnerAdatJavaslatok, type PartnerAdatJavaslat } from "@/lib/fuvarozas2/partnerek";
import { pool, query } from "@/lib/db";
import { requireSession } from "@/lib/auth/dal";
import { requireAnyViewPermission, requireAnyEditPermission, requireEditPermission } from "@/lib/auth/require-permission";
import {
  ellenorizAtmenet,
  lehetsegesCelok,
  type Allapot,
  type AtmenetForras,
  type AtmenetKontextus,
} from "@/lib/fuvarozas/allapot";
import { keresEgyezik, keresNapok, keresSzoveg, szakaszSorbol, szakaszSorrendben, type KeresoIndex, type Szakasz } from "@/lib/fuvarozas2/munkaasztal";
import { varosNev } from "@/lib/fuvarozas/varos";
import { findJarmuByPlate, jarmuLabel } from "@/lib/fuvarozas/vehicles";
import { frissitsdFuvarozas2Modellt } from "@/lib/fuvarozas2/modell-szinkron";
import { kanonikusMegrendeloNev } from "@/lib/fuvarozas/megrendelo-nev";
import { addFuvar } from "@/lib/fuvarozas/megbizasok";
import { berFuvarHiba, berSzam, valtozottMezok, type BerFuvarAdat } from "@/lib/fuvarozas2/berfuvar";

export type MegbizasSor = {
  id: string;
  jelleg: "ber" | "sajat";
  allapot: Allapot;
  allapot_at: string | null;
  partner_id: string | null;
  partner_nev: string | null;
  /** Saját fuvar: ki adja az árut (szöveg) — lib/fuvarozas2/sajat-fuvar.ts. */
  kitol: string | null;
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
  /** A partner hiányzó adataira nyitott javaslatok (postacím stb.). */
  partnerJavaslatok: PartnerAdatJavaslat[];
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
  const partnerJavaslatok = sor.partner_id ? await getPartnerAdatJavaslatok(sor.partner_id) : [];
  return { sor, megallok, esemenyek, dokumentumok, celok: lehetsegesCelok(sor.allapot, "ember", k), partnerJavaslatok };
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
      case "szamlazva":
        // Téves „Postázva” visszavonása (17. él): a régi jelölő is törlődik,
        // különben a régi besorolás továbbra is feladottnak látná.
        if (sor.allapot === "postazva") set("postazva = false, postazva_at = null");
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
    // Optimista zár: csak akkor írunk, ha az állapot azóta sem változott,
    // amióta a fenti ellenőrzés beolvasta. Két egyidejű váltás (dupla
    // koppintás, mobil + asztali, a GPS-figyelő) különben érvénytelen láncot
    // és dupla mellékhatást írhatott (audit 2026-10-04, RACE-2).
    const irt = await client.query(
      `update fuvar_megbizasok set allapot = $2, allapot_at = now()${regi.length ? ", " + regi.join(", ") : ""} where id = $1 and allapot = $3`,
      [id, hova, sor.allapot]
    );
    if (irt.rowCount === 0) {
      await client.query("rollback");
      return { ok: false, hiba: "A megbízás állapota közben megváltozott — frissítsd az oldalt, és próbáld újra." };
    }
    if (sor.jelleg === "ber") {
      await client.query(`insert into fuvar_elszamolas (megbizas_id) values ($1) on conflict (megbizas_id) do nothing`, [id]);
      if (hova === "postazva") await client.query(`update fuvar_elszamolas set postazva_at = coalesce(postazva_at, now()), postazva_by = $2, papirok_beerkeztek_at = coalesce(papirok_beerkeztek_at, now()), papirok_beerkeztek_by = coalesce(papirok_beerkeztek_by, $2), frissitve_at = now() where megbizas_id = $1`, [id, par[2]]);
      if (hova === "szamlazva" && sor.allapot === "postazva") await client.query(`update fuvar_elszamolas set postazva_at = null, postazva_by = null, frissitve_at = now() where megbizas_id = $1`, [id]);
      if (hova === "email_elment") await client.query(`update fuvar_elszamolas set email_elment_at = coalesce(email_elment_at, now()), email_elment_by = $2, frissitve_at = now() where megbizas_id = $1`, [id, par[2]]);
      if (hova === "teljesitve" && sor.allapot === "szamlazva") await client.query(`update fuvar_elszamolas set szamla_id = null, szamla_szam = null, szamla_kelte = null, frissitve_at = now() where megbizas_id = $1`, [id]);
    }
    const esemeny =
      hova === "teljesitve" && ["szamlazhato", "szamlazva"].includes(sor.allapot) ? "visszaallitas"
      : hova === "tervezett" && sor.allapot === "folyamatban" ? "visszaallitas"
      : hova === "postazva" && sor.allapot === "lezart" ? "visszaallitas"
      : hova === "szamlazva" && sor.allapot === "postazva" ? "visszaallitas"
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
 * Kocsi hozzárendelése egy fuvarhoz (Budaházi Zoltán, 2026-09-26): eddig
 * bér fuvarnál csak a régi Fuvarozás szerkesztője (`approveFuvar`) tudott
 * kocsit írni, ami az EGÉSZ sort újraírja — ezért a „kocsi nélkül” álló
 * fuvart sem a munkaasztalról, sem a segéddel nem lehetett elrendezni.
 * Ez a függvény csak a Kocsi mezőt állítja, és a `jarmu_id` kulcsot a
 * szinkronra hagyja (`frissitsdFuvarozas2Modellt`), ahogy a mentés is.
 *
 * Előkészítés alatti saját fuvarhoz NEM való: ott a kocsi az
 * `elokeszites_jarmu`-ban vár (lib/fuvarozas2/sajat-fuvar.ts).
 */
export async function setFuvarJarmu(id: string, jarmuKod: string | null): Promise<{ ok: true; cimke: string | null } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  const jarmu = jarmuKod?.trim() ? findJarmuByPlate(jarmuKod.trim()) : null;
  if (jarmuKod?.trim() && !jarmu) return { ok: false, hiba: "Ismeretlen kocsi." };
  const [sor] = await query<{ elokeszites: boolean; jarmu: string | null }>(
    `select elokeszites, jarmu from fuvar_megbizasok where id = $1 and torolt_at is null`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Nincs ilyen fuvar." };
  if (sor.elokeszites) return { ok: false, hiba: "Ez a fuvar előkészítésben van — ott az űrlapon állítsd a kocsit, aztán „Kocsira adom”." };
  const cimke = jarmu ? jarmuLabel(jarmu) : null;
  await query(`update fuvar_megbizasok set jarmu = $2, jarmu_id = null where id = $1`, [id, cimke]);
  await frissitsdFuvarozas2Modellt(id);
  await query(
    `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'hozzarendeles', 'ember', $2, $3)`,
    [id, session.name ?? session.username, JSON.stringify({ kocsi: cimke, elozo: sor.jarmu })]
  );
  return { ok: true, cimke };
}

// ---------------------------------------------------------------------------
// Bérfuvar szerkesztése és kézi felvétele (2026-09-30): a régi Fuvarozás
// szerkesztőjének (approveFuvar / addFuvar) minden mezője, hogy a régi oldal
// kivezethető legyen. Különbség az approveFuvar-hoz képest: a mentés NEM
// számolja újra az állapotot a régi jelölőkből (a 002 trigger a dátum
// változására azt tenné — pl. egy úton lévő fuvar dátumjavítása „teljesítve”
// lenne), és nem hagy jóvá (az a „Jóváhagyás” gomb dolga).

const BER_SQL = `
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

/** A fuvardíj és a költség oszlop egész szám (integer): kerekítve, hibás/üres → null. */
function egesz(s: string): number | null {
  const n = berSzam(s);
  return typeof n === "number" ? Math.round(n) : null;
}

export async function getBerFuvarAdat(id: string): Promise<BerFuvarAdat | null> {
  await requireEditPermission("fuvarozas");
  const [a] = await query<BerFuvarAdat>(BER_SQL, [id]);
  return a ?? null;
}

export async function modositBerFuvart(id: string, a: BerFuvarAdat): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const hiba = berFuvarHiba(a);
  if (hiba) return { ok: false, hiba };
  const megrendelo = await kanonikusMegrendeloNev(a.megrendelo);
  const client = await pool.connect();
  let valtozott: string[] = [];
  try {
    await client.query("begin");
    const { rows: [regi] } = await client.query<BerFuvarAdat & { allapot: string }>(
      BER_SQL.replace("select ", "select m.allapot, ") + " for update of m",
      [id]
    );
    if (!regi) { await client.query("rollback"); return { ok: false, hiba: "Nincs ilyen bérfuvar." }; }
    valtozott = valtozottMezok(regi, a);
    if (valtozott.length === 0) { await client.query("rollback"); return { ok: true }; }
    await client.query(`select set_config('fuvarozas2.uj_kod', '1', true)`);
    await client.query(
      `update fuvar_megbizasok set
         datum = $2, lerakas_datum = $3, idopont = $4, felrako = $5, lerako = $6, megrendelo = $7,
         pozicioszam = $8, pozicioszam_nincs = $9, aru = $10, mennyiseg = $11, suly = $12,
         jarmu = $13, sofor = $14, fuvardij = $15, fuvardij_penznem = $16, koltseg = $17,
         megjegyzes = $18, postazasi_cim = $19,
         -- mint az approveFuvar: más megrendelőnél/kocsinál a Fuvarozás 2 kulcsát a szinkron újraépíti
         partner_id = case when megrendelo is distinct from $7 then null else partner_id end,
         jarmu_id = case when jarmu is distinct from $13 or sofor is distinct from $14 then null else jarmu_id end
       where id = $1`,
      [
        id, a.datum, a.lerakasDatum || null, a.idopont.trim() || null, a.felrako.trim(), a.lerako.trim(), megrendelo,
        a.pozicioszamNincs ? null : a.pozicioszam.trim() || null, a.pozicioszamNincs, a.aru.trim() || null, a.mennyiseg.trim() || null, a.suly.trim() || null,
        a.jarmu.trim() || null, a.sofor.trim() || null, egesz(a.fuvardij), a.fuvardijPenznem === "EUR" ? "EUR" : "Ft", egesz(a.koltseg),
        a.megjegyzes.trim() || null, a.postazasiCim.trim() || null,
      ]
    );
    // Az állapot marad, ami volt: ha a 002 trigger a dátumok miatt átírta, visszaállítjuk.
    await client.query(`update fuvar_megbizasok set allapot = $2 where id = $1 and allapot is distinct from $2`, [id, regi.allapot]);
    if (valtozott.includes("postazasiCim")) {
      await client.query(`update fuvar_elszamolas set postazasi_cim = $2, frissitve_at = now() where megbizas_id = $1`, [id, a.postazasiCim.trim() || null]);
    }
    await client.query(
      `insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'modositva', 'ember', $2, $3)`,
      [id, session.name ?? session.username, JSON.stringify({ mezok: valtozott, honnan: "megbizasok" })]
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  await frissitsdFuvarozas2Modellt(id);
  return { ok: true };
}

/** Kézi új bérfuvar (ami nem e-mailben vagy Drive-on jött). */
export async function ujBerFuvar(a: BerFuvarAdat): Promise<{ ok: true; id: string } | { ok: false; hiba: string }> {
  await requireEditPermission("fuvarozas");
  const session = await requireSession();
  const hiba = berFuvarHiba(a);
  if (hiba) return { ok: false, hiba };
  const dij = egesz(a.fuvardij), koltseg = egesz(a.koltseg);
  const id = await addFuvar({
    tipus: "sajat", // fordított elnevezés: a DB-ben tipus='sajat' = bérfuvar
    datum: a.datum,
    lerakasDatum: a.lerakasDatum || undefined,
    idopont: a.idopont.trim() || undefined,
    felrako: a.felrako.trim(),
    lerako: a.lerako.trim(),
    megrendelo: a.megrendelo.trim() || undefined,
    pozicioszam: a.pozicioszamNincs ? undefined : a.pozicioszam.trim() || undefined,
    pozicioszamNincs: a.pozicioszamNincs,
    aru: a.aru.trim() || undefined,
    mennyiseg: a.mennyiseg.trim() || undefined,
    suly: a.suly.trim() || undefined,
    jarmu: a.jarmu.trim() || undefined,
    sofor: a.sofor.trim() || undefined,
    fuvardij: typeof dij === "number" ? dij : undefined,
    fuvardijPenznem: a.fuvardijPenznem,
    koltseg: typeof koltseg === "number" ? koltseg : undefined,
    megjegyzes: a.megjegyzes.trim() || undefined,
    postazasiCim: a.postazasiCim.trim() || undefined,
    forras: "kezi",
    ellenorzott: true,
    createdBy: session.name ?? session.username,
  });
  if (!id) return { ok: false, hiba: "Nem jött létre a fuvar." };
  return { ok: true, id };
}

/**
 * Megbízás törlése a részletekből (Budaházi Zoltán, 2026-09-25 — pl. a #280
 * Duvenbeck-duplikátum). Nem fizikai törlés: `statusz = 'torolt'` (a trigger
 * tölti a `torolt_at`-ot), a napló megmarad. Számlázott fuvart NEM enged
 * törölni — azzal a kiállított számla és a fuvar kapcsolata veszne el.
 */
export async function torolMegbizast(id: string): Promise<{ ok: true } | { ok: false; hiba: string }> {
  await requireAnyEditPermission(["fuvarozas"]);
  const session = await requireSession();
  const [sor] = await query<{ szamlas: boolean }>(
    `select (coalesce(m.szamla_szam, '') <> '' or cardinality(m.kieg_szamla_szamok) > 0
             or exists (select 1 from fuvar_elszamolas e where e.megbizas_id = m.id and coalesce(e.szamla_szam, '') <> '')) as szamlas
     from fuvar_megbizasok m where m.id = $1 and m.torolt_at is null`,
    [id]
  );
  if (!sor) return { ok: false, hiba: "Ez a fuvar már törölve van." };
  if (sor.szamlas) return { ok: false, hiba: "Számlázott fuvar nem törölhető." };
  const ki = session.name ?? session.username;
  await query(`update fuvar_megbizasok set statusz = 'torolt', torolt_at = now(), torolt_by = $2 where id = $1`, [id, ki]);
  await query(`insert into fuvar_megbizas_esemeny (megbizas_id, esemeny, forras, ki, reszletek) values ($1, 'torolve', 'ember', $2, $3)`, [
    id, ki, JSON.stringify({ honnan: "munkaasztal" }),
  ]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Megbízások oldal (2026-09-30, Budaházi Zoltán: 1-es terv, „Bér | Saját”):
// két oszlop, a bérfuvarok és a saját fuvarok szakaszonként, kereső
// mindenre. A szakasz-, sorrend- és keresési szabály tiszta modulban van
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

/**
 * A két oszlop sorai: kereső nélkül minden nyitott (nem archív) fuvar,
 * keresővel a találatok az archívval együtt — jellegenként szakasz-sorrendben.
 */
export async function getKetOszlop(szuro: { q?: string }): Promise<{
  ber: MunkaasztalSor[];
  sajat: MunkaasztalSor[];
  ma: string;
  kereso: KeresoIndex;
  /** Keresésnél a találatok száma (a levágás előtt), különben null. */
  talalat: number | null;
}> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas"]);
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);
  const osszes = (await query<MegbizasSor>(
    `${SOR_SQL} where m.allapot is not null and m.torolt_at is null order by coalesce(m.lerakas_datum, m.datum) desc, m.id desc limit 3000`
  )).map((s) => ({ ...s, szakasz: szakaszSorbol(s) }));
  const jarmuvek = await munkaasztalJarmuvei();
  const soforKod = new Map(jarmuvek.map((j) => [j.kod, j.sofor]));

  const q = szuro.q?.trim();
  const sorok = q
    ? osszes.filter((s) => keresEgyezik({ ...s, sofor: [s.sofor, s.jarmu_kod ? soforKod.get(s.jarmu_kod) : null].filter(Boolean).join(" ") }, q))
    : osszes.filter((s) => s.szakasz !== "archiv");
  const rendezett = szakaszSorrendben(sorok);

  return {
    ber: rendezett.filter((s) => s.jelleg === "ber").slice(0, 300),
    sajat: rendezett.filter((s) => s.jelleg === "sajat").slice(0, 300),
    ma,
    kereso: keresoIndex(osszes, jarmuvek, soforKod),
    talalat: q ? sorok.length : null,
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
        cim: s.kitol ? `${s.kitol} → ${s.partner_nev ?? "?"}` : s.partner_nev ?? (s.jelleg === "sajat" ? "Saját fuvar" : "(nincs megbízó)"),
        ut: `${rovid(f[0] ?? null)} → ${rovid(l[l.length - 1] ?? null)}`,
        nap: s.felrakas_nap,
        szakasz: s.szakasz,
        szoveg: keresSzoveg({ ...s, sofor: [s.sofor, s.jarmu_kod ? soforKod.get(s.jarmu_kod) : null].filter(Boolean).join(" ") }),
        napok: keresNapok(s),
      };
    }),
    cegek: egyedi(sorok.flatMap((s) => [s.partner_nev, s.kitol])),
    varosok: egyedi(sorok.flatMap((s) => [...reszek(s.felrako), ...reszek(s.lerako)].map((c) => varosNev(c))))
      // Ha a címből nem jön ki városnév, a varosNev a teljes szöveget adja
      // („BMW HU Plant Debrecen”) — az nem város.
      .filter((v) => v.length >= 2 && v.length <= 32 && v.split(/\s+/).length <= 2),
    kocsik: jarmuvek.map((j) => ({ kod: j.kod, cimke: j.sofor ? `${j.sofor} · ${j.kod}` : j.kod })),
    szamok: egyedi(sorok.flatMap((s) => [s.szamla_szam, ...(s.kieg_szamla_szamok ?? []), s.szallitolevel, s.hivatkozas])),
  };
}
