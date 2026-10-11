// Az élő ETA-lánc (actions.ts lancoltEloBecsles) szabályai, tisztán, hálózat
// nélkül — tesztelhető (scripts/teszt-eta-lanc.ts). (2026-10-11)
//
// Eddig a lánc csak a HU-GO menetidőt × tanult napszaki szorzót és egy fix
// rakodási puffert adott össze, így:
//   - egy 6 órás úton hiányzott a kötelező 45 perces szünet (az ETA korai),
//   - a 9 órás napi keret után is "ma" ért oda a kocsi,
//   - a kapunyitás előtt "megérkezett" és rögtön tovább is ment,
//   - minden helyen 30/45 perc volt a rakodás, a mért helyett.
// A szabályok a 561/2006/EK közúti alapjai (a menetterv-optimalizáló
// lib/menet/optimalizalo.ts vezet() függvényével azonos szünet-logika).
// A sofőr állapota GPS-ből becsült, nem tachográf-adat.

import type { IdovonalSzakasz } from "./idovonal";

export type SoforAllapot = {
  /** Az utolsó ≥45 perces állás óta vezetett perc. */
  folyamatosPerc: number;
  /** A mai (a lánc napján) összesen vezetett perc. */
  napiPerc: number;
};

export type LancSzabaly = {
  /** Ennyi folyamatos vezetés után kötelező a szünet (270 = 4,5 óra). */
  szunetUtanPerc: number;
  /** A szünet hossza (45). */
  szunetPerc: number;
  /** Napi vezetési keret (540 = 9 óra). */
  napiMaxPerc: number;
  /** Napi pihenő (660 = 11 óra). */
  napiPihenoPerc: number;
};

export const ALAP_SZABALY: LancSzabaly = { szunetUtanPerc: 270, szunetPerc: 45, napiMaxPerc: 540, napiPihenoPerc: 660 };

const PERC = 60000;

/**
 * Egy szakasz levezetése a szünet- és napi-keret szabállyal. `allapot`
 * frissül (a hívó a következő szakasznál ugyanezt adja tovább).
 */
export function vezetSzaballyal(
  indulas: Date,
  menetPerc: number,
  allapot: SoforAllapot,
  p: LancSzabaly = ALAP_SZABALY
): { erkezes: Date; szunetDb: number; pihenoDb: number } {
  let t = indulas.getTime();
  let maradek = Math.max(0, menetPerc);
  let szunetDb = 0;
  let pihenoDb = 0;
  // Védőkorlát: egy hibás (óriási) menetidő se pörögjön végtelen ciklusban.
  for (let kor = 0; maradek > 0 && kor < 50; kor++) {
    const szunetig = p.szunetUtanPerc > 0 ? Math.max(0, p.szunetUtanPerc - allapot.folyamatosPerc) : Infinity;
    const keretig = p.napiMaxPerc > 0 ? Math.max(0, p.napiMaxPerc - allapot.napiPerc) : Infinity;
    const most = Math.min(maradek, szunetig, keretig);
    t += most * PERC;
    maradek -= most;
    allapot.folyamatosPerc += most;
    allapot.napiPerc += most;
    if (maradek <= 0) break;
    if (keretig <= szunetig) {
      // Napi keret elfogyott: napi pihenő, utána új nap.
      t += p.napiPihenoPerc * PERC;
      allapot.folyamatosPerc = 0;
      allapot.napiPerc = 0;
      pihenoDb++;
    } else {
      t += p.szunetPerc * PERC;
      allapot.folyamatosPerc = 0;
      szunetDb++;
    }
  }
  return { erkezes: new Date(t), szunetDb, pihenoDb };
}

/**
 * Egy megálló: érkezés után (ha az ablak még nem nyílt ki) várakozás az
 * ablak nyitásáig, majd a rakodás. A ≥ szünet hosszú várakozás szünetnek
 * számít (mint az optimalizálóban); a rakodás maga nem.
 */
export function megalloTavozas(
  erkezes: Date,
  ablakTol: Date | null,
  rakodasPerc: number,
  allapot: SoforAllapot,
  p: LancSzabaly = ALAP_SZABALY
): { kezdes: Date; tavozas: Date; varakozasPerc: number } {
  const kezdesMs = ablakTol && ablakTol.getTime() > erkezes.getTime() ? ablakTol.getTime() : erkezes.getTime();
  const varakozasPerc = Math.round((kezdesMs - erkezes.getTime()) / PERC);
  if (varakozasPerc >= p.szunetPerc) allapot.folyamatosPerc = 0;
  // Egy éjszakányi várakozás (holnapi ablak) napi pihenő is.
  if (varakozasPerc >= p.napiPihenoPerc) allapot.napiPerc = 0;
  return { kezdes: new Date(kezdesMs), tavozas: new Date(kezdesMs + Math.max(0, rakodasPerc) * PERC), varakozasPerc };
}

