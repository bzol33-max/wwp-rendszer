// A sofőr app (2026-10-21, Budaházi Zoltán: „a 9-es terv”, gyorsgombos
// kezdőlap) tiszta, böngészőben és szerveren is futtatható számításai —
// szándékosan függőség nélkül, hogy a scripts/teszt-sofor-app.ts adatbázis
// nélkül ellenőrizhesse őket.
//
//  - becsült útvonal-km a kocsi élő pozíciójától a soros megállóig;
//  - fogyasztás-összesítés a jarmu_can_nap napjaiból (csak liter és km —
//    a sofőr pénzt nem lát);
//  - a papír neve fuvartípus szerint;
//  - a fotózás minőség-ellenőrzése (élesség, világosság, egész lap) és a
//    kamera „stabil a kép” figyelése szürkeárnyalatos kis képkockákon.

/** Légvonal → közúti km. A magyar úthálózaton a valós út jellemzően 1,2–1,3-szoros. */
export const UT_SZORZO = 1.25;

export function legvonalKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Becsült közúti km egész számra; 1 km alatt 0 (a kocsi gyakorlatilag ott van). */
export function becsultUtKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const km = legvonalKm(a, b) * UT_SZORZO;
  return km < 1 ? 0 : Math.round(km);
}

/**
 * A lerakás után kért papír. Bérfuvarnál az aláírt fuvarlevél / CMR (enélkül
 * nem számlázunk), saját fuvarnál az átvevő által aláírt szállítólevél (ettől
 * zárul a fuvar) — ugyanaz a szabály, mint a régi PapirKeres kártyán.
 */
export function papirNeve(sajatFuvar: boolean): string {
  return sajatFuvar ? "aláírt szállítólevél" : "aláírt fuvarlevél (CMR)";
}

// ---------------------------------------------------------------- fogyasztás

export type FogyasztasNap = { nap: string; liter: number | null; km: number | null };
export type FogyasztasIdoszak = { l100: number | null; km: number };
export type SoforFogyasztasKep = {
  ma: FogyasztasIdoszak;
  het: FogyasztasIdoszak;
  elozoHet: FogyasztasIdoszak;
  ketHet: FogyasztasIdoszak;
  /** A 7 napos átlag és az előző 7 nap különbsége literben (negatív = jobb). Null, ha bármelyik hiányzik. */
  valtozas: number | null;
  /** Az utolsó 7 nap, naponként (régebbitől a maiig); l100 null, ha aznap nem volt elég km. */
  napok: { nap: string; l100: number | null; km: number }[];
};

/** Egy napon ennyi km alatt az átlag nem mond semmit (pár km tolatás 60 l/100-at mutatna). */
const NAPI_MIN_KM = 30;
/** Időszakra ugyanez — a flotta-átlag (jarmuTelemetriaOsszesit) is 100 km-től számol. */
const IDOSZAK_MIN_KM = 100;

function napEltolva(napISO: string, delta: number): string {
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap + delta, 12));
  return d.toISOString().slice(0, 10);
}

function egyNapErtek(n: FogyasztasNap): { liter: number; km: number } | null {
  const l = n.liter, k = n.km;
  if (l == null || k == null || !Number.isFinite(l) || !Number.isFinite(k) || k <= 0 || l < 0) return null;
  return { liter: l, km: k };
}

export function fogyasztasIdoszak(napok: FogyasztasNap[], tolNap: string, igNap: string, minKm = IDOSZAK_MIN_KM): FogyasztasIdoszak {
  let liter = 0, km = 0;
  for (const n of napok) {
    if (n.nap < tolNap || n.nap > igNap) continue;
    const e = egyNapErtek(n);
    if (!e) continue;
    liter += e.liter;
    km += e.km;
  }
  return { l100: km >= minKm ? Math.round((liter / km) * 1000) / 10 : null, km: Math.round(km) };
}

