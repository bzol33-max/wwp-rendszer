// A papírlap megkeresése és kiegyenesítése a TELEFONON, OpenCV-vel
// (2026-10-23, Budaházi Zoltán: „nem jó, próbáltuk, keresd meg a legjobb
// módszert … appon belül kell, ingyenesen”).
//
// Miért így: a saját, fényesség-küszöbös szerveroldali vágó a valódi
// fotókon (kézben tartott, hajtott, napos/árnyékos lap, mögötte másik papír)
// rossz részt vágott ki, és a „tisztítás” kifakította a lapot. A bevált
// ingyenes megoldás ugyanaz, amit a CamScanner-szerű appok csinálnak:
//
//  1. élkeresés (Canny) → kontúrok → a legnagyobb, közel téglalap alakú
//     négyszög a lap (OpenCV.js, Apache-2.0, a saját szerverünkről töltve —
//     public/vendor/opencv-4.10.0.js, csak a fotózáskor töltődik be);
//  2. a sofőr LÁTJA a négy sarkot, és ujjal elhúzhatja, ha rossz — a döntés
//     az övé, a gép csak javasol; ha a lap kilóg a képből, a teljes kép marad;
//  3. kiegyenesítés (perspektíva-transzformáció), SZÍNESEN, utólagos
//     „tisztítás” nélkül — a kép úgy megy be, ahogy a sofőr jóváhagyta.
//
// Ha az OpenCV nem töltődik be (pl. térerő nélkül, első használatkor), a
// fotó vágás nélkül megy tovább — semmi nem vész el.

export type Pont = { x: number; y: number };
/** Bal-felső, jobb-felső, jobb-alsó, bal-alsó — a kép arányában (0–1). */
export type Sarkok = [Pont, Pont, Pont, Pont];

/** A teljes kép sarkai (nincs vágás). */
export const TELJES_KEP: Sarkok = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const OPENCV_URL = "/vendor/opencv-4.10.0.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- az OpenCV.js típus nélküli globális */
type CV = any;

// FIGYELEM: az OpenCV.js modul maga is „thenable” (van .then-je), ezért egy
// Promise-t SOSEM oldunk fel közvetlenül vele — a Promise újra és újra a
// .then-jét hívná, és a betöltés soha nem érne véget. Dobozban adjuk vissza.
let betoltes: Promise<{ cv: CV }> | null = null;

/** Az OpenCV.js betöltése egyszer, a fotózás első használatakor (≈10 MB, utána a böngésző gyorsítótárából). */
export function betoltOpenCv(idokorlatMs = 30_000): Promise<{ cv: CV }> {
  if (betoltes) return betoltes;
  betoltes = new Promise<{ cv: CV }>((ok, hiba) => {
    const w = window as unknown as { cv?: CV };
    const kesz = (cv: CV) => {
      if (cv?.Mat) ok({ cv });
      else cv.onRuntimeInitialized = () => ok({ cv });
    };
    if (w.cv) return kesz(w.cv);
    const s = document.createElement("script");
    s.src = OPENCV_URL;
    s.async = true;
    s.onload = () => (w.cv ? kesz(w.cv) : hiba(new Error("OpenCV nem töltődött be")));
    s.onerror = () => hiba(new Error("OpenCV nem tölthető le"));
    document.head.appendChild(s);
    setTimeout(() => hiba(new Error("OpenCV időtúllépés")), idokorlatMs);
  }).catch((e) => {
    betoltes = null;
    throw e;
  });
  return betoltes;
}

function tav(a: Pont, b: Pont): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Négy pont sorba rendezése: bal-felső, jobb-felső, jobb-alsó, bal-alsó (x+y és y−x szélsőértékek). */
export function rendezd(p: Pont[]): Sarkok {
  const s = [...p];
  const bf = s.reduce((a, b) => (b.x + b.y < a.x + a.y ? b : a));
  const ja = s.reduce((a, b) => (b.x + b.y > a.x + a.y ? b : a));
  const jf = s.reduce((a, b) => (b.x - b.y > a.x - a.y ? b : a));
  const ba = s.reduce((a, b) => (b.x - b.y < a.x - a.y ? b : a));
  return [bf, jf, ja, ba];
}

function terulet(p: Pont[]): number {
  let t = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    t += a.x * b.y - b.x * a.y;
  }
  return Math.abs(t) / 2;
}

