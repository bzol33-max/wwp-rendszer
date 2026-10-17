// Ajánlat oldal · Q2 (docs/ajanlat-q2-terv.md): merre keressen fuvart egy
// felszabaduló kocsi — legfeljebb 3 irány a saját múltból és a nyitott
// Timocom-ajánlatokból, a hazaérés (a hét utolsó munkanapja, Szakoly) és a
// bevétel szerint. Tiszta logika: nincs I/O, nincs Date.now().

import { munkanap } from "@/lib/jelenlet/shared";
import { kovetkezoMunkanap, utKm } from "@/lib/fuvarozas2/tervezes-het-alap";
import type { Pont } from "@/lib/fuvarozas2/tervezo-alap";

export const MULT_KORZET_KM = 80;
export const TIMOCOM_KORZET_KM = 120;
export const CSOPORT_KM = 50;
export const HAZA_KOZEL_KM = 60;
const KMH = 60;
const NAPI_MAX = 540;
const RAKODAS_PERC = 60;

export type KeresHely = { varos: string; pont: Pont | null };
export type KeresMult = { partner: string; fel: KeresHely; le: KeresHely; nap: string; dijFt: number | null };
export type KeresAjanlat = { id: string; megbizo: string | null; fel: KeresHely; le: KeresHely; felNap: string | null; arFt: number | null };
export type KeresSzabad = { nap: string; ido: string | null; hely: KeresHely; vezetesHatraPerc: number | null; becsult: boolean };
export type KeresKocsi = { kod: string; sofor: string; szabad: KeresSzabad | null; tavolletNapok: string[] };
export type KeresParam = { telephely: { varos: string; pont: Pont }; kmKoltseg: number };

export type IranyCimke = "tobb-penz" | "gyakori" | "hazafele" | "ures-haza" | "tovabbi";

export type Irany = {
  kulcs: string;
  nev: string;
  cel: KeresHely;
  cimke: IranyCimke;
  multDb: number;
  timocomDb: number;
  dijFt: number | null;
  ftKm: number | null;
  raallasKm: number;
  rakottKm: number;
  hazaKm: number;
  ejszakaKint: number;
  hazaer: boolean;
  pontszam: number | null;
  partnerek: { partner: string; db: number; utolsoNap: string; utolsoDijFt: number | null }[];
  ajanlatIdk: string[];
};

export type KocsiJavaslat = {
  kod: string;
  sofor: string;
  szabad: KeresSzabad | null;
  hazaNap: string | null;
  csakHaza: boolean;
  /** Szabad napon távollét (szabadság, beteg) — nincs mit keresni. */
  tavolletben: boolean;
  nincsAdat: boolean;
  iranyok: Irany[];
};

