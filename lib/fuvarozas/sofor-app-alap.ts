// A sofőr app (2026-10-21, Budaházi Zoltán: „a 9-es terv”, gyorsgombos
// kezdőlap) tiszta, böngészőben és szerveren is futtatható számításai —
// szándékosan függőség nélkül, hogy a scripts/teszt-sofor-app.ts adatbázis
// nélkül ellenőrizhesse őket.
//
//  - fogyasztás-összesítés a jarmu_can_nap napjaiból (csak liter és km —
//    a sofőr pénzt nem lát);
//  - a papír neve fuvartípus szerint.

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
