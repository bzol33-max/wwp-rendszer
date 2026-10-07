"use server";

import * as actions from "@/lib/megbizasok/akciok";

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
import { query } from "@/lib/db";
import { requireAnyViewPermission, requireEditPermission } from "@/lib/auth/require-permission";
import {
  lehetsegesCelok,
  type Allapot,
} from "@/lib/fuvarozas/allapot";
import { keresEgyezik, keresNapok, keresSzoveg, szakaszSorbol, szakaszSorrendben, type KeresoIndex, type Szakasz } from "@/lib/fuvarozas2/munkaasztal";
import { cimReszek, rovidCim, megbizasCim } from "@/lib/megbizasok/megjelenites";
import { varosNev } from "@/lib/fuvarozas/varos";
import { SOR_SQL, kontextus, BER_SQL } from "@/lib/megbizasok/repo";
import { findJarmuByPlate } from "@/lib/fuvarozas/vehicles";
import { type BerFuvarAdat } from "@/lib/fuvarozas2/berfuvar";

export type MegbizasSor = {
  id: string;
  jelleg: "ber" | "sajat";
  /** HU-GO rakott km (rakott-km.ts) — a saját fuvarnál ebből a „bérben mennyi lett volna”. */
  rakott_km: number | null;
  allapot: Allapot;
  allapot_at: string | null;
  letrehozva_at: string;
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
  idopont_nyitott: boolean;
  legkorabban: string | null;
  /** Saját fuvarhoz párosított Számlázz.hu-s szállítólevél (S-WLLWR-…) — lib/fuvarozas2/szallitolevel.ts. */
  szallitolevel: string | null;
};



export async function getMegbizasok(szuro: {
  allapotok?: Allapot[];
  jelleg?: "ber" | "sajat";
  toroltIs?: boolean;
  limit?: number;
} = {}): Promise<MegbizasSor[]> {
  await requireAnyViewPermission(["fuvarozas", "elszamolas", "attekintes"]);
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
export type Dokumentum = { id: string; tipus: string | null; fajlnev: string | null; dokumentum_url: string | null; created_at: string; van_eredeti: boolean; forgatas: number };

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
    query<Dokumentum>(`select id::text, tipus, fajlnev, dokumentum_url, created_at::text, eredeti is not null as van_eredeti, forgatas from fuvar_dokumentumok where fuvar_id = $1 order by created_at`, [id]),
  ]);
  const k = await kontextus(sor, megallok);
  const partnerJavaslatok = sor.partner_id ? await getPartnerAdatJavaslatok(sor.partner_id) : [];
  return { sor, megallok, esemenyek, dokumentumok, celok: lehetsegesCelok(sor.allapot, "ember", k), partnerJavaslatok };
}


/** A „szamlazhato” kézi jelöléshez a fotó hiánya helyett a kézi döntés is elég (11.1/7). */
export async function valtAllapot(id: string, hova: Allapot, opciok: { kezi?: boolean; megjegyzes?: string; kliensUuid?: string } = {}): Promise<{ ok: true; allapot: Allapot } | { ok: false; hiba: string }> { return actions.valtAllapot(id, hova, opciok); }

/** Kézi számlaszám (a Számlázz.hu-szinkron helyett/mellett). Számlázható → számlázva átmenettel. */
export async function setSzamlaSzam(id: string, szamlaSzam: string | null): Promise<{ ok: true } | { ok: false; hiba: string }> { return actions.setSzamlaSzam(id, szamlaSzam); }

/** Megjegyzés / szabad szöveges módosítás naplózva (a többi mező szerkesztése a régi részletben marad a cutoverig). */
export async function setMegjegyzes(id: string, megjegyzes: string | null): Promise<void> { return actions.setMegjegyzes(id, megjegyzes); }

/** Fuvarlevél-oldal megjelenítési forgatása. */
export async function forgatFuvarlevelOldalt(dokId: string, irany: 90 | -90): Promise<void> { return actions.forgatFuvarlevelOldalt(dokId, irany); }

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
export async function setFuvarJarmu(id: string, jarmuKod: string | null): Promise<{ ok: true; cimke: string | null } | { ok: false; hiba: string }> { return actions.setFuvarJarmu(id, jarmuKod); }

// ---------------------------------------------------------------------------
// Bérfuvar szerkesztése és kézi felvétele (2026-09-30): a régi Fuvarozás
// szerkesztőjének (approveFuvar / addFuvar) minden mezője, hogy a régi oldal
// kivezethető legyen. Különbség az approveFuvar-hoz képest: a mentés NEM
// számolja újra az állapotot a régi jelölőkből (a 002 trigger a dátum
// változására azt tenné — pl. egy úton lévő fuvar dátumjavítása „teljesítve”
// lenne), és nem hagy jóvá (az a „Jóváhagyás” gomb dolga).



export async function getBerFuvarAdat(id: string): Promise<BerFuvarAdat | null> {
  await requireEditPermission("fuvarozas");
  const [a] = await query<BerFuvarAdat>(BER_SQL, [id]);
  return a ?? null;
}

export async function modositBerFuvart(id: string, a: BerFuvarAdat): Promise<{ ok: true } | { ok: false; hiba: string }> { return actions.modositBerFuvart(id, a); }

/** Kézi új bérfuvar (ami nem e-mailben vagy Drive-on jött). */
export async function ujBerFuvar(a: BerFuvarAdat): Promise<{ ok: true; id: string } | { ok: false; hiba: string }> { return actions.ujBerFuvar(a); }

/**
 * Megbízás törlése a részletekből (Budaházi Zoltán, 2026-09-25 — pl. a #280
 * Duvenbeck-duplikátum). Nem fizikai törlés: `statusz = 'torolt'` (a trigger
 * tölti a `torolt_at`-ot), a napló megmarad. Számlázott fuvart NEM enged
 * törölni — azzal a kiállított számla és a fuvar kapcsolata veszne el.
 */
export async function torolMegbizast(id: string): Promise<{ ok: true } | { ok: false; hiba: string }> { return actions.torolMegbizast(id); }

/** Törölt fuvar visszaállítása a részletből (a törlés párja). */
export async function visszaallitTorolt(id: string): Promise<{ ok: true } | { ok: false; hiba: string }> { return actions.visszaallitTorolt(id); }

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
  const reszek = cimReszek;
  const rovid = rovidCim;
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
        cim: megbizasCim(s),
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
