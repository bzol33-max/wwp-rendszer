import "server-only";
import { query } from "@/lib/db";
import { calculateToll } from "@/lib/fuvarozas/utdijkalkulacio";
import { geokodolCachelve } from "@/lib/fuvarozas/erintes-felismeres";
import { getJarmuIndulasiTelephely } from "@/lib/fuvarozas/telephelyek-db";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { getFuvarBeallitasok, type FuvarBeallitasok } from "@/lib/beallitasok/fuvar";
import { gazolajArKedvezmennyel } from "@/lib/fuvarozas/gazolaj";
import { mertFogyasztas } from "@/lib/fuvarozas2/kalkulator-szamitas";
import { budapestNapISO } from "@/lib/fuvarozas/idozona";
import { varosNev } from "@/lib/fuvarozas/varos";
import { getMenet } from "@/lib/menet/repo";
import { cimparHiba, megbizasMunka, menetAdat } from "@/lib/menet/generalas";
import { hugoVagyBecsles, ujHugoKor, type HugoKor } from "@/lib/menet/hugo-megszakito";
import type { Valasz } from "@/lib/menet/muveletek";
import { KOZUTI_SZORZO, legvonalKm, megbizasSorrend } from "@/lib/menet/menet-alap";
import {
  javasolHozzarendelest,
  optParamBeallitasbol,
  type KocsiNap,
  type OptBemenet,
  type OptParam,
  type Szakasz,
  type SzakaszFn,
} from "@/lib/menet/optimalizalo";
import type { Hely, MenetMunka, Pont } from "@/lib/menet/tipusok";

// Menetterv — az optimalizáló szerveroldala: a Tervezés döntés-sávjának
// hozzárendelés-javaslata (melyik kocsi napjába illik a bejövő bérfuvar). A
// tiszta számítás: lib/menet/optimalizalo.ts; a bemenet a menetterv
// adatgyűjtéséből jön (lib/menet/generalas.ts menetAdat). Nem ír semmit.
// 2026-10-16 (docs/fuvarozas-1-hullam-terv.md D1): az óránkénti
// sorrend-javaslat kör, az optimalizálás / elfogadás / elutasítás és a
// nyitott javaslatok olvasása megszűnt — felület nem használta.

const AZONOSITO = /^\d+$/;

// ---------------------------------------------------------------- távolság, paraméterek

/**
 * Szerveroldali szakasz: HU-GO útvonal (J5, EURO6, 40 t; a kulso-hivas
 * gyorsítótárával) km-rel, menetidővel és bruttó útdíjjal; ha az nem érhető
 * el, légvonal × 1,3 'becsles' jelöléssel (útdíj és menetidő nélkül — azt az
 * optimalizáló a flottaátlagból / átlagsebességből adja). Körönként memoizált;
 * a `kor` megszakítója az első HU-GO időtúllépés / hálózati hiba (vagy a
 * hívás-/időkeret) után a kör hátralévő részére becslésre vált.
 */