/**
 * Ennél kisebb talált négyszöget NEM ajánlunk fel vágásnak: a valódi fotókon
 * (2026-10-21, Micó kapujegye) a kisebb négyszög jellemzően a lapon belüli
 * táblázat, nem a lap — inkább a teljes kép marad, a sofőr húzhatja a sarkokat.
 */
export const AJANLOTT_MIN_TERULET = 0.4;

export function sarkokTerulete(s: Sarkok): number {
  return terulet(s);
}

/** A négyszög elfogadható papírlapnak: elég nagy, nem elfajult, és nem a kép maga. */
export function lapnakLatszik(s: Sarkok): boolean {
  const t = terulet(s);
  if (t < 0.2 || t > 0.985) return false;
  const oldalak = [tav(s[0], s[1]), tav(s[1], s[2]), tav(s[2], s[3]), tav(s[3], s[0])];
  if (Math.min(...oldalak) < 0.15) return false;
  // Szemközti oldalak aránya: egy papír ferdén fotózva sem torzul 2,5-szeresnél jobban.
  const r1 = Math.max(oldalak[0], oldalak[2]) / Math.min(oldalak[0], oldalak[2]);
  const r2 = Math.max(oldalak[1], oldalak[3]) / Math.min(oldalak[1], oldalak[3]);
  return r1 < 2.5 && r2 < 2.5;
}

/**
 * A lap sarkai a képen (0–1 arányban), vagy null, ha nincs biztos lap. A
 * `forras` egy OpenCV által olvasható kép (canvas / ImageData / Mat-forrás).
 * Elemzés legfeljebb 900 px-en: gyors, és a széleket így is jól látja.
 */