const napLep = (nap: string, d: number) => {
  const x = new Date(`${nap}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};
const hetNapja = (nap: string) => (new Date(`${nap}T12:00:00Z`).getUTCDay() + 6) % 7; // hétfő = 0

/**
 * A haza-nap: a `nap` hetének utolsó munkanapja; ha előtte (a `nap` után) távollét
 * jön, az azt megelőző utolsó munkanap. Ha a `nap` maga nem munkanap, a hét
 * utolsó munkanapja akkor is (de legalább a `nap`).
 */
export function hazaNapja(nap: string, tavolletNapok: string[] = []): string {
  const vasarnap = napLep(nap, 6 - hetNapja(nap));
  const tav = new Set(tavolletNapok);
  let utolso = nap;
  for (let d = napLep(nap, 1); d <= vasarnap; d = napLep(d, 1)) {
    if (tav.has(d)) break;
    if (munkanap(d)) utolso = d;
  }
  return utolso;
}

/** Munkanapok száma `tol`-tól `ig`-ig (mindkettő benne); `tol` mindig 1-nek számít. */
function napokSzama(tol: string, ig: string): number {
  let db = 1;
  for (let d = napLep(tol, 1); d <= ig; d = napLep(d, 1)) if (munkanap(d)) db++;
  return db;
}

function median(x: number[]): number | null {
  if (!x.length) return null;
  const s = [...x].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : Math.round((s[k - 1] + s[k]) / 2);
}

/** Az első nap vezetési kerete: a tachó/terv szerinti maradék, különben az idő szerint. */
export function elsoNapKeret(sz: KeresSzabad): number {
  if (sz.vezetesHatraPerc != null && Number.isFinite(sz.vezetesHatraPerc)) return Math.max(0, Math.min(NAPI_MAX, Math.round(sz.vezetesHatraPerc)));
  const [h, m] = (sz.ido ?? "").split(":").map(Number);
  if (!Number.isFinite(h)) return NAPI_MAX;
  const perc = h * 60 + (Number.isFinite(m) ? m : 0);
  // 18:00 után már nem indul; 06:00 előtt teljes nap.
  return Math.max(0, Math.min(NAPI_MAX, 18 * 60 - perc));
}

/** Hány nap kell `vezetesPerc` vezetéshez (első nap: `keret`, utána 9 ó/nap). */
export function napokKell(vezetesPerc: number, keret: number): number {
  if (vezetesPerc <= keret) return 1;
  return 1 + Math.ceil((vezetesPerc - keret) / NAPI_MAX);
}

/** Valódi koordináta-e (NaN / végtelen kiszűrve). */
export const ervenyesPont = (p: Pont | null | undefined): p is Pont => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

type Jelolt = { forras: "mult" | "timocom"; fel: Pont; le: Pont; leVaros: string; dijFt: number | null; partner: string | null; nap: string | null; id: string | null };

function jeloltek(sz: KeresSzabad & { hely: { pont: Pont } }, mult: KeresMult[], ajanlatok: KeresAjanlat[]): Jelolt[] {
  const ki: Jelolt[] = [];
  const masnap = napLep(sz.nap, 1);
  for (const a of ajanlatok) {
    if (!ervenyesPont(a.fel.pont) || !ervenyesPont(a.le.pont)) continue;
    if (a.felNap && (a.felNap < sz.nap || a.felNap > masnap)) continue;
    if (utKm(sz.hely.pont, a.fel.pont) > TIMOCOM_KORZET_KM) continue;
    ki.push({ forras: "timocom", fel: a.fel.pont, le: a.le.pont, leVaros: a.le.varos, dijFt: a.arFt, partner: a.megbizo, nap: a.felNap, id: a.id });
  }
  for (const m of mult) {
    if (!ervenyesPont(m.fel.pont) || !ervenyesPont(m.le.pont)) continue;
    if (utKm(sz.hely.pont, m.fel.pont) > MULT_KORZET_KM) continue;
    ki.push({ forras: "mult", fel: m.fel.pont, le: m.le.pont, leVaros: m.le.varos, dijFt: m.dijFt, partner: m.partner, nap: m.nap, id: null });
  }
  return ki;
}

function csoportosit(j: Jelolt[]): Jelolt[][] {
  // Timocom elöl, utána a frissebb múlt: ezek adják a csoport közepét.
  const rend = [...j].sort((a, b) => (a.forras === b.forras ? (b.nap ?? "").localeCompare(a.nap ?? "") : a.forras === "timocom" ? -1 : 1));
  const cs: { kozep: Pont; tagok: Jelolt[] }[] = [];
  for (const x of rend) {
    const c = cs.find((c) => utKm(c.kozep, x.le) <= CSOPORT_KM);
    if (c) c.tagok.push(x);
    else cs.push({ kozep: x.le, tagok: [x] });
  }
  return cs.map((c) => c.tagok);
}

function leggyakoribb(x: string[]): string {
  const m = new Map<string, number>();
  for (const v of x) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "hu"))[0]?.[0] ?? "?";
}

function iranyCsoportbol(tagok: Jelolt[], sz: KeresSzabad & { hely: { pont: Pont } }, hazaNap: string, p: KeresParam): Irany {
  const nev = leggyakoribb(tagok.map((t) => t.leVaros));
  const cel = tagok.find((t) => t.leVaros === nev)!.le;
  const dijak = tagok.map((t) => t.dijFt).filter((d): d is number => d != null && d > 0);
  const ftKmek = tagok.filter((t) => t.dijFt && t.dijFt > 0).map((t) => t.dijFt! / Math.max(1, utKm(t.fel, t.le)));
  const raallasKm = median(tagok.map((t) => utKm(sz.hely.pont, t.fel))) ?? 0;
  const rakottKm = median(tagok.map((t) => utKm(t.fel, t.le))) ?? 0;
  const hazaKm = utKm(cel, p.telephely.pont);
  const osszKm = raallasKm + rakottKm + hazaKm;
  const vezetes = Math.round((osszKm / KMH) * 60) + RAKODAS_PERC;
  const napok = napokKell(vezetes, elsoNapKeret(sz));
  const hazaer = napok <= napokSzama(sz.nap, hazaNap);
  const dijFt = median(dijak);
  const ftKm = median(ftKmek);
  const varhato = dijFt ?? (ftKm != null ? Math.round(ftKm * rakottKm) : null);
  // Pontszám: a díj a ráállás + rakott út költsége után, a célig tartó napokra vetítve.
  // A hazautat nem vonjuk le (onnan a következő fuvart keressük) — az csak a „hazaér” feltétel.
  const odaKm = raallasKm + rakottKm;
  const odaNapok = napokKell(Math.round((odaKm / KMH) * 60) + RAKODAS_PERC, elsoNapKeret(sz));
  const pontszam = varhato != null ? Math.round((varhato - odaKm * p.kmKoltseg) / odaNapok) : null;
  const pm = new Map<string, { db: number; utolsoNap: string; utolsoDijFt: number | null }>();
  for (const t of tagok) {
    if (t.forras !== "mult" || !t.partner) continue;
    const x = pm.get(t.partner);
    if (!x) pm.set(t.partner, { db: 1, utolsoNap: t.nap ?? "", utolsoDijFt: t.dijFt });
    else {
      x.db++;
      if ((t.nap ?? "") > x.utolsoNap) { x.utolsoNap = t.nap ?? ""; x.utolsoDijFt = t.dijFt; }
    }
  }
  return {
    kulcs: `${nev}@${cel.lat.toFixed(2)},${cel.lon.toFixed(2)}`,
    nev: `${nev} felé`,
    cel: { varos: nev, pont: cel },
    cimke: "tovabbi",
    multDb: tagok.filter((t) => t.forras === "mult").length,
    timocomDb: tagok.filter((t) => t.forras === "timocom").length,
    dijFt, ftKm: ftKm != null ? Math.round(ftKm) : null,
    raallasKm, rakottKm, hazaKm,
    ejszakaKint: napok - 1,
    hazaer, pontszam,
    partnerek: [...pm].map(([partner, x]) => ({ partner, ...x })).sort((a, b) => b.db - a.db || b.utolsoNap.localeCompare(a.utolsoNap)).slice(0, 4),
    ajanlatIdk: tagok.filter((t) => t.forras === "timocom" && t.id).map((t) => t.id!),
  };
}

function uresHaza(sz: KeresSzabad & { hely: { pont: Pont } }, hazaNap: string, p: KeresParam): Irany {
  const km = utKm(sz.hely.pont, p.telephely.pont);
  const napok = napokKell(Math.round((km / KMH) * 60), elsoNapKeret(sz));
  return {
    kulcs: "haza", nev: `Haza (${p.telephely.varos})`, cel: { varos: p.telephely.varos, pont: p.telephely.pont }, cimke: "ures-haza",
    multDb: 0, timocomDb: 0, dijFt: null, ftKm: null, raallasKm: 0, rakottKm: 0, hazaKm: km,
    ejszakaKint: napok - 1, hazaer: napok <= napokSzama(sz.nap, hazaNap), pontszam: null, partnerek: [], ajanlatIdk: [],
  };
}

const hazafeleTart = (i: Irany, sz: { hely: { pont: Pont } }, p: KeresParam) =>
  i.hazaKm <= HAZA_KOZEL_KM || i.hazaKm <= utKm(sz.hely.pont, p.telephely.pont) - 50;

/** Egy kocsi legfeljebb 3 iránya. */
export function kocsiJavaslat(k: KeresKocsi, mult: KeresMult[], ajanlatok: KeresAjanlat[], p: KeresParam): KocsiJavaslat {
  const alap: KocsiJavaslat = { kod: k.kod, sofor: k.sofor, szabad: k.szabad, hazaNap: null, csakHaza: false, tavolletben: false, nincsAdat: false, iranyok: [] };
  let sz0 = k.szabad;
  if (!sz0 || !ervenyesPont(sz0.hely.pont) || !ervenyesPont(p.telephely.pont)) return alap;
  // Hétvégén / ünnepen felszabaduló kocsi: a következő munkanap reggelétől keres (QA #1).
  if (!munkanap(sz0.nap)) sz0 = { ...sz0, nap: kovetkezoMunkanap(sz0.nap), ido: "06:00", vezetesHatraPerc: null };
  const sz = sz0 as KeresSzabad & { hely: { pont: Pont } };
  alap.szabad = sz;
  if (k.tavolletNapok.includes(sz.nap)) return { ...alap, tavolletben: true };
  const hazaNap = hazaNapja(sz.nap, k.tavolletNapok);
  const csakHaza = hazaNap <= sz.nap;
  const j = jeloltek(sz, mult, ajanlatok);
  let osszes: Irany[] = csoportosit(j).map((t) => iranyCsoportbol(t, sz, hazaNap, p));
  if (csakHaza) osszes = osszes.filter((i) => hazafeleTart(i, sz, p));

  // Azonos kulcsú csoportok (közeli, azonos nevű cél) egyedi kulcsot kapnak (QA #9).
  const latott = new Map<string, number>();
  osszes = osszes.map((i) => {
    const n = latott.get(i.kulcs) ?? 0;
    latott.set(i.kulcs, n + 1);
    return n ? { ...i, kulcs: `${i.kulcs}#${n}` } : i;
  });
  const iranyok: Irany[] = [];
  const pool = new Set(osszes);
  const vesz = (i: Irany | undefined, cimke: IranyCimke) => {
    if (!i) return;
    pool.delete(i);
    iranyok.push({ ...i, cimke });
  };
  const gyakorisag = (i: Irany) => i.multDb + 2 * i.timocomDb;
  const pontRend = (a: Irany, b: Irany) => Number(b.hazaer) - Number(a.hazaer) || (b.pontszam ?? -1e12) - (a.pontszam ?? -1e12) || gyakorisag(b) - gyakorisag(a);
  if (!csakHaza) {
    vesz([...pool].filter((i) => i.hazaer && i.pontszam != null).sort(pontRend)[0], "tobb-penz");
    // „Gyakori” csak az, ahova legalább kétszer volt fuvar, vagy van rá nyitott Timocom-ajánlat (az duplán számít).
    vesz([...pool].filter((i) => i.hazaer && gyakorisag(i) >= 2).sort((a, b) => gyakorisag(b) - gyakorisag(a) || pontRend(a, b))[0], "gyakori");
  }
  vesz([...pool].filter((i) => hazafeleTart(i, sz, p)).sort(pontRend)[0], "hazafele");
  for (const i of [...pool].sort(pontRend)) {
    if (iranyok.length >= 3) break;
    vesz(i, "tovabbi");
  }
  if (!iranyok.some((i) => hazafeleTart(i, sz, p))) {
    // Mindig legyen hazavezető sor: a harmadik helyére (vagy a végére) az „Üresen haza”.
    if (iranyok.length >= 3) iranyok.pop();
    iranyok.push(uresHaza(sz, hazaNap, p));
  }
  // Sorrend: több pénz, gyakori, másik, a hazavezető a végén; a nem hazaérők leghátul.
  const RANG: Record<IranyCimke, number> = { "tobb-penz": 0, gyakori: 1, tovabbi: 2, hazafele: 3, "ures-haza": 4 };
  iranyok.sort((a, b) => Number(b.hazaer) - Number(a.hazaer) || RANG[a.cimke] - RANG[b.cimke]);
  return { ...alap, hazaNap, csakHaza, nincsAdat: j.length === 0, iranyok };
}

/** Az összes kocsi a felszabadulás sorrendjében (a szabad hely nélküliek a végén). */
export function keresesiJavaslatok(kocsik: KeresKocsi[], mult: KeresMult[], ajanlatok: KeresAjanlat[], p: KeresParam): KocsiJavaslat[] {
  const kulcs = (k: KeresKocsi) => (k.szabad ? `${k.szabad.nap}T${k.szabad.ido ?? "00:00"}` : "9999");
  return [...kocsik].sort((a, b) => kulcs(a).localeCompare(kulcs(b)) || a.kod.localeCompare(b.kod)).map((k) => kocsiJavaslat(k, mult, ajanlatok, p));
}

/** A Timocom-keresés szövege egy irányhoz: „Kisvárda +50 km → Budapest +50 km”. */
export function timocomKeresSzoveg(honnan: string, i: Irany): string {
  return `${honnan} +50 km → ${i.cel.varos} +${CSOPORT_KM} km`;
}