export function fogyasztasKep(napok: FogyasztasNap[], maNap: string): SoforFogyasztasKep {
  const het = fogyasztasIdoszak(napok, napEltolva(maNap, -6), maNap);
  const elozoHet = fogyasztasIdoszak(napok, napEltolva(maNap, -13), napEltolva(maNap, -7));
  const napiLista = Array.from({ length: 7 }, (_, i) => {
    const nap = napEltolva(maNap, i - 6);
    const e = fogyasztasIdoszak(napok, nap, nap, NAPI_MIN_KM);
    return { nap, l100: e.l100, km: e.km };
  });
  return {
    ma: fogyasztasIdoszak(napok, maNap, maNap, NAPI_MIN_KM),
    het,
    elozoHet,
    ketHet: fogyasztasIdoszak(napok, napEltolva(maNap, -13), maNap),
    valtozas: het.l100 != null && elozoHet.l100 != null ? Math.round((het.l100 - elozoHet.l100) * 10) / 10 : null,
    napok: napiLista,
  };
}

/** „27,4” — magyar tizedesvesszővel. */
export function tizedes(x: number): string {
  return x.toFixed(1).replace(".", ",");
}

// ------------------------------------------------------- dátum a kártyákon

const NAP_NEVEK = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];
const HONAP_ROVID = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];

/** "ma", "holnap", a hét napja 6 napon belül, különben "okt. 23.". */
export function napCimke(napISO: string | null | undefined, maNap: string): string | null {
  if (!napISO) return null;
  if (napISO === maNap) return "ma";
  if (napISO === napEltolva(maNap, 1)) return "holnap";
  if (napISO === napEltolva(maNap, -1)) return "tegnap";
  const [ev, ho, nap] = napISO.split("-").map(Number);
  const d = new Date(Date.UTC(ev, ho - 1, nap, 12));
  const ma = new Date(`${maNap}T12:00:00Z`);
  const kul = Math.round((d.getTime() - ma.getTime()) / 86_400_000);
  if (kul > 1 && kul < 7) return NAP_NEVEK[d.getUTCDay()];
  return `${HONAP_ROVID[ho - 1]} ${nap}.`;
}

// ------------------------------------------------- fotó: minőség, stabilitás

export type KepMinoseg = {
  /** A legerősebb élek meredeksége (lásd elesseg); nagyobb = élesebb. */
  elesseg: number;
  /** Átlagos fényesség 0–255. */
  fenyesseg: number;
  /** A papírnak gondolt világos folt befoglaló téglalapja a kép arányában (0–1), vagy null. */
  lap: { x0: number; y0: number; x1: number; y1: number } | null;
  eles: boolean;
  vilagos: boolean;
  /** A lap nem lóg ki a képből (egyik széle sem ér a kép széléhez). */
  egeszLap: boolean;
};

/**
 * Az élesség küszöbe TELJES felbontású részleten (lásd reszletKivagasok):
 * 12 MP-es, 34 px-es betűs szállítólevélen az éles kép ~560, a 2 px-es
 * elmosás ~260, a 3 px-es ~140 (még olvasható), az 5 px-es ~65 (már nem).
 * A fényesség- és lap-küszöbök a 320 px széles kicsinyített képkockára
 * vonatkoznak.
 */
export const ELESSEG_KUSZOB = 120;
/** A részlet-kivágás oldala képpontban (teljes felbontásból, kicsinyítés nélkül). */
export const RESZLET_PX = 400;

/** Három RESZLET_PX-es kivágás bal felső sarka a kép függőleges közepén (25/50/75%): ha a közepén üres a lap, a másik kettőn van szöveg. */
export function reszletKivagasok(w: number, h: number): { x: number; y: number }[] {
  const c = Math.min(RESZLET_PX, w, h);
  const x = Math.max(0, Math.round((w - c) / 2));
  return [0.25, 0.5, 0.75].map((f) => ({ x, y: Math.max(0, Math.min(h - c, Math.round(h * f - c / 2))) }));
}
export const SOTET_KUSZOB = 70;
export const TUL_VILAGOS_KUSZOB = 245;

/** RGBA képpontokból szürkeárnyalat (Rec. 601 súlyok). */
export function szurkeArnyalat(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  }
  return out;
}

/**
 * Élesség: a legerősebb élek (a betűk széle) meredeksége. Előbb 3×3-as
 * átlagolás — a kamera zaját ez elnyeli, a betűk éle megmarad —, majd a
 * Sobel-gradiens 98. percentilise. Életlen / bemozdult képen a betűk széle
 * elkenődik, ez az érték leesik; a zaj (sötét kabin) nem emeli meg, ahogy a
 * Laplace-szórást megemelné.
 */
