import "server-only";
import { cache } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { query } from "@/lib/db";
import { ecofleetJson, getLastDataCachelve } from "@/lib/ecofleet/kliens";
import {
  sebessegOsszegzes, szenzorTankolasok, tachoTervLastDatabol, tankLiterLastDatabol, tankolasEgyeztetes,
  type EgyeztetesTetel, type TachoTerv,
  megtettUtNyersbol, type Nyompont,
} from "@/lib/ecofleet/plusz";
import { ecofleetIdopont, tachoAllapotLastDatabol, tachoFriss } from "@/lib/ecofleet/szamitas";
import { getFleetLastPositions, getVehicleTrips, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { canNapokTobb } from "@/lib/jarmu-telemetria/repo";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { getSajatTelephelyek } from "@/lib/fuvarozas/telephelyek-db";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getMaVaszon } from "@/lib/fuvarozas2/ma-vaszon";
import { getTervezesHet } from "@/lib/fuvarozas2/tervezes-het";
import { OKMANY_TIPUS_CIMKE, type OkmanyTipus } from "@/lib/jarmuvek/tipusok";
import { getProtoPenz } from "@/lib/proto/adat";
import { getDontes } from "@/lib/proto/dontes";

// Prototípus: a dashboard adatai. A lassú részek (GPS, költség) külön töltődnek,
// ezért mind `cache`-ben van, így több doboz is olvashatja egy kérésen belül.

export const getMa = cache(getMaVaszon);
export const getPenz = cache(getProtoPenz);
export const getDont = cache(getDontes);

export type HetSor = {
  kod: string;
  megrendelt: boolean;
  cellak: { nap: string; hely: string | null; sajat: boolean; ma: boolean }[];
  kintAlvas: number;
  hazaer: boolean;
};

export const SAJAT_VAROSOK = ["szakoly", "balkany", "nyiregyhaza"];

