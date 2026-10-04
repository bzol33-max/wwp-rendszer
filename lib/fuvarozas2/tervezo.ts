"use server";

// A Tervezés oldal adatai (2026-09-30, Budaházi Zoltán: az 1-es terv,
// „bejövő · döntés · hét”). Minden adatbázisból és tárolt értékből jön —
// külső hívás csak akkor, ha a kiválasztott megbízásnak még nincs tárolt
// kalkulációja (lib/fuvarozas2/kalkulacio-tar.ts). A heti számtan:
// lib/fuvarozas2/tervezo-alap.ts.

import { query } from "@/lib/db";
import { requireViewPermission } from "@/lib/auth/require-permission";
import { varosNev } from "@/lib/fuvarozas/varos";
import { findJarmuByPlate } from "@/lib/fuvarozas/vehicles";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";
import { GAZOLAJ_AR_TARTALEK, TANKOLASI_KEDVEZMENY_FT_PER_LITER } from "@/lib/fuvarozas/gazolaj";
import { NAPI_KOLTSEG_FT, ALAP_FOGYASZTAS_L100, type AjanlatMinosites } from "@/lib/fuvarozas2/kalkulator-alap";
import { frissitsKalkulaciokat, getTaroltKalkulaciok, szamoldEsTarold, type TaroltKalkulacio } from "@/lib/fuvarozas2/kalkulacio-tar";
import { celar, elozmenyElteres, hetHatas, legjobbKocsi, type HetEredmeny, type HetFuvar, type HetParam, type Pont } from "@/lib/fuvarozas2/tervezo-alap";

export type BejovoSor = {
  id: string;
  allapot: string;
  partner: string | null;
  hivatkozas: string | null;
  felrako: string | null;
  lerako: string | null;
  felrakasNap: string;
  lerakasNap: string;
  fuvardij: number | null;
  penznem: string;
  jarmuKod: string | null;
  /** A tárolt kalkulációból (becslés helyett a pontos HU-GO-számítás), ha van. */
  magaban: { minosites: AjanlatMinosites | null; eredmenyFt: number | null; onkoltsegFt: number } | null;
  kalkElavult: boolean;
  legjobb: { kod: string; sofor: string; hatas: number } | null;
  elozmeny: { eltere: number | null; atlag: number | null } | null;
};

export type KocsiHet = {
  kod: string;
  cimke: string;
  sofor: string;
  hatas: number;
  utkozik: boolean;
  vele: HetEredmeny;
  nelkule: HetEredmeny;
  napok: { nap: string; fuvarok: { id: string; cim: string; ut: string; dij: number | null; uj: boolean; sajat: boolean }[] }[];
};

export type ElozmenySor = { id: string; nap: string; partner: string | null; ut: string; dij: number; ftKm: number | null; egyezes: "partner-ut" | "ut" | "partner" };

export type Tervezo = {
  bejovo: BejovoSor[];
  kivalasztott: null | {
    sor: BejovoSor;
    kalk: TaroltKalkulacio | null;
    elozmenyek: ElozmenySor[];
    figyelmeztetes: string | null;
    kocsik: KocsiHet[];
    valasztott: KocsiHet | null;
    celarFt: number | null;
    hetKezdet: string;
  };
  /** Hány megbízás kalkulációja fut éppen a háttérben (hiányzott vagy elavult). */
  hatterben: number;
  becslesParam: { fogyasztasL100: number; gazolajFt: number; utdijPerKm: number };
};

type FuvarPont = {
  id: string; jelleg: "ber" | "sajat"; allapot: string; jarmu_kod: string | null; partner: string | null; hivatkozas: string | null;
  felrako: string | null; lerako: string | null; felrakas_nap: string; lerakas_nap: string;
  fuvardij: number | null; penznem: string; rakott_km: number | null;
  fel_lat: number | null; fel_lon: number | null; le_lat: number | null; le_lon: number | null;
};

const HONAPNAP = (iso: string) => `${iso.slice(5, 7)}.${iso.slice(8, 10)}.`;

