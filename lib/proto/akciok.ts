"use server";

import { requireAdmin } from "@/lib/auth/dal";
import { query } from "@/lib/db";
import { getEurArfolyamok } from "@/lib/fuvarozas/arfolyam";
import { getFleetLastPositions, rendszamKulcs } from "@/lib/fuvarozas/ecofleet";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { gazolajArKedvezmennyel } from "@/lib/fuvarozas/gazolaj";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { getJarmuIndulasiTelephely, getSajatTelephelyek } from "@/lib/fuvarozas/telephelyek-db";
import { becsultTavolsag } from "@/lib/fuvarozas2/ures-km";
import type { MegbizasSor } from "@/lib/fuvarozas2/megbizasok";
import { SOR_SQL } from "@/lib/megbizasok/repo";
import { arLetra, type ArLetra } from "@/lib/fuvarozas2/ar-letra";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { varosNev } from "@/lib/fuvarozas/varos";
import { arCsekk, type ArCsekk } from "@/lib/proto/artar-alap";
import { getArMintak } from "@/lib/proto/dontes";

// Prototípus: a húzás előnézete. Semmit nem ment, a kiosztás marad a régi felületen.

const TELEP_SZABALY_KM = 30;
const TELEP_EGYEZES_KM = 3;
const FOGYASZTAS_L100 = 28;
const UTDIJ_TARTALEK_FT_KM = 120;

export type KocsiElonezet = {
  kod: string;
  sofor: string;
  honnan: string | null;
  telephelyrol: boolean;
  uresKm: number | null;
  /** Bér: bevétel − rakott és üres km költsége. Sofőrköltség nélkül. Saját: null. */
  fedezetFt: number | null;
  szabalySertes: boolean;
};

export type Elonezet = {
  fuvar: { id: string; cim: string; ut: string; rakottKm: number | null; bevetelFt: number | null };
  kocsik: KocsiElonezet[];
  legkozelebbiTelep: { nev: string; km: number } | null;
};

export async function protoElonezet(fuvarId: string, nap: string): Promise<Elonezet> {
  await requireAdmin();
  const [f] = await query<MegbizasSor>(`${SOR_SQL} where m.id = $1`, [fuvarId]);
  if (!f) throw new Error("A fuvar nem található.");
  const tav = becsultTavolsag();
  const rakottKm = f.rakott_km ?? (f.felrako && f.lerako ? await tav(f.felrako, f.lerako) : null);

  const telepek = (await getSajatTelephelyek()).filter((t) => t.tipus !== "parkolo");
  const [ar, arfolyam] = await Promise.all([
    gazolajArKedvezmennyel(),
    f.fuvardij_penznem === "EUR" ? getEurArfolyamok([nap]) : Promise.resolve(null),
  ]);
  const ftKm = (FOGYASZTAS_L100 / 100) * ar.ar + UTDIJ_TARTALEK_FT_KM;
  const eurFt = arfolyam?.get(nap)?.ft ?? null;
  const bevetelFt = f.jelleg !== "ber" || f.fuvardij == null
    ? null
    : f.fuvardij_penznem === "EUR"
      ? eurFt != null ? Math.round(Number(f.fuvardij) * eurFt) : null
      : Number(f.fuvardij);

  const kocsik: KocsiElonezet[] = [];
  for (const j of await getJarmuvek()) {
    if (!j.kod || j.rendszamok.length === 0) continue;
    const [elozo] = await query<{ lerako: string | null }>(
      `select coalesce(le.cim_nyers, m.lerako) as lerako
       from fuvar_megbizasok m
       join fuvar_jarmuvek jj on jj.id = m.jarmu_id
       left join lateral (select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true
       where jj.kod = $1 and m.torolt_at is null and m.allapot is not null and m.id <> $2
         and coalesce(m.lerakas_datum, m.datum) <= $3::date
       order by coalesce(m.lerakas_datum, m.datum) desc, m.id desc limit 1`,
      [j.kod, fuvarId, nap]
    );
    const indulo = await getJarmuIndulasiTelephely(j.kod);
    const honnan = elozo?.lerako ?? indulo.cim;
    let telephelyrol = !elozo?.lerako;
    if (!telephelyrol && honnan) {
      for (const t of telepek) {
        const d = await tav(honnan, t.cim);
        if (d != null && d <= TELEP_EGYEZES_KM) { telephelyrol = true; break; }
      }
    }
    const uresKm = f.felrako && honnan ? await tav(honnan, f.felrako) : null;
    const fedezetFt = bevetelFt != null && rakottKm != null && uresKm != null
      ? Math.round(bevetelFt - (rakottKm + uresKm) * ftKm)
      : null;
    kocsik.push({
      kod: j.kod,
      sofor: j.sofor,
      honnan,
      telephelyrol,
      uresKm,
      fedezetFt,
      szabalySertes: telephelyrol && uresKm != null && uresKm > TELEP_SZABALY_KM,
    });
  }
  kocsik.sort((a, b) => (a.uresKm ?? Infinity) - (b.uresKm ?? Infinity));

  let legkozelebbiTelep: Elonezet["legkozelebbiTelep"] = null;
  if (f.felrako) {
    for (const t of telepek) {
      const d = await tav(t.cim, f.felrako);
      if (d != null && (!legkozelebbiTelep || d < legkozelebbiTelep.km)) legkozelebbiTelep = { nev: t.nev, km: d };
    }
  }

  return {
    fuvar: { id: f.id, cim: f.partner_nev ?? f.kitol ?? "Saját", ut: `${f.felrako ?? "?"} → ${f.lerako ?? "?"}`, rakottKm, bevetelFt },
    kocsik,
    legkozelebbiTelep,
  };
}