export function elesseg(g: Uint8Array, w: number, h: number): number {
  if (w < 5 || h < 5) return 0;
  const s = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      s[i] = (g[i - w - 1] + g[i - w] + g[i - w + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + w - 1] + g[i + w] + g[i + w + 1]) / 9;
    }
  }
  const hiszt = new Uint32Array(1024);
  let db = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const gx = s[i - w + 1] + 2 * s[i + 1] + s[i + w + 1] - s[i - w - 1] - 2 * s[i - 1] - s[i + w - 1];
      const gy = s[i + w - 1] + 2 * s[i + w] + s[i + w + 1] - s[i - w - 1] - 2 * s[i - w] - s[i - w + 1];
      hiszt[Math.min(1023, Math.round(Math.hypot(gx, gy)))]++;
      db++;
    }
  }
  let hatra = Math.floor(db * 0.02);
  for (let v = 1023; v >= 0; v--) {
    hatra -= hiszt[v];
    if (hatra <= 0) return v;
  }
  return 0;
}

export function fenyesseg(g: Uint8Array): number {
  if (!g.length) return 0;
  let s = 0;
  for (let i = 0; i < g.length; i++) s += g[i];
  return s / g.length;
}

/**
 * A lap helye: a papír szinte mindig világosabb a háttérnél (műszerfal,
 * asztal, kabin). A kép átlagánál jóval világosabb képpontokból soronként és
 * oszloponként megnézzük, hol van belőlük legalább 35% — ez a befoglaló
 * téglalap. Nem perspektíva-javítás, csak visszajelzés: a fotót NEM vágjuk
 * vele (egy rossz vágás a számlázáshoz kellő aláírást vághatná le).
 */
export function lapKeret(g: Uint8Array, w: number, h: number): KepMinoseg["lap"] {
  const atlag = fenyesseg(g);
  const kuszob = Math.min(235, atlag + 25);
  const sorDb = new Uint32Array(h);
  const oszlopDb = new Uint32Array(w);
  let vilagosDb = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y * w + x] >= kuszob) {
        sorDb[y]++;
        oszlopDb[x]++;
        vilagosDb++;
      }
    }
  }
  if (vilagosDb < w * h * 0.12) return null;
  const sorMin = w * 0.35, oszlopMin = h * 0.35;
  let y0 = -1, y1 = -1, x0 = -1, x1 = -1;
  for (let y = 0; y < h; y++) if (sorDb[y] >= sorMin) { if (y0 < 0) y0 = y; y1 = y; }
  for (let x = 0; x < w; x++) if (oszlopDb[x] >= oszlopMin) { if (x0 < 0) x0 = x; x1 = x; }
  if (y0 < 0 || x0 < 0) return null;
  const lap = { x0: x0 / w, y0: y0 / h, x1: (x1 + 1) / w, y1: (y1 + 1) / h };
  if ((lap.x1 - lap.x0) * (lap.y1 - lap.y0) < 0.15) return null;
  return lap;
}

/**
 * `reszletElesseg`: a teljes felbontású részletek (reszletKivagasok) közül a
 * legélesebb értéke. Ha nincs megadva, a kicsinyített képből számolunk — az
 * csak durva becslés, mert 320 px-en a betűk elmosódása alig látszik.
 */
export function kepMinoseg(g: Uint8Array, w: number, h: number, reszletElesseg?: number): KepMinoseg {
  const e = reszletElesseg ?? elesseg(g, w, h);
  const f = fenyesseg(g);
  const lap = lapKeret(g, w, h);
  const szel = 0.015;
  return {
    elesseg: e,
    fenyesseg: f,
    lap,
    eles: e >= ELESSEG_KUSZOB,
    vilagos: f >= SOTET_KUSZOB && f <= TUL_VILAGOS_KUSZOB,
    egeszLap: lap != null && lap.x0 > szel && lap.y0 > szel && lap.x1 < 1 - szel && lap.y1 < 1 - szel,
  };
}

/** Két egymás utáni képkocka átlagos eltérése (0–255); kicsi = a telefon nem mozog. */
export function kepkockaElteres(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || !a.length) return 255;
  let s = 0;
  for (let i = 0; i < a.length; i += 2) s += Math.abs(a[i] - b[i]);
  return s / Math.ceil(a.length / 2);
}

export const STABIL_ELTERES = 6;
/** Ennyi egymás utáni stabil, éles, lapot mutató képkocka után fotóz magától (≈1 mp 150 ms-onként). */
export const AUTO_FOTO_KOCKA = 7;