export function keressLapot(cv: CV, rgba: { data: Uint8ClampedArray; width: number; height: number }): Sarkok | null {
  const { width: w, height: h } = rgba;
  const src = cv.matFromImageData(rgba);
  const szurke = new cv.Mat();
  const elek = new cv.Mat();
  const kontururok = new cv.MatVector();
  const hier = new cv.Mat();
  try {
    cv.cvtColor(src, szurke, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(szurke, szurke, new cv.Size(5, 5), 0);
    // Két küszöbpróba: a nap/árnyék erős éleket ad, a halvány háttér gyengéket.
    let legjobb: Sarkok | null = null;
    let legjobbT = 0;
    for (const [also, felso] of [[40, 120], [20, 70]] as const) {
      cv.Canny(szurke, elek, also, felso);
      const mag = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.morphologyEx(elek, elek, cv.MORPH_CLOSE, mag);
      mag.delete();
      cv.findContours(elek, kontururok, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < kontururok.size(); i++) {
        const c = kontururok.get(i);
        const t = cv.contourArea(c) / (w * h);
        if (t < 0.2) {
          c.delete();
          continue;
        }
        const kozel = new cv.Mat();
        const hull = new cv.Mat();
        cv.convexHull(c, hull);
        const kerulet = cv.arcLength(hull, true);
        for (const eps of [0.02, 0.03, 0.05]) {
          cv.approxPolyDP(hull, kozel, eps * kerulet, true);
          if (kozel.rows === 4) break;
        }
        if (kozel.rows === 4) {
          const pontok: Pont[] = [];
          for (let k = 0; k < 4; k++) pontok.push({ x: kozel.data32S[k * 2] / w, y: kozel.data32S[k * 2 + 1] / h });
          const s = rendezd(pontok);
          const ts = terulet(s);
          if (lapnakLatszik(s) && ts > legjobbT) {
            legjobb = s;
            legjobbT = ts;
          }
        }
        kozel.delete();
        hull.delete();
        c.delete();
      }
      if (legjobb) break;
    }
    return legjobb;
  } finally {
    src.delete();
    szurke.delete();
    elek.delete();
    kontururok.delete();
    hier.delete();
  }
}

/** A kiegyenesített lap mérete pixelben: a szemközti oldalak HOSSZABBIKA, hogy a távoli vég se mosódjon össze. */
export function kimenetMeret(s: Sarkok, w: number, h: number): { w: number; h: number } {
  const p = s.map((q) => ({ x: q.x * w, y: q.y * h }));
  return {
    w: Math.round(Math.max(tav(p[0], p[1]), tav(p[3], p[2]))),
    h: Math.round(Math.max(tav(p[0], p[3]), tav(p[1], p[2]))),
  };
}

/** Perspektíva-kiegyenesítés: a négyszögből szemből nézett téglalap, színesen. */
export function egyenesitsd(
  cv: CV,
  rgba: { data: Uint8ClampedArray; width: number; height: number },
  s: Sarkok
): ImageData {
  const { width: w, height: h } = rgba;
  const m = kimenetMeret(s, w, h);
  const src = cv.matFromImageData(rgba);
  const ki = new cv.Mat();
  const forras = cv.matFromArray(4, 1, cv.CV_32FC2, s.flatMap((q) => [q.x * w, q.y * h]));
  const cel = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, m.w, 0, m.w, m.h, 0, m.h]);
  const M = cv.getPerspectiveTransform(forras, cel);
  try {
    cv.warpPerspective(src, ki, M, new cv.Size(m.w, m.h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    return new ImageData(new Uint8ClampedArray(ki.data), ki.cols, ki.rows);
  } finally {
    src.delete();
    ki.delete();
    forras.delete();
    cel.delete();
    M.delete();
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-explicit-any -- az OpenCV.js típus nélküli */
/**
 * „Szkennelt” kinézet SZÍNESEN (2026-10-23, képfeldolgozási bírálat): a
 * megvilágítás kiegyenlítése csatornánként, binarizálás nélkül — a kék toll
 * és a kék pecsét megmarad (a megbízó éppen ezt nézi), a papír fehér lesz,
 * az árnyék és a hajtás eltűnik.
 *
 *  1. háttér-becslés ¼-es méreten: dilatáció 7×7 (≈28 px teljes méreten,
 *     szélesebb a legvastagabb tollvonásnál), medián 9, vissza nagyítva;
 *  2. csatornánként: ki = be / max(háttér, 40) × 255 (a 40-es padló a mély
 *     árnyékban nem engedi felrobbanni a zajt);
 *  3. szintek: fekete pont a fényesség 1. percentilise, fehér pont 240
 *     (nem lejjebb — a halvány indigós szöveg megmarad), gamma 1,2.
 */
export function feherites(cv: any, kep: ImageData): ImageData {
  const src = cv.matFromImageData(kep);
  const rgb = new cv.Mat();
  const kicsi = new cv.Mat();
  const hatter = new cv.Mat();
  const csat = new cv.MatVector();
  const hcsat = new cv.MatVector();
  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.resize(rgb, kicsi, new cv.Size(Math.max(1, Math.round(rgb.cols / 4)), Math.max(1, Math.round(rgb.rows / 4))), 0, 0, cv.INTER_AREA);
    const mag = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    cv.dilate(kicsi, kicsi, mag);
    mag.delete();
    cv.medianBlur(kicsi, kicsi, 9);
    cv.resize(kicsi, hatter, new cv.Size(rgb.cols, rgb.rows), 0, 0, cv.INTER_LINEAR);
    cv.split(rgb, csat);
    cv.split(hatter, hcsat);
    const n = rgb.cols * rgb.rows;
    const ki = new Uint8ClampedArray(n * 4);
    const cs = [csat.get(0), csat.get(1), csat.get(2)];
    const hs = [hcsat.get(0), hcsat.get(1), hcsat.get(2)];
    // 2. osztás csatornánként + fényesség-hisztogram a fekete ponthoz
    const hiszt = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      let l = 0;
      for (let c = 0; c < 3; c++) {
        const v = Math.min(255, (cs[c].data[i] / Math.max(hs[c].data[i], 40)) * 255);
        ki[i * 4 + c] = v;
        l += c === 0 ? v * 0.299 : c === 1 ? v * 0.587 : v * 0.114;
      }
      ki[i * 4 + 3] = 255;
      hiszt[Math.round(l)]++;
    }
    let fekete = 0;
    for (let s = 0, v = 0; v < 256; v++) {
      s += hiszt[v];
      if (s >= n * 0.01) {
        fekete = v;
        break;
      }
    }
    fekete = Math.min(fekete, 120);
    const feher = 240;
    const tabla = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const t = Math.min(1, Math.max(0, (v - fekete) / (feher - fekete)));
      tabla[v] = Math.round(Math.pow(t, 1.2) * 255);
    }
    for (let i = 0; i < n; i++) {
      ki[i * 4] = tabla[ki[i * 4]];
      ki[i * 4 + 1] = tabla[ki[i * 4 + 1]];
      ki[i * 4 + 2] = tabla[ki[i * 4 + 2]];
    }
    cs.forEach((m) => m.delete());
    hs.forEach((m) => m.delete());
    return new ImageData(ki, rgb.cols, rgb.rows);
  } finally {
    src.delete();
    rgb.delete();
    kicsi.delete();
    hatter.delete();
    csat.delete();
    hcsat.delete();
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