function ekezetNelkul(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function telepenE(hely: string | null): boolean {
  if (!hely) return false;
  const v = ekezetNelkul(hely);
  return SAJAT_VAROSOK.some((x) => v.includes(x));
}

/** Az esti hely a nap utolsó fuvarjának lerakója. Kint alvás: esti hely, ami nem a három telephely. */
export const getHet = cache(async (): Promise<{ napok: string[]; sorok: HetSor[] } | null> => {
  await requireAdmin();
  const ma = budapestNapISO();
  const het = await getTervezesHet().catch((e) => { console.warn("[proto] hét:", e); return null; });
  if (!het) return null;
  const munkanapok = het.napok.slice(0, 5);
  const sorok = het.kocsik.map((k): HetSor => {
    const cellak = munkanapok.map((nap) => {
      const c = k.cellak.find((x) => x.nap === nap);
      const utolso = c?.fuvarok[c.fuvarok.length - 1];
      return { nap, hely: utolso?.leVaros ?? null, sajat: !!utolso?.sajat, ma: nap === ma };
    });
    return {
      kod: k.kod,
      megrendelt: false,
      cellak,
      kintAlvas: cellak.filter((c) => c.hely && !telepenE(c.hely)).length,
      hazaer: ekezetNelkul(cellak[cellak.length - 1]?.hely ?? "").includes("szakoly"),
    };
  });
  return { napok: munkanapok, sorok };
});

export type FlottaTetel = { cim: string; ertek: string; figyel: boolean };

export const getFlotta = cache(async (): Promise<{ tetelek: FlottaTetel[]; lejaro: { cim: string; nap: number; lejart: boolean }[]; l100: number | null }> => {
  await requireAdmin();
  const ma = await getMa();
  const sorok = await query<{ targy: string | null; tipus: OkmanyTipus; nap: number }>(
    `select coalesce(j.kod, p.rendszam) as targy, o.tipus, (o.lejarat - (now() at time zone 'Europe/Budapest')::date)::int as nap
     from jarmu_okmany o
     left join fuvar_jarmuvek j on j.id = o.jarmu_id
     left join fuvar_potkocsik p on p.id = o.potkocsi_id
     where o.lejarat is not null
     order by o.lejarat
     limit 6`
  ).catch((e) => { console.warn("[proto] okmány:", e); return []; });
  const lejaro = sorok.map((s) => ({ cim: `${OKMANY_TIPUS_CIMKE[s.tipus] ?? s.tipus} · ${s.targy ?? "?"}`, nap: Number(s.nap), lejart: Number(s.nap) < 0 }));
  const tetelek: FlottaTetel[] = lejaro.slice(0, 3).map((l) => ({
    cim: l.cim,
    ertek: l.lejart ? `lejárt ${-l.nap} napja` : `${l.nap} nap`,
    figyel: l.nap <= 30,
  }));
  for (const k of ma.kocsik) {
    const km = k.fogyasztas?.szervizHatraKm;
    if (km != null && tetelek.length < 4) tetelek.push({ cim: `Szerviz · ${k.kod}`, ertek: `${km.toLocaleString("hu-HU")} km`, figyel: km < 3000 });
  }
  return { tetelek, lejaro, l100: ma.flottaL100 ?? null };
});

export const getEletut = cache(async () => {
  await requireAdmin();
  const [s] = await query<{ szamlara: string; papir: string; postara: string }>(
    `select
       count(*) filter (where m.allapot in ('teljesitve', 'szamlazhato'))::text as szamlara,
       count(*) filter (where m.allapot in ('teljesitve', 'szamlazhato', 'szamlazva', 'email_elment') and m.papirok_beerkeztek_at is null)::text as papir,
       count(*) filter (where m.allapot in ('szamlazva', 'email_elment'))::text as postara
     from fuvar_megbizasok m
     where m.torolt_at is null and m.allapot is not null`
  );
  return { szamlara: Number(s.szamlara), papir: Number(s.papir), postara: Number(s.postara) };
});

export type KocsiPlusz = { tankLiter: number | null; adatKorPerc: number | null; terv: TachoTerv | null };

/** Tank és tachó-terv kocsikódonként, a közös getLastData-ból. Régi tachó-adatból nem adunk tervet. */
export const getKocsiPlusz = cache(async (): Promise<Map<string, KocsiPlusz>> => {
  await requireAdmin();
  const ki = new Map<string, KocsiPlusz>();
  const [jarmuvek, adat] = await Promise.all([getJarmuvek(), getLastDataCachelve().catch((e) => { console.warn("[proto] getLastData:", e); return null; })]);
  const most = new Date();
  for (const j of jarmuvek) {
    const sor = adat?.sorok.find((s) => String(s.objectId) === j.ecofleetObjectId);
    if (!j.kod || !sor) continue;
    const tacho = tachoAllapotLastDatabol(sor);
    const idopont = ecofleetIdopont(sor.timestamp);
    ki.set(j.kod, { tankLiter: tankLiterLastDatabol(sor), adatKorPerc: idopont ? Math.round((most.getTime() - idopont.getTime()) / 60_000) : null, terv: tacho && tachoFriss(tacho, most) ? tachoTervLastDatabol(sor) : null });
  }
  return ki;
});

const NAP_MS = 86_400_000;
const SEBESSEG_CACHE_MS = 10 * 60_000;
let sebessegCache: { adat: Map<string, ReturnType<typeof sebessegOsszegzes>>; lekerveAt: number } | null = null;

/** Kocsinként az elmúlt 7 nap legnagyobb sebessége és a túllépéses utak száma. */
export const getSebesseg = cache(async (): Promise<Map<string, ReturnType<typeof sebessegOsszegzes>>> => {
  await requireAdmin();
  if (sebessegCache && Date.now() - sebessegCache.lekerveAt <= SEBESSEG_CACHE_MS) return sebessegCache.adat;
  const jarmuvek = (await getJarmuvek()).filter((j) => j.kod && j.ecofleetObjectId);
  const most = new Date();
  const sorok = await Promise.all(jarmuvek.map(async (j) => {
    const utak = await getVehicleTrips(j.ecofleetObjectId!, new Date(most.getTime() - 7 * NAP_MS), most).catch((e) => { console.warn("[proto] sebesség:", e); return null; });
    return [j.kod!, utak ? sebessegOsszegzes(utak) : null] as const;
  }));
  const adat = new Map(sorok.filter((s): s is [string, ReturnType<typeof sebessegOsszegzes>] => s[1] !== null));
  // Hibás lekérés nem kerül gyorsítótárba.
  if (adat.size === jarmuvek.length) sebessegCache = { adat, lekerveAt: Date.now() };
  return adat;
});

const NYOM_CACHE_MS = 5 * 60_000;
let nyomCache: { adat: Map<string, Nyompont[]>; nap: string; lekerveAt: number } | null = null;

/** Kocsinként a mai megtett út az Ecofleet nyers GPS-mintáiból. Hiba esetén a kocsi kimarad, a térkép vonal nélkül is működik. */
export const getMegtettUt = cache(async (): Promise<Map<string, Nyompont[]>> => {
  await requireAdmin();
  const nap = budapestNapISO();
  if (nyomCache && nyomCache.nap === nap && Date.now() - nyomCache.lekerveAt <= NYOM_CACHE_MS) return nyomCache.adat;
  const jarmuvek = (await getJarmuvek()).filter((j) => j.kod && j.ecofleetObjectId);
  const sorok = await Promise.all(jarmuvek.map(async (j) => {
    const nyers = await ecofleetJson<unknown>("Vehicles/getRawData", { objectId: j.ecofleetObjectId!, begTimestamp: `${nap} 00:00:00`, endTimestamp: `${nap} 23:59:59` }).catch((e) => { console.warn("[proto] megtett út:", e); return null; });
    return [j.kod!, nyers === null ? null : megtettUtNyersbol(nyers)] as const;
  }));
  const adat = new Map(sorok.filter((s): s is [string, Nyompont[]] => s[1] !== null));
  // Hibás lekérés nem kerül gyorsítótárba.
  if (adat.size === jarmuvek.length) nyomCache = { adat, nap, lekerveAt: Date.now() };
  return adat;
});

export type TankolasTetel = EgyeztetesTetel & { kod: string };

/** Szenzor és kútszámla összevetése az elmúlt 30 napra, kocsinként. */
export const getTankolasEgyeztetes = cache(async (): Promise<TankolasTetel[]> => {
  await requireAdmin();
  const jarmuvek = (await getJarmuvek()).flatMap((j) => (j.kod && j.ecofleetObjectId && j.id ? [{ id: j.id, kod: j.kod, kulcsok: new Set(j.rendszamok.map(rendszamKulcs)) }] : []));
  const ma = budapestNapISO();
  const tol = budapestNapISO(new Date(Date.now() - 30 * NAP_MS));
  const can = await canNapokTobb(jarmuvek.map((j) => j.id), tol, ma);
  // A kocsihoz még nem kötött számlát a nyers rendszám köti a kocsihoz, különben téves „nincs kútszámla” lenne belőle.
  const szamlak = await query<{ jarmu_id: string | null; rendszam_nyers: string | null; idopont: Date; liter: string | null }>(
    `select jarmu_id::text, rendszam_nyers, idopont, liter from tankolas
     where (jarmu_id = any($1::bigint[]) or jarmu_id is null) and (idopont at time zone 'Europe/Budapest')::date between $2::date and $3::date`,
    [jarmuvek.map((j) => j.id), tol, ma]
  );
  return jarmuvek.flatMap((j) => {
    const napok = can.get(j.id) ?? [];
    return tankolasEgyeztetes(
      szenzorTankolasok(napok.flatMap((n) => n.tankolasok)),
      szamlak.filter((s) => s.jarmu_id === j.id || (!s.jarmu_id && !!s.rendszam_nyers && j.kulcsok.has(rendszamKulcs(s.rendszam_nyers)))).map((s) => ({ idopont: new Date(s.idopont), liter: s.liter != null ? Number(s.liter) : null })),
      new Set(napok.filter((n) => n.mintaDb > 0).map((n) => n.nap.slice(0, 10))),
      (d) => budapestNapISO(d)
    ).map((t) => ({ ...t, kod: j.kod }));
  }).sort((a, b) => b.idopont.getTime() - a.idopont.getTime());
});

export type TerkepKocsi = {
  kod: string;
  szin: string;
  pont: { lat: number; lon: number; sebesseg: number; korPerc: number | null } | null;
  megallok: { lat: number; lon: number; cim: string }[];
  kimaradt: number;
};
export type TerkepAdat = {
  kocsik: TerkepKocsi[];
  telepek: { nev: string; lat: number; lon: number }[];
  kimaradt: number;
};

async function geo(cim: string): Promise<{ lat: number; lon: number } | null> {
  const ido = new Promise<null>((r) => setTimeout(() => r(null), 2500));
  const g = await Promise.race([geokodolCachelve(cim).catch(() => null), ido]);
  return g ? { lat: g.lat, lon: g.lon } : null;
}

/** A kocsi mai és folyamatban lévő fuvarjainak megállói. A vonal légvonal, tárolt útgeometria nincs. */
export const getTerkep = cache(async (): Promise<TerkepAdat> => {
  await requireAdmin();
  const ma = budapestNapISO();
  const SZINEK = ["#0B6E85", "#A3147F", "#475569", "#6A2FC4"];
  const [jarmuvek, poz, telepLista] = await Promise.all([
    getJarmuvek(),
    getFleetLastPositions().catch(() => []),
    getSajatTelephelyek(),
  ]);
  let kimaradt = 0;
  const kocsik: TerkepKocsi[] = [];
  for (const [i, j] of jarmuvek.filter((x) => x.kod && x.rendszamok.length > 0).entries()) {
    const kulcsok = new Set(j.rendszamok.map(rendszamKulcs));
    const p = poz.find((x) => kulcsok.has(rendszamKulcs(x.plate)));
    const sorok = await query<{ cim_nyers: string | null }>(
      `select g.cim_nyers
       from fuvar_megallok g
       join fuvar_megbizasok m on m.id = g.megbizas_id
       join fuvar_jarmuvek jj on jj.id = m.jarmu_id
       where jj.kod = $1 and m.torolt_at is null and m.allapot is not null
         and m.datum <= $2::date and coalesce(m.lerakas_datum, m.datum) >= $2::date
       order by m.datum, m.id, g.sorszam`,
      [j.kod, ma]
    );
    const megallok: TerkepKocsi["megallok"] = [];
    let kocsiKimaradt = 0;
    for (const s of sorok) {
      const g = s.cim_nyers ? await geo(s.cim_nyers) : null;
      if (g && s.cim_nyers) megallok.push({ ...g, cim: varosNev(s.cim_nyers) || s.cim_nyers });
      else { kimaradt++; kocsiKimaradt++; }
    }
    const gpsIdo = p ? ecofleetIdopont(p.timestamp) : null;
    kocsik.push({
      kod: j.kod!,
      szin: SZINEK[i % SZINEK.length],
      pont: p ? { lat: p.latitude, lon: p.longitude, sebesseg: p.speed, korPerc: gpsIdo ? Math.round((Date.now() - gpsIdo.getTime()) / 60_000) : null } : null,
      megallok,
      kimaradt: kocsiKimaradt,
    });
  }
  const telepek: TerkepAdat["telepek"] = [];
  for (const t of telepLista.filter((x) => x.tipus !== "parkolo")) {
    const g = t.lat != null && t.lon != null ? { lat: t.lat, lon: t.lon } : await geo(t.cim);
    if (g) telepek.push({ nev: t.nev, ...g });
  }
  return { kocsik, telepek, kimaradt };
});