export function szerverSzakasz(kor: HugoKor = ujHugoKor()): SzakaszFn {
  const pontCache = new Map<string, Pont | null>();
  const cache = new Map<string, Szakasz | null>();
  async function pont(h: Hely): Promise<Pont | null> {
    if (h.pont) return h.pont;
    const cim = h.cim?.trim();
    if (!cim) return null;
    if (!pontCache.has(cim)) {
      const g = await geokodolCachelve(cim).catch(() => null);
      pontCache.set(cim, g ? { lat: g.lat, lon: g.lon } : null);
    }
    return pontCache.get(cim) ?? null;
  }
  return async (a, b) => {
    const [p, q] = await Promise.all([pont(a), pont(b)]);
    if (!p || !q) return null;
    const kulcs = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}→${q.lat.toFixed(4)},${q.lon.toFixed(4)}`;
    if (cache.has(kulcs)) return cache.get(kulcs)!;
    let ki: Szakasz;
    if (legvonalKm(p, q) < 0.5) ki = { km: 0, perc: 0, utdijFt: 0, forras: "hugo" };
    else {
      const r = await hugoVagyBecsles<Szakasz>(
        kor,
        async () => {
          const t = await calculateToll({ points: [p, q], vehicleCategory: "J5", euroCategory: "EURO6", weight: 40 });
          return { km: t.distanceKm, perc: t.durationMin, utdijFt: t.tollHuf?.grossTotal ?? 0, forras: "hugo" };
        },
        () => ({ km: Math.round(legvonalKm(p, q) * KOZUTI_SZORZO), perc: null, utdijFt: null, forras: "becsles" }),
        { cimparHiba }
      );
      ki = r.ertek;
    }
    cache.set(kulcs, ki);
    return ki;
  };
}

/** Egy kör közös adatai: beállítások, gázolajár, flottaátlag útdíj, kocsinkénti fogyasztás és távolság. */
export type OptKor = {
  beallitas: FuvarBeallitasok;
  gazolajFtL: number;
  utdijPerKmFt: number;
  fogyasztas: Map<string, number>;
  szakasz: SzakaszFn;
};

export async function ujOptKor(hugo: HugoKor = ujHugoKor()): Promise<OptKor> {
  const beallitas = await getFuvarBeallitasok();
  const gazolajFtL = await gazolajArKedvezmennyel().then((g) => g.ar).catch(() => beallitas.gazolaj_ar_tartalek_ft - beallitas.tankolasi_kedvezmeny_ft_l);
  // Útdíj flottaátlag (Ft/km) a tárolt kalkulációkból (90 nap); ha nincs: 120 Ft/km (mint a Tervezésben).
  let utdijPerKmFt = 120;
  try {
    const [r] = await query<{ utdij: number | null; km: number | null }>(
      `select sum((eredmeny->>'rakottUtdijFt')::numeric)::float8 as utdij, sum((eredmeny->>'rakottKm')::numeric)::float8 as km
         from fuvar_kalkulacio where eredmeny is not null and szamolva_at > now() - interval '90 days'`
    );
    if (r?.km && r.km > 0 && r.utdij != null) utdijPerKmFt = Math.round(Number(r.utdij) / Number(r.km));
  } catch {
    // marad a 120 Ft/km
  }
  return { beallitas, gazolajFtL, utdijPerKmFt, fogyasztas: new Map(), szakasz: szerverSzakasz(hugo) };
}

async function kocsiParam(kor: OptKor, jarmuKod: string): Promise<OptParam> {
  if (!kor.fogyasztas.has(jarmuKod)) {
    const f = await mertFogyasztas(jarmuKod, kor.beallitas).catch(() => null);
    kor.fogyasztas.set(jarmuKod, f?.l100 ?? kor.beallitas.fogyasztas_alap_l_100km);
  }
  return optParamBeallitasbol(kor.beallitas, { gazolajFtL: kor.gazolajFtL, utdijPerKmFt: kor.utdijPerKmFt, fogyasztasL100: kor.fogyasztas.get(jarmuKod) });
}

async function hazaHely(jarmuKod: string): Promise<Hely | null> {
  try {
    const t = await getJarmuIndulasiTelephely(jarmuKod);
    return { cim: t.cim, pont: t.lat != null && t.lon != null ? { lat: Number(t.lat), lon: Number(t.lon) } : null };
  } catch {
    return null;
  }
}

const ut = (m: MenetMunka) => `${varosNev(m.felrako.cim ?? "") || m.felrako.cim || "?"} → ${varosNev(m.lerako.cim ?? "") || m.lerako.cim || "?"}`;

// ---------------------------------------------------------------- hozzárendelés (Tervezés)

export type HozzarendelesNezet = {
  nap: string;
  /** A HU-GO-keret kimerült / nem volt elérhető: a km-ek egy része légvonal × 1,3 becslés. */
  becsles?: boolean;
  legjobb: { kod: string; sofor: string; vanGps: boolean; pozicio: number; elotte: string | null; utana: string | null; hatarFt: number; pluszKm: number } | null;
  kocsik: { kod: string; sofor: string; vanGps: boolean; megengedett: boolean; hatarFt: number | null; pluszKm: number | null; ok: string | null }[];
};

/**
 * Egy bejövő bérfuvar: melyik kocsi napjába (a felrakás napja), hová, és
 * mennyibe kerül (a J határváltozása). Mind a 4 aktív kocsi jelölt — a GPS
 * nélküli is. Nem ír semmit.
 */
/** A kattintásra induló hozzárendelés-javaslat HU-GO kerete: ennyi hívás / ennyi idő után becslés. */
export const HOZZARENDELES_MAX_HIVAS = 120;
export const HOZZARENDELES_IDOKERET_MS = 20_000;

export async function hozzarendelesJavaslat(megbizasId: string, kor?: OptKor): Promise<Valasz<HozzarendelesNezet>> {
  if (!AZONOSITO.test(megbizasId)) return { ok: false, hiba: "Érvénytelen megbízás." };
  const uj = await megbizasMunka(megbizasId);
  if (!uj) return { ok: false, hiba: "Nincs ilyen megbízás." };
  const nap = uj.felrakasNap ?? budapestNapISO();
  // Korlátos: legfeljebb 120 HU-GO hívás és 20 s — utána légvonal × 1,3
  // (a már lekért szakaszok a kulso-hivas gyorsítótárából jönnek).
  const hugo = ujHugoKor({ maxHivas: HOZZARENDELES_MAX_HIVAS, idokeretMs: HOZZARENDELES_IDOKERET_MS });
  const k = kor ?? (await ujOptKor(hugo));
  const jarmuvek = (await getJarmuvek()).filter((j): j is typeof j & { id: string; kod: string } => !!j.id && !!j.kod);
  const kocsik: KocsiNap[] = [];
  let telephelyek: OptBemenet["telephelyek"] = [];
  const munkaUt = new Map<string, string>([[uj.id, ut(uj)]]);
  for (const j of jarmuvek) {
    const adat = await menetAdat(j.id, nap);
    if (!adat) continue;
    telephelyek = adat.telephelyek;
    const menet = await getMenet(j.id, nap).catch(() => null);
    for (const m of adat.munkak) munkaUt.set(m.id, ut(m));
    kocsik.push({
      jarmuId: j.id, kod: j.kod, sofor: j.sofor, vanGps: !!j.ecofleetObjectId,
      munkak: adat.munkak,
      jelenlegiSorrend: menet ? megbizasSorrend(menet.feladatok) : null,
      rogzitett: menet ? menet.feladatok.flatMap((f) => (f.lezarvaAt && f.megbizasId ? [f.megbizasId] : [])) : [],
      indulas: adat.indulas,
      haza: await hazaHely(j.kod),
      kapacitas: adat.kapacitas,
      param: await kocsiParam(k, j.kod),
    });
  }
  const h = await javasolHozzarendelest(uj, nap, kocsik, k.szakasz, telephelyek);
  const l = h.legjobb;
  const ujHelye = l ? l.sorrend.indexOf(uj.id) : -1;
  if (hugo.leallt) console.warn(`[optimalizalo] hozzárendelés: a HU-GO-keret kimerült (${hugo.ok}) — a további szakaszok becslések.`);
  return {
    ok: true,
    nap,
    becsles: hugo.leallt,
    legjobb: l && l.hatarFt != null ? {
      kod: l.kod, sofor: l.sofor, vanGps: l.vanGps, pozicio: ujHelye,
      elotte: ujHelye > 0 ? munkaUt.get(l.sorrend[ujHelye - 1]) ?? null : null,
      utana: ujHelye >= 0 && ujHelye < l.sorrend.length - 1 ? munkaUt.get(l.sorrend[ujHelye + 1]) ?? null : null,
      hatarFt: Math.round(l.hatarFt), pluszKm: l.pluszKm ?? 0,
    } : null,
    kocsik: h.kocsik.map((x) => ({
      kod: x.kod, sofor: x.sofor, vanGps: x.vanGps, megengedett: x.megengedett,
      hatarFt: x.megengedett && x.hatarFt != null ? Math.round(x.hatarFt) : null, pluszKm: x.megengedett ? x.pluszKm : null,
      ok: x.megengedett ? null : x.serulesek[0] ?? null,
    })),
  };
}