function hetfo(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function napPlusz(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const kisVaros = (s: string | null) => (s ? varosNev(s).trim().toLowerCase() : "");

export async function getTervezo(szuro: { m?: string; kocsi?: string }): Promise<Tervezo> {
  await requireViewPermission("fuvarozas");
  const [{ ma }] = await query<{ ma: string }>(`select ((now() at time zone 'Europe/Budapest')::date)::text as ma`);

  // A fuvarok (a bejövők és a kocsik hetei) — koordinátákkal a tárolt megállókból.
  const fuvarok = await query<FuvarPont>(
    `select m.id::text, m.jelleg, m.allapot, j.kod as jarmu_kod, coalesce(p.nev, m.megrendelo) as partner,
       coalesce(m.hivatkozas_kanonikus, m.pozicioszam, m.reise_id) as hivatkozas,
       coalesce(fel.cim_nyers, m.felrako) as felrako, coalesce(le.cim_nyers, m.lerako) as lerako,
       to_char(m.datum, 'YYYY-MM-DD') as felrakas_nap, to_char(coalesce(m.lerakas_datum, m.datum), 'YYYY-MM-DD') as lerakas_nap,
       m.fuvardij, coalesce(m.fuvardij_penznem, 'Ft') as penznem, m.rakott_km,
       fel.lat as fel_lat, fel.lon as fel_lon, le.lat as le_lat, le.lon as le_lon
     from fuvar_megbizasok m
     left join fuvar_partnerek p on p.id = m.partner_id
     left join fuvar_jarmuvek j on j.id = m.jarmu_id
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1) fel on true
     left join lateral (select g.cim_nyers, g.lat, g.lon from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1) le on true
     where m.torolt_at is null and m.allapot is not null and m.datum is not null
       and coalesce(m.lerakas_datum, m.datum) >= $1::date - 24
     order by m.datum, m.id`,
    [ma]
  );

  const bejovoFuvarok = fuvarok.filter(
    (f) => f.jelleg === "ber" && f.lerakas_nap >= napPlusz(ma, -14) && (f.allapot === "ellenorzesre_var" || (f.allapot === "tervezett" && !f.jarmu_kod))
  );

  // Tárolt kalkulációk: a bejövőké és a hetekben szereplő bérfuvaroké (útdíj, km).
  const tar = await getTaroltKalkulaciok(fuvarok.filter((f) => f.jelleg === "ber").map((f) => f.id));

  // A becslés paraméterei a tárolt kalkulációkból (hálózat nélkül); ha nincs, alapérték.
  const eredmenyek = [...tar.values()].map((t) => t.eredmeny).filter((e): e is NonNullable<typeof e> => !!e);
  const fogyasztasL100 = eredmenyek.length ? Math.round((eredmenyek.reduce((a, e) => a + e.fogyasztasL100, 0) / eredmenyek.length) * 10) / 10 : ALAP_FOGYASZTAS_L100;
  const gazolajFt = eredmenyek.length ? eredmenyek[eredmenyek.length - 1].gazolaj.ar : GAZOLAJ_AR_TARTALEK.ar - TANKOLASI_KEDVEZMENY_FT_PER_LITER;
  const kmOssz = eredmenyek.reduce((a, e) => a + e.rakottKm, 0);
  const utdijPerKm = kmOssz > 0 ? Math.round(eredmenyek.reduce((a, e) => a + e.rakottUtdijFt, 0) / kmOssz) : 120;
  const telephelyGeo = await geokodolCachelve(SAJAT_TELEPHELYEK[0].cim).catch(() => null);
  const telephely: Pont = telephelyGeo ? { lat: telephelyGeo.lat, lon: telephelyGeo.lon } : { lat: 47.77, lon: 21.93 };
  const param: HetParam = { telephely, fogyasztasL100, gazolajFt, napiFt: NAPI_KOLTSEG_FT, munkanapok: 5, utdijPerKm };

  const hetFuvar = (f: FuvarPont): HetFuvar => {
    const t = tar.get(f.id)?.eredmeny;
    return {
      id: f.id, jelleg: f.jelleg, felrakasNap: f.felrakas_nap, lerakasNap: f.lerakas_nap,
      felrako: f.fel_lat != null && f.fel_lon != null ? { lat: f.fel_lat, lon: f.fel_lon } : null,
      lerako: f.le_lat != null && f.le_lon != null ? { lat: f.le_lat, lon: f.le_lon } : null,
      rakottKm: t?.rakottKm ?? (f.rakott_km != null ? Number(f.rakott_km) : null),
      dijFt: f.jelleg === "ber" && f.penznem === "Ft" && f.fuvardij ? Number(f.fuvardij) : null,
      utdijFt: t?.rakottUtdijFt ?? null,
    };
  };

  const jarmuvek = (await query<{ kod: string; cimke: string; sofor: string | null }>(
    `select j.kod, j.cimke, a.name as sofor from fuvar_jarmuvek j left join alkalmazottak a on a.id = j.sofor_id
     where j.aktiv and j.ecofleet_object_id is not null order by j.id`
  )).map((j) => ({ ...j, sofor: findJarmuByPlate(j.kod)?.sofor ?? j.sofor?.split(" ").pop() ?? j.kod }));

  /** Egy jelölt fuvar hatása minden kocsi hetére (a jelölt felrakásának hetén). */
  function kocsiHetek(jelolt: FuvarPont): KocsiHet[] {
    const kezd = hetfo(jelolt.felrakas_nap);
    const veg = napPlusz(kezd, 6);
    const uj = hetFuvar(jelolt);
    return jarmuvek.map((j) => {
      const sajat = fuvarok.filter((f) => f.jarmu_kod === j.kod && f.id !== jelolt.id);
      const heti = sajat.filter((f) => f.felrakas_nap <= veg && f.lerakas_nap >= kezd);
      const elotte = sajat.filter((f) => f.lerakas_nap < kezd && f.le_lat != null).pop();
      const kezdo = elotte ? { lat: elotte.le_lat!, lon: elotte.le_lon! } : null;
      const h = hetHatas(heti.map(hetFuvar), uj, kezdo, param);
      const napok = Array.from({ length: 5 }, (_, i) => napPlusz(kezd, i)).map((nap) => ({
        nap,
        fuvarok: [...heti, jelolt]
          .filter((f) => f.felrakas_nap <= nap && f.lerakas_nap >= nap)
          .map((f) => ({
            id: f.id,
            cim: f.partner ?? (f.jelleg === "sajat" ? "saját fuvar" : "(nincs megbízó)"),
            ut: `${varosNev(f.felrako ?? "") || "?"} → ${varosNev(f.lerako ?? "") || "?"}`,
            dij: f.jelleg === "ber" && f.penznem === "Ft" ? f.fuvardij : null,
            uj: f.id === jelolt.id,
            sajat: f.jelleg === "sajat",
          })),
      }));
      return { kod: j.kod, cimke: j.cimke, sofor: j.sofor, hatas: h.hatas, utkozik: h.utkozik, vele: h.vele, nelkule: h.nelkule, napok };
    });
  }

  // Ár-előzmény: a saját archívum egy évre (bér, Ft, díjjal).
  const archiv = await query<{ id: string; nap: string; partner: string | null; partner_id: string | null; felrako: string | null; lerako: string | null; dij: number; km: number | null }>(
    `select m.id::text, to_char(m.datum, 'YYYY-MM-DD') as nap, coalesce(p.nev, m.megrendelo) as partner, m.partner_id::text,
       coalesce((select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'felrako' order by g.sorszam limit 1), m.felrako) as felrako,
       coalesce((select g.cim_nyers from fuvar_megallok g where g.megbizas_id = m.id and g.tipus = 'lerako' order by g.sorszam desc limit 1), m.lerako) as lerako,
       m.fuvardij as dij, m.rakott_km as km
     from fuvar_megbizasok m left join fuvar_partnerek p on p.id = m.partner_id
     where m.torolt_at is null and m.jelleg = 'ber' and m.fuvardij > 0 and coalesce(m.fuvardij_penznem, 'Ft') = 'Ft'
       and m.datum >= (now() at time zone 'Europe/Budapest')::date - 365
     order by m.datum desc`
  );
  const archivV = archiv.map((a) => ({ ...a, dij: Number(a.dij), km: a.km != null ? Number(a.km) : null, fv: kisVaros(a.felrako), lv: kisVaros(a.lerako), pk: (a.partner ?? "").trim().toLowerCase() }));

  function elozmenyek(f: FuvarPont): ElozmenySor[] {
    const fv = kisVaros(f.felrako), lv = kisVaros(f.lerako), pk = (f.partner ?? "").trim().toLowerCase();
    return archivV
      .filter((a) => a.id !== f.id)
      .map((a) => {
        const ut = !!fv && !!lv && a.fv === fv && a.lv === lv;
        const partner = !!pk && a.pk === pk;
        const egyezes: ElozmenySor["egyezes"] | null = ut && partner ? "partner-ut" : ut ? "ut" : partner ? "partner" : null;
        return egyezes ? { id: a.id, nap: a.nap, partner: a.partner, ut: `${varosNev(a.felrako ?? "") || "?"} → ${varosNev(a.lerako ?? "") || "?"}`, dij: a.dij, ftKm: a.km ? Math.round(a.dij / a.km) : null, egyezes } : null;
      })
      .filter((x): x is ElozmenySor => !!x)
      .sort((a, b) => ({ "partner-ut": 0, ut: 1, partner: 2 }[a.egyezes] - { "partner-ut": 0, ut: 1, partner: 2 }[b.egyezes]) || b.nap.localeCompare(a.nap))
      .slice(0, 8);
  }
  function mostFtKm(f: FuvarPont): number | null {
    const km = tar.get(f.id)?.eredmeny?.rakottKm ?? (f.rakott_km != null ? Number(f.rakott_km) : null);
    return f.fuvardij && f.penznem === "Ft" && km ? Math.round(Number(f.fuvardij) / km) : null;
  }
  function elozmenyOsszeg(f: FuvarPont, el: ElozmenySor[]) {
    const utas = el.filter((e) => e.egyezes !== "partner");
    return elozmenyElteres(mostFtKm(f), (utas.length ? utas : el).map((e) => e.ftKm));
  }

  const bejovo: BejovoSor[] = bejovoFuvarok.map((f) => {
    const t = tar.get(f.id);
    const m = t?.eredmeny?.megbizoiAjanlat;
    const hetek = kocsiHetek(f);
    const legjobb = legjobbKocsi(hetek);
    const el = elozmenyek(f);
    return {
      id: f.id, allapot: f.allapot, partner: f.partner, hivatkozas: f.hivatkozas, felrako: f.felrako, lerako: f.lerako,
      felrakasNap: f.felrakas_nap, lerakasNap: f.lerakas_nap, fuvardij: f.fuvardij != null ? Number(f.fuvardij) : null, penznem: f.penznem, jarmuKod: f.jarmu_kod,
      magaban: t?.eredmeny ? { minosites: m?.minosites ?? null, eredmenyFt: m?.eredmenyFt ?? null, onkoltsegFt: t.eredmeny.onkoltseg.osszesenFt } : null,
      kalkElavult: !t || t.elavult,
      legjobb: legjobb ? { kod: legjobb.kod, sofor: legjobb.sofor, hatas: legjobb.hatas } : null,
      elozmeny: el.length ? elozmenyOsszeg(f, el) : null,
    };
  });

  // A hiányzó / elavult kalkulációk a háttérben (nem várunk rájuk).
  const hianyzik = bejovo.filter((b) => b.kalkElavult).map((b) => b.id);
  const valasztottId = szuro.m && bejovo.some((b) => b.id === szuro.m) ? szuro.m : bejovo[0]?.id;

  let kivalasztott: Tervezo["kivalasztott"] = null;
  if (valasztottId) {
    const f = bejovoFuvarok.find((x) => x.id === valasztottId)!;
    const sor = bejovo.find((b) => b.id === valasztottId)!;
    // A kiválasztottra — ha még soha nem volt kiszámolva — megvárjuk a számítást (egyszer).
    let kalk = tar.get(valasztottId) ?? null;
    if (!kalk) kalk = await szamoldEsTarold(valasztottId).catch(() => null);
    const kocsik = kocsiHetek(f);
    const el = elozmenyek(f);
    const legutobbi = el.find((e) => e.egyezes === "partner-ut");
    const most = f.fuvardij != null ? Number(f.fuvardij) : null;
    const osszeg = elozmenyOsszeg(f, el);
    const figyelmeztetes =
      legutobbi && most && legutobbi.dij > most * 1.05
        ? `${f.partner ?? "Ez a partner"} legutóbb ${new Intl.NumberFormat("hu-HU").format(legutobbi.dij)} Ft-ot fizetett ugyanezért (${HONAPNAP(legutobbi.nap)}) — a mostani ${Math.round((1 - most / legutobbi.dij) * 100)}%-kal kevesebb.`
        : osszeg.eltere != null && osszeg.eltere <= -10
          ? `A korábbi hasonló fuvarok átlaga ~${osszeg.atlag} Ft/km, ez ${mostFtKm(f)} Ft/km (${osszeg.eltere}%).`
          : null;
    const legjobb = legjobbKocsi(kocsik);
    const valasztott = kocsik.find((k) => k.kod === szuro.kocsi) ?? legjobb ?? kocsik[0] ?? null;
    kivalasztott = {
      sor, kalk, elozmenyek: el, figyelmeztetes, kocsik, valasztott,
      celarFt: kalk?.eredmeny ? celar(kalk.eredmeny.onkoltseg.osszesenFt) : null,
      hetKezdet: hetfo(f.felrakas_nap),
    };
  }

  const hatterbe = hianyzik.filter((id) => id !== valasztottId || kivalasztott?.kalk?.elavult);
  if (hatterbe.length) void frissitsKalkulaciokat(hatterbe).catch((err) => console.error("[tervezo] háttérszámolás:", err));

  return { bejovo, kivalasztott, hatterben: hatterbe.length, becslesParam: { fogyasztasL100, gazolajFt, utdijPerKm } };
}