export type ArValasz = {
  km: number | null;
  dijFt: number | null;
  csekk: ArCsekk;
  letra: ArLetra | null;
};

/** Telefonos alkuhoz: honnan, hová, mennyiért. Semmit nem ment. */
export async function protoArCsekk(a: { honnan: string; hova: string; partner: string; dij: number | null; penznem: "Ft" | "EUR" }): Promise<ArValasz> {
  await requireAdmin();
  const ma = budapestNapISO();
  const arf = (await getEurArfolyamok([ma]).catch(() => new Map<string, { ft: number }>())).get(ma)?.ft ?? null;
  const minta = await getArMintak(arf);
  const km = await becsultTavolsag()(a.honnan, a.hova);
  const dijFt = a.dij == null ? null : a.penznem === "EUR" ? (arf ? a.dij * arf : null) : a.dij;
  const csekk = arCsekk(minta, { partner: a.partner.trim() || null, fel: varosNev(a.honnan) || a.honnan, le: varosNev(a.hova) || a.hova, dijFt, km });
  const ar = await gazolajArKedvezmennyel();
  const letra = km != null ? arLetra(km * ((FOGYASZTAS_L100 / 100) * ar.ar + UTDIJ_TARTALEK_FT_KM), arf) : null;
  return { km, dijFt, csekk, letra };
}

export type LancPont = { cimke: string; tipus: "felrako" | "lerako"; lat: number; lon: number };

export type Lanc = {
  kod: string;
  pontok: LancPont[];
  kimaradt: number;
  kocsi: { lat: number; lon: number; sebesseg: number } | null;
};

export async function protoLanc(kod: string, hetKezdet: string): Promise<Lanc> {
  await requireAdmin();
  const sorok = await query<{ cim_nyers: string | null; tipus: "felrako" | "lerako" }>(
    `select g.cim_nyers, g.tipus
     from fuvar_megallok g
     join fuvar_megbizasok m on m.id = g.megbizas_id
     join fuvar_jarmuvek j on j.id = m.jarmu_id
     where j.kod = $1 and m.torolt_at is null and m.allapot is not null
       and m.datum between $2::date and $2::date + 6
     order by m.datum, m.id, g.sorszam`,
    [kod, hetKezdet]
  );
  const pontok: LancPont[] = [];
  let kimaradt = 0;
  for (const s of sorok) {
    const hely = s.cim_nyers ? await geokodolCachelve(s.cim_nyers).catch(() => null) : null;
    if (hely && s.cim_nyers) pontok.push({ cimke: s.cim_nyers, tipus: s.tipus, lat: hely.lat, lon: hely.lon });
    else kimaradt++;
  }
  let kocsi: Lanc["kocsi"] = null;
  const j = (await getJarmuvek()).find((x) => x.kod === kod);
  if (j) {
    const kulcsok = new Set(j.rendszamok.map(rendszamKulcs));
    const poz = await getFleetLastPositions().catch(() => []);
    const p = poz.find((x) => kulcsok.has(rendszamKulcs(x.plate)));
    if (p) kocsi = { lat: p.latitude, lon: p.longitude, sebesseg: p.speed };
  }
  return { kod, pontok, kimaradt, kocsi };
}