/**
 * A sofőr mostani állapota a nap GPS-szakaszaiból: összes vezetés, és az
 * utolsó ≥ szünet hosszú állás vége óta vezetett idő. (Az idővonal szakaszai
 * a mai napra szólnak, az élő, még nyitott vezetéssel/állással együtt.)
 */
export function soforAllapotSzakaszokbol(szakaszok: IdovonalSzakasz[], p: LancSzabaly = ALAP_SZABALY): SoforAllapot {
  let napiSec = 0;
  let folyamatosSec = 0;
  for (const sz of szakaszok) {
    if (sz.tipus === "vezetes") {
      napiSec += sz.idotartamSec;
      folyamatosSec += sz.idotartamSec;
    } else if (sz.tipus === "allas" && sz.idotartamSec >= p.szunetPerc * 60) {
      folyamatosSec = 0;
    }
  }
  return { folyamatosPerc: Math.round(folyamatosSec / 60), napiPerc: Math.round(napiSec / 60) };
}

/** Ékezet- és írásjel-független összevetési kulcs. */
export function helyKulcs(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type TanultRakodasIdo = { hely: string; perc: number; minta: number };

/**
 * A megálló tanult (mért, medián) rakodási ideje, ha a helyre van legalább
 * 3 mérés: a leghosszabb egyező helynév nyer (a "Debrecen" helyett a
 * "BMW HU Plant Debrecen", ha az a cím). Nincs egyezés: null (a hívó a
 * beállított pufferrel számol).
 */
export function tanultRakodas(cim: string, nyersCim: string | null, tanult: TanultRakodasIdo[]): number | null {
  const c = ` ${helyKulcs(`${nyersCim ?? ""} ${cim}`)} `;
  let legjobb: TanultRakodasIdo | null = null;
  for (const t of tanult) {
    if (t.minta < 3 || !(t.perc > 0)) continue;
    const k = helyKulcs(t.hely);
    if (k.length < 3 || !c.includes(` ${k} `)) continue;
    if (!legjobb || k.length > helyKulcs(legjobb.hely).length) legjobb = t;
  }
  return legjobb ? legjobb.perc : null;
}

/** Medián egész percben (0, ha üres). A 600 percnél hosszabb "rakodás" éjszakázás, nem számít. */
export function rakodasMedian(percek: number[]): { perc: number; minta: number } {
  const e = percek.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n < 600).sort((a, b) => a - b);
  if (!e.length) return { perc: 0, minta: 0 };
  const k = Math.floor(e.length / 2);
  const median = e.length % 2 ? e[k] : (e[k - 1] + e[k]) / 2;
  return { perc: Math.round(median), minta: e.length };
}

export type EtaMeres = { horizontPerc: number; hibaPerc: number };
export type EtaPontossag = { sav: string; minta: number; p50: number; p80: number; eltolodas: number };

/** Előrejelzési távok: mennyivel az érkezés előtt készült a becslés. */
export const ETA_SAVOK: { sav: string; tol: number; ig: number }[] = [
  { sav: "30 percen belül", tol: 0, ig: 30 },
  { sav: "30–90 perccel előtte", tol: 30, ig: 90 },
  { sav: "1,5–4 órával előtte", tol: 90, ig: 240 },
  { sav: "4 órán túl", tol: 240, ig: 24 * 60 },
];

function percentilis(rendezett: number[], q: number): number {
  if (!rendezett.length) return 0;
  return rendezett[Math.min(rendezett.length - 1, Math.floor(q * rendezett.length))];
}

/**
 * Mérési sorokból (becslés − tény, perc; + = későn becsült érkezés, azaz a
 * kocsi korábban ért oda) sávonként: abszolút hiba P50/P80, és a medián
 * előjeles eltolódás (szisztematikus hiba). Csak a legalább 5 mintás sáv.
 */
export function etaPontossagStat(meresek: EtaMeres[]): EtaPontossag[] {
  return ETA_SAVOK.flatMap(({ sav, tol, ig }) => {
    const m = meresek.filter((x) => x.horizontPerc >= tol && x.horizontPerc < ig);
    if (m.length < 5) return [];
    const abs = m.map((x) => Math.abs(x.hibaPerc)).sort((a, b) => a - b);
    const elojeles = m.map((x) => x.hibaPerc).sort((a, b) => a - b);
    return [{ sav, minta: m.length, p50: Math.round(percentilis(abs, 0.5)), p80: Math.round(percentilis(abs, 0.8)), eltolodas: Math.round(percentilis(elojeles, 0.5)) }];
  });
}
