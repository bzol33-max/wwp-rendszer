// Fuvarozás — megbízásonkénti és kocsinkénti költség/eredmény, TISZTA modul
// (se DB, se hálózat): a lib/fuvarozas2/koltseg-adat.ts tölti be az adatot,
// ez számol, a scripts/teszt-koltseg.ts ellenőrzi.
//
// MINDEN SZÁM CÍMKÉZETT: 'teny' (mért/számlázott) vagy 'becsles'.
//
// SZABÁLYOK (Budaházi Zoltán, 2026-10-10):
//   • km — TÉNY: az Ecofleet-utak km-e a megbízás első megálló-ténye és utolsó
//     megálló-ténye közti időablakban (az ablakba csak részben eső út
//     arányosan); BECSLÉS: a rakott km (HU-GO / fuvarlánc). Az odaút üres km-e
//     tájékoztató — a költsége a kocsi „nem hozzárendelt" költségébe kerül.
//   • üzemanyag — TÉNY: a kocsi napi GPS-litere a megbízás aznapi tény-km-ének
//     arányában, × az aznapi tankolás tényleges Ft/l-e (tankolas tábla), ha
//     van, különben NAV − kedvezmény; BECSLÉS: km × alap fogyasztás × ár.
//   • útdíj — TÉNY: a kocsi HU-GO tranzakciói a tény-időablakban; BECSLÉS:
//     tény-ablak nélkül, ha az import lefedi a napot, a nap (más ablakán kívüli)
//     tranzakciói a nap ilyen fuvarjai közt elosztva; ha nem fedi, a tárolt
//     kalkuláció rakott útdíja (fuvar_kalkulacio), végül a rakott km × a flotta
//     átlagos útdíj/km-e.
//   • napi fix — BECSLÉS: napi_koltseg_ft a nap fuvarjai közt (tény-órák
//     arányában, ha mindegyiknek van tény-ablaka, különben egyenlően).
//   • bevétel — TÉNY: a bérfuvar díja; az EUR a teljesítés napjának MNB-
//     árfolyamán, az árfolyam feltüntetésével.
//   • Bérfuvar → EREDMÉNY (bevétel − költség). Saját fuvar → BELSŐ KÖLTSÉG
//     (és Ft/raklap). Az „elkerült költség" (saját rakott km × km-díj) CSAK
//     tájékoztató, a kocsi eredményébe NEM számít bele.
//   • Kocsi: bérfuvar-eredmények összege − a nem hozzárendelt költség
//     (üres utak, állás); a saját belső költség külön oszlop.

import { arfolyamTipusCimke, type ArfolyamTipus } from "@/lib/fuvarozas/arfolyam-alap";

export type Forras = "teny" | "becsles";
export type Tetel = {
  ft: number;
  forras: Forras;
  megjegyzes: string;
  /** Útdíjnál: a kocsi importált HU-GO tranzakcióiból jön (időablak vagy a nap felosztása) — a kocsi összesítője már tartalmazza. */
  hugoBol?: boolean;
  /** Valódi tételekből (pl. a nap HU-GO tranzakcióiból) a megbízásra FELOSZTOTT rész — tény, de nem egy az egyben a megbízásé. */
  felosztva?: boolean;
  /** Kézzel rögzített költségsor (fuvar_megbizas_koltseg, nem gépi) — felülírja az azonos típusú számított tételt. */
  kezi?: boolean;
  /** Kézi útdíjnál: a felülírt, HU-GO-ból számolt rész (a kocsi összesítőjéből ezt vonjuk le, a kézit adjuk hozzá). */
  felulirtHugoFt?: number;
};

/** Kézzel rögzített költségsor (fuvar_megbizas_koltseg, szamitott = false), Ft-ra váltva. */
export type KeziKoltseg = { tipus: string; ft: number; megjegyzes: string | null; forras?: Forras };

/** A kézi sor típusa, amely a számított tételt felülírja (ugyanaz a költség, nem számoljuk kétszer). */
export const KEZI_FELULIRO_TIPUSOK = ["uzemanyag", "utdij", "napi_fix"] as const;
/** Bevétel-oldali kézi sor (pl. továbbszámlázott pótdíj) — nem költség. */
export const KEZI_BEVETEL_TIPUS = "bevetel_potdij";
const KEZI_TIPUS_NEV: Record<string, string> = {
  utdij: "útdíj", uzemanyag: "üzemanyag", napi_fix: "napi fix", sofor: "sofőr", varakozasi_potdij: "várakozási pótdíj",
  kiallasi_dij: "kiállási díj", egyeb: "egyéb", bevetel_potdij: "bevétel-pótdíj",
};
export const keziTipusNev = (t: string) => KEZI_TIPUS_NEV[t] ?? t;

/** "YYYY-MM-DD HH:MM:SS" (budapesti falióra) → összehasonlítható ms (ál-UTC). */
export function idoMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim());
  if (!m) {
    const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    return n ? Date.UTC(+n[1], +n[2] - 1, +n[3]) : NaN;
  }
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

const NAP_MS = 86_400_000;
const napbol = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type GpsUt = { indulas: string; erkezes: string; km: number; liter: number };

/** Egy út km-e (és litere) naponként, az [tol, ig] időablakba eső része szerint, a menetidő arányában. */
export function utakAblakban(utak: GpsUt[], tol: string, ig: string): Map<string, { km: number; liter: number }> {
  const a = idoMs(tol);
  const b = idoMs(ig);
  const ki = new Map<string, { km: number; liter: number }>();
  if (!(b > a)) return ki;
  for (const u of utak) {
    const k = idoMs(u.indulas);
    let v = idoMs(u.erkezes || u.indulas);
    if (!Number.isFinite(k)) continue;
    if (!Number.isFinite(v) || v < k) v = k;
    let arany: number;
    if (v === k) arany = k >= a && k <= b ? 1 : 0;
    else arany = Math.max(0, Math.min(v, b) - Math.max(k, a)) / (v - k);
    if (arany <= 0) continue;
    const nap = u.indulas.slice(0, 10);
    const x = ki.get(nap) ?? { km: 0, liter: 0 };
    x.km += u.km * arany;
    x.liter += u.liter * arany;
    ki.set(nap, x);
  }
  return ki;
}

/** A kocsi napi km/liter összege (a teljes GPS-nap). */
export function napiOsszeg(utak: GpsUt[]): Map<string, { km: number; liter: number }> {
  const ki = new Map<string, { km: number; liter: number }>();
  for (const u of utak) {
    const nap = u.indulas.slice(0, 10);
    const x = ki.get(nap) ?? { km: 0, liter: 0 };
    x.km += u.km;
    x.liter += u.liter;
    ki.set(nap, x);
  }
  return ki;
}

/**
 * A megbízás litere: naponként a kocsi napi literének a megbízás aznapi
 * tény-km-ével arányos része. Ha a nyomkövető aznap nem mért litert (0), az
 * a nap 0 liter — a hívó dönti el, kell-e becslés.
 */
export function literFelosztas(
  megbizasKm: Map<string, { km: number }>,
  napi: Map<string, { km: number; liter: number }>
): { liter: number; literNapok: Map<string, number>; meroNelkul: boolean } {
  let liter = 0;
  let meroNelkul = false;
  const literNapok = new Map<string, number>();
  for (const [nap, x] of megbizasKm) {
    const n = napi.get(nap);
    if (!n || n.km <= 0 || x.km <= 0) continue;
    if (n.liter <= 0) { meroNelkul = true; continue; }
    const l = n.liter * Math.min(1, x.km / n.km);
    literNapok.set(nap, l);
    liter += l;
  }
  return { liter, literNapok, meroNelkul };
}

export type Tankolas = { idopont: string; liter: number | null; osszegFt: number };

/** Napi tényleges Ft/l a tankolásokból (csak ahol a liter is ismert). */
export function tankolasArNaponta(tankolasok: Tankolas[]): Map<string, number> {
  const osszeg = new Map<string, { ft: number; l: number }>();
  for (const t of tankolasok) {
    if (!t.liter || t.liter <= 0) continue;
    const nap = t.idopont.slice(0, 10);
    const x = osszeg.get(nap) ?? { ft: 0, l: 0 };
    x.ft += t.osszegFt;
    x.l += t.liter;
    osszeg.set(nap, x);
  }
  const ki = new Map<string, number>();
  for (const [nap, x] of osszeg) ki.set(nap, x.ft / x.l);
  return ki;
}

/** Az EUR → Ft átváltás eredménye, a használt árfolyammal. */
export type Atvaltas = { ft: number; arfolyam: number; arfolyamNap: string; cimke: string } | null;

export function eurAtvaltas(
  eur: number,
  arf: { ft: number; nap: string; pontos?: boolean; tipus?: ArfolyamTipus; forras?: string } | null | undefined
): Atvaltas {
  if (!arf || !(arf.ft > 0)) return null;
  const ft = Math.round(eur * arf.ft);
  const ar = arf.ft.toLocaleString("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const megj = arfolyamTipusCimke(arf.tipus, arf.pontos);
  return {
    ft,
    arfolyam: arf.ft,
    arfolyamNap: arf.nap,
    cimke: `${arf.forras ?? "MNB"} ${ar} Ft/EUR (${arf.nap}${megj ? `, ${megj}` : ""})`,
  };
}

/** Napok listája [tol, ig] között (legfeljebb `max` nap). */
export function napokKozott(tol: string, ig: string, max = 7): string[] {
  const a = idoMs(tol.slice(0, 10));
  const b = idoMs(ig.slice(0, 10));
  if (!Number.isFinite(a)) return [];
  if (!Number.isFinite(b) || b < a) return [napbol(a)];
  const ki: string[] = [];
  for (let t = a; t <= b && ki.length < max; t += NAP_MS) ki.push(napbol(t));
  return ki;
}

// ---------------------------------------------------------------------------
// Megbízás

export type MegbizasBemenet = {
  id: string;
  jelleg: "ber" | "sajat";
  /** A teljesítés napja (lerakás, ha van, különben a felrakás napja). */
  nap: string;
  felrakasNap: string;
  fuvardij: number | null;
  penznem: string;
  /** Becslés: rakott km (HU-GO / fuvarlánc). */
  rakottKmBecsles: number;
  /** Tájékoztató: az odaút üres km-e (fuvarlánc). */
  uresKmBecsles: number;
  /** Az első megálló ténye (GPS-érkezés vagy sofőr-jelzés) és az utolsó megálló ténye (távozás/kész). */
  tenyTol: string | null;
  tenyIg: string | null;
  /** A tárolt HU-GO-kalkuláció rakott útdíja (bérfuvarnál). */
  utdijBecslesFt: number | null;
  /**
   * Tény-ablak nélküli megbízásnál, ha a kocsi HU-GO importja lefedi a napjait:
   * a napjain (más megbízás tény-ablakán kívül) levő tranzakciók rá eső része
   * (`utdijNapiFelosztas`). null: nincs import a napjaira.
   */
  utdijNapbol?: { ft: number; db: number } | null;
  raklapDb: number | null;
  /** Kézi költségsorok (Ft): az azonos típusú számított tételt felülírják, a többi típus hozzáadódik. */
  kezi?: KeziKoltseg[];
};

export type JarmuKontextus = {
  /** Van-e a kocsinak GPS-e (Ecofleet), és sikerült-e lekérni. */
  vanGps: boolean;
  utak: GpsUt[];
  tankolasok: Tankolas[];
  utdijak: { idopont: string; bruttoFt: number }[];
};

export type Parameterek = {
  napiKoltsegFt: number;
  fogyasztasL100: number;
  sajatKmDijFt: number;
  /** NAV − kedvezmény, Ft/l; null, ha nincs ár. */
  gazolajAr: number | null;
  gazolajCimke: string | null;
  /** A flotta átlagos útdíja Ft/rakott km (a tárolt kalkulációkból), a becslés tartaléka. */
  atlagUtdijFtKm: number | null;
};

export type MegbizasEredmeny = {
  id: string;
  jelleg: "ber" | "sajat";
  nap: string;
  km: { ertek: number; forras: Forras };
  rakottKmBecsles: number;
  uresKmBecsles: number;
  liter: { ertek: number; forras: Forras } | null;
  uzemanyag: Tetel | null;
  utdij: Tetel | null;
  napiFix: Tetel;
  /** Kézi, nem felülíró költségsorok összesen (várakozási pótdíj, kiállási díj, egyéb…) — tény. */
  keziEgyeb: Tetel | null;
  /** Kézi bevétel-pótdíj (bérfuvar bevételéhez adva). */
  keziBevetelFt: number;
  /** Összes költség (üzemanyag + útdíj + napi fix + kézi egyéb). */
  koltsegFt: number;
  koltsegForras: Forras;
  /** Bérfuvar: Ft bevétel (EUR átváltva), null ha EUR és nincs árfolyam. */
  bevetelFt: number | null;
  bevetelEur: number | null;
  atvaltas: Atvaltas;
  /** Bérfuvar: bevétel − költség; saját: null. */
  eredmenyFt: number | null;
  /** Saját fuvar: a belső költség (= koltsegFt); bér: null. */
  belsoKoltsegFt: number | null;
  ftPerRaklap: number | null;
  raklapDb: number | null;
  /** Saját fuvar: rakott km × km-díj — CSAK tájékoztató, semmibe nem adódik hozzá. */
  elkerultKoltsegFt: number | null;
  /** A tény-időablakba eső napok (a napi fix felosztásához). */
  napok: string[];
};

function vegyes(...f: (Forras | null | undefined)[]): Forras {
  return f.every((x) => x == null || x === "teny") ? "teny" : "becsles";
}

/**
 * Egy megbízás költsége és eredménye. A napi fixet a hívó adja (a kocsi
 * napjainak felosztásából: `napiFixFelosztas`).
 */
export function megbizasKoltseg(
  m: MegbizasBemenet,
  k: JarmuKontextus,
  p: Parameterek,
  napiFixFt: number,
  arf?: { ft: number; nap: string; pontos?: boolean; tipus?: ArfolyamTipus; forras?: string } | null
): MegbizasEredmeny {
  // km
  let tenyNapok: Map<string, { km: number; liter: number }> | null = null;
  if (k.vanGps && m.tenyTol && m.tenyIg && idoMs(m.tenyIg) > idoMs(m.tenyTol)) {
    tenyNapok = utakAblakban(k.utak, m.tenyTol, m.tenyIg);
  }
  const tenyKm = tenyNapok ? [...tenyNapok.values()].reduce((a, x) => a + x.km, 0) : 0;
  const km = tenyNapok && tenyKm > 0
    ? { ertek: Math.round(tenyKm), forras: "teny" as const }
    : { ertek: Math.round(m.rakottKmBecsles), forras: "becsles" as const };

  // üzemanyag
  const napiAr = tankolasArNaponta(k.tankolasok);
  let liter: MegbizasEredmeny["liter"] = null;
  let uzemanyag: Tetel | null = null;
  if (km.forras === "teny" && tenyNapok) {
    const f = literFelosztas(tenyNapok, napiOsszeg(k.utak));
    if (f.liter > 0 && !f.meroNelkul) {
      let ft = 0;
      let tankolasbol = 0;
      for (const [nap, l] of f.literNapok) {
        const ar = napiAr.get(nap);
        if (ar != null) { ft += l * ar; tankolasbol++; }
        else if (p.gazolajAr != null) ft += l * p.gazolajAr;
      }
      const arForras = tankolasbol === f.literNapok.size ? "aznapi tankolás Ft/l" : tankolasbol > 0 ? "részben tankolás, részben NAV − kedvezmény" : `NAV − kedvezmény (${p.gazolajCimke ?? "ár"})`;
      if (tankolasbol > 0 || p.gazolajAr != null) {
        liter = { ertek: Math.round(f.liter), forras: "teny" };
        uzemanyag = { ft: Math.round(ft), forras: "teny", megjegyzes: `${Math.round(f.liter)} l (GPS, a napi liter km-arányos része) × ${arForras}` };
      }
    }
  }
  const becsltAr = napiAr.get(m.nap) ?? p.gazolajAr;
  if (!uzemanyag && becsltAr != null && km.ertek > 0) {
    const l = (km.ertek * p.fogyasztasL100) / 100;
    liter = { ertek: Math.round(l), forras: "becsles" };
    uzemanyag = {
      ft: Math.round(l * becsltAr),
      forras: "becsles",
      megjegyzes: `${km.ertek} km × ${p.fogyasztasL100} l/100 km × ${Math.round(becsltAr)} Ft/l${napiAr.has(m.nap) ? " (aznapi tankolás)" : ""}`,
    };
  }

  // útdíj
  let utdij: Tetel | null = null;
  if (m.tenyTol && m.tenyIg) {
    const a = idoMs(m.tenyTol);
    const b = idoMs(m.tenyIg);
    const sorok = k.utdijak.filter((u) => { const t = idoMs(u.idopont); return t >= a && t <= b; });
    if (sorok.length > 0) {
      utdij = { ft: Math.round(sorok.reduce((s, u) => s + u.bruttoFt, 0)), forras: "teny", megjegyzes: `${sorok.length} HU-GO tranzakció a megbízás idejében`, hugoBol: true };
    } else if (k.utdijak.length > 0) {
      // Az import lefedi a megbízás idejét, de nincs benne tranzakció: tényleg nem volt útdíj.
      const napok = k.utdijak.map((u) => u.idopont.slice(0, 10)).sort();
      if (m.tenyTol.slice(0, 10) >= napok[0] && m.tenyIg.slice(0, 10) <= napok[napok.length - 1]) {
        utdij = { ft: 0, forras: "teny", megjegyzes: "nincs HU-GO tranzakció a megbízás idejében (az import lefedi)", hugoBol: true };
      }
    }
  }
  if (!utdij && m.utdijNapbol) {
    // Valódi HU-GO tranzakciók, csak a felosztás számított → tény (felosztva),
    // ugyanúgy, mint a kocsi összesítőjében (ott a teljes összeg tény).
    utdij = {
      ft: Math.round(m.utdijNapbol.ft),
      forras: "teny",
      megjegyzes: `a fuvar napjainak HU-GO tranzakciói (${m.utdijNapbol.db} db), a nap tény-ablak nélküli fuvarjai közt felosztva`,
      hugoBol: true,
      felosztva: true,
    };
  }
  if (!utdij) {
    if (m.utdijBecslesFt != null) utdij = { ft: Math.round(m.utdijBecslesFt), forras: "becsles", megjegyzes: "tárolt HU-GO-kalkuláció (rakott út)" };
    else if (p.atlagUtdijFtKm != null && m.rakottKmBecsles > 0) {
      utdij = { ft: Math.round(m.rakottKmBecsles * p.atlagUtdijFtKm), forras: "becsles", megjegyzes: `${Math.round(m.rakottKmBecsles)} rakott km × flotta-átlag ${Math.round(p.atlagUtdijFtKm)} Ft/km` };
    }
  }

  let napiFix: Tetel = { ft: Math.round(napiFixFt), forras: "becsles", megjegyzes: `napi ${p.napiKoltsegFt.toLocaleString("hu-HU")} Ft a nap fuvarjai közt felosztva` };

  // Kézi sorok: azonos típusnál a kézi TÉNY felülírja a számítottat (nem adódik hozzá).
  const kezi = (m.kezi ?? []).filter((x) => Number.isFinite(x.ft));
  const keziTetel = (tipus: string, elozo: Tetel | null): Tetel | null => {
    const sorok = kezi.filter((x) => x.tipus === tipus);
    if (sorok.length === 0) return elozo;
    const keziForras = vegyes(...sorok.map((x) => x.forras ?? "teny"));
    // Kézi BECSLÉS nem írhat felül mért/számlázott tényt.
    if (keziForras === "becsles" && elozo?.forras === "teny") return elozo;
    return {
      ft: Math.round(sorok.reduce((a, x) => a + x.ft, 0)),
      forras: keziForras,
      megjegyzes: `kézzel rögzítve (${sorok.map((x) => x.megjegyzes || keziTipusNev(tipus)).join("; ")})${elozo ? ` — a számított ${elozo.ft.toLocaleString("hu-HU")} Ft helyett` : ""}`,
      kezi: true,
      // A kocsi összesítőjében a kézi összeg számít; ha HU-GO-részt írt felül, az onnan kikerül (lásd jarmuOsszkoltseg).
      felulirtHugoFt: elozo?.hugoBol ? elozo.ft : undefined,
    };
  };
  uzemanyag = keziTetel("uzemanyag", uzemanyag);
  utdij = keziTetel("utdij", utdij);
  napiFix = keziTetel("napi_fix", napiFix) as Tetel;
  const egyebSorok = kezi.filter((x) => !(KEZI_FELULIRO_TIPUSOK as readonly string[]).includes(x.tipus) && x.tipus !== KEZI_BEVETEL_TIPUS);
  const keziEgyeb: Tetel | null = egyebSorok.length > 0
    ? {
        ft: Math.round(egyebSorok.reduce((a, x) => a + x.ft, 0)),
        forras: vegyes(...egyebSorok.map((x) => x.forras ?? "teny")),
        megjegyzes: egyebSorok.map((x) => `${keziTipusNev(x.tipus)}: ${Math.round(x.ft).toLocaleString("hu-HU")} Ft${x.megjegyzes ? ` (${x.megjegyzes})` : ""}`).join("; "),
        kezi: true,
      }
    : null;
  const keziBevetelFt = Math.round(kezi.filter((x) => x.tipus === KEZI_BEVETEL_TIPUS).reduce((a, x) => a + x.ft, 0));

  const koltsegFt = (uzemanyag?.ft ?? 0) + (utdij?.ft ?? 0) + napiFix.ft + (keziEgyeb?.ft ?? 0);
  const koltsegForras = vegyes(uzemanyag?.forras ?? "becsles", utdij?.forras ?? "becsles", napiFix.forras, keziEgyeb?.forras);

  // bevétel és eredmény
  let bevetelFt: number | null = null;
  let bevetelEur: number | null = null;
  let atvaltas: Atvaltas = null;
  let eredmenyFt: number | null = null;
  let belsoKoltsegFt: number | null = null;
  let ftPerRaklap: number | null = null;
  let elkerultKoltsegFt: number | null = null;
  if (m.jelleg === "ber") {
    const dij = Number(m.fuvardij ?? 0);
    if (m.penznem === "EUR") {
      bevetelEur = dij;
      atvaltas = eurAtvaltas(dij, arf);
      bevetelFt = atvaltas?.ft ?? null;
    } else {
      bevetelFt = Math.round(dij);
    }
    if (bevetelFt != null) bevetelFt += keziBevetelFt;
    eredmenyFt = bevetelFt != null ? bevetelFt - koltsegFt : null;
  } else {
    belsoKoltsegFt = koltsegFt;
    ftPerRaklap = m.raklapDb && m.raklapDb > 0 ? Math.round(koltsegFt / m.raklapDb) : null;
    elkerultKoltsegFt = Math.round(m.rakottKmBecsles * p.sajatKmDijFt);
  }

  return {
    id: m.id, jelleg: m.jelleg, nap: m.nap, km,
    rakottKmBecsles: Math.round(m.rakottKmBecsles), uresKmBecsles: Math.round(m.uresKmBecsles),
    liter, uzemanyag, utdij, napiFix, keziEgyeb, keziBevetelFt, koltsegFt, koltsegForras,
    bevetelFt, bevetelEur, atvaltas, eredmenyFt, belsoKoltsegFt, ftPerRaklap, raklapDb: m.raklapDb, elkerultKoltsegFt,
    napok: m.tenyTol && m.tenyIg ? napokKozott(m.tenyTol, m.tenyIg) : napokKozott(m.felrakasNap, m.nap),
  };
}

/** A megbízás napjai és (ha minden aznapi fuvarnak van tény-ablaka) a tény-órái. */
export type NapiFixBemenet = { id: string; napok: string[]; tenyTol: string | null; tenyIg: string | null };

/**
 * A kocsi napi fix költségének felosztása a megbízások között: minden napon a
 * napi_koltseg_ft-t az aznapi fuvarok kapják — a tény-órák arányában, ha
 * mindegyiknek van tény-ablaka, különben egyenlően. Visszaadja megbízásonként
 * a Ft-ot.
 */
export function napiFixFelosztas(megbizasok: NapiFixBemenet[], napiKoltsegFt: number): Map<string, number> {
  const ki = new Map<string, number>(megbizasok.map((m) => [m.id, 0]));
  const napiLista = new Map<string, NapiFixBemenet[]>();
  for (const m of megbizasok) for (const n of m.napok) napiLista.set(n, [...(napiLista.get(n) ?? []), m]);
  for (const [nap, lista] of napiLista) {
    const napKezd = idoMs(nap);
    const orak = lista.map((m) => {
      if (!m.tenyTol || !m.tenyIg) return null;
      const a = Math.max(idoMs(m.tenyTol), napKezd);
      const b = Math.min(idoMs(m.tenyIg), napKezd + NAP_MS);
      return Math.max(0, b - a);
    });
    const mindTeny = orak.every((o) => o != null && o > 0);
    const ossz = mindTeny ? orak.reduce<number>((a, o) => a + (o ?? 0), 0) : lista.length;
    lista.forEach((m, i) => {
      const suly = mindTeny ? (orak[i] as number) : 1;
      ki.set(m.id, (ki.get(m.id) ?? 0) + (napiKoltsegFt * suly) / ossz);
    });
  }
  return ki;
}

/**
 * Útdíj a tény-ablak nélküli megbízásoknak: ha a kocsi HU-GO importja lefedi
 * a megbízás napját (az import első és utolsó tranzakciója közé esik), a
 * nap azon tranzakciói, amelyek nem esnek más megbízás tény-ablakába, a nap
 * tény-ablak nélküli megbízásai közt egyenlően oszlanak el. Lefedetlen nap →
 * a megbízás nem kap innen semmit (a hívó a tárolt kalkulációval becsül).
 */
export function utdijNapiFelosztas(
  megbizasok: NapiFixBemenet[],
  utdijak: { idopont: string; bruttoFt: number }[]
): Map<string, { ft: number; db: number }> {
  const ki = new Map<string, { ft: number; db: number }>();
  if (utdijak.length === 0) return ki;
  const napok = utdijak.map((u) => u.idopont.slice(0, 10)).sort();
  const elso = napok[0];
  const utolso = napok[napok.length - 1];
  const ablakok = megbizasok
    .filter((m) => m.tenyTol && m.tenyIg)
    .map((m) => [idoMs(m.tenyTol as string), idoMs(m.tenyIg as string)] as const);
  const ablakon = (t: number) => ablakok.some(([a, b]) => t >= a && t <= b);
  const nelkul = megbizasok.filter((m) => !(m.tenyTol && m.tenyIg));
  for (const m of nelkul) {
    const fedett = m.napok.filter((n) => n >= elso && n <= utolso);
    if (fedett.length === 0) continue;
    let ft = 0;
    let db = 0;
    for (const nap of fedett) {
      const osztozik = nelkul.filter((x) => x.napok.includes(nap)).length;
      for (const u of utdijak) {
        if (u.idopont.slice(0, 10) !== nap || ablakon(idoMs(u.idopont))) continue;
        ft += u.bruttoFt / osztozik;
        db++;
      }
    }
    ki.set(m.id, { ft, db });
  }
  return ki;
}

// ---------------------------------------------------------------------------
// Kocsi

export type JarmuOsszkoltseg = {
  uzemanyag: Tetel | null;
  utdij: Tetel | null;
  napiFix: Tetel;
  /** A megbízásokra kézzel rögzített egyéb költségek (várakozási pótdíj, kiállási díj…) — tény. */
  keziEgyeb?: Tetel | null;
};

export type JarmuEredmeny = {
  berDb: number;
  sajatDb: number;
  berBevetelFt: number;
  /** EUR-os bérdíj, amit nem sikerült átváltani (nincs árfolyam) — külön, átváltás nélkül. */
  atvaltatlanEur: number;
  berKoltsegFt: number;
  /** A bérfuvarok eredményének összege. */
  berEredmenyFt: number;
  /** A saját fuvarok belső költsége — KÜLÖN oszlop, nem része az eredménynek. */
  sajatBelsoKoltsegFt: number;
  /** Tájékoztató: saját rakott km × km-díj — NEM része semmilyen eredménynek. */
  elkerultKoltsegFt: number;
  /** A kocsi összes költsége az időszakban (tény, ahol mért). */
  osszKoltsegFt: number;
  osszKoltsegForras: Forras;
  /** Összes költség − a megbízásokra osztott költség: üres utak, állás, a fel nem osztott napok. */
  nemHozzarendeltFt: number;
  /** A kocsi eredménye: bérfuvar-eredmény − nem hozzárendelt költség. A saját belső költség NEM vonódik le benne kétszer — külön oszlop. */
  eredmenyFt: number;
};

export function jarmuEredmeny(megbizasok: MegbizasEredmeny[], ossz: JarmuOsszkoltseg): JarmuEredmeny {
  const ber = megbizasok.filter((m) => m.jelleg === "ber");
  const sajat = megbizasok.filter((m) => m.jelleg === "sajat");
  const berBevetelFt = ber.reduce((a, m) => a + (m.bevetelFt ?? 0), 0);
  const atvaltatlanEur = ber.filter((m) => m.bevetelEur != null && m.bevetelFt == null).reduce((a, m) => a + (m.bevetelEur ?? 0), 0);
  // Ha egy EUR-os díj nincs átváltva, a fuvar költsége akkor is a kocsit terheli.
  const berKoltsegFt = ber.reduce((a, m) => a + m.koltsegFt, 0);
  const berEredmenyFt = berBevetelFt - berKoltsegFt;
  const sajatBelsoKoltsegFt = sajat.reduce((a, m) => a + (m.belsoKoltsegFt ?? 0), 0);
  const elkerultKoltsegFt = sajat.reduce((a, m) => a + (m.elkerultKoltsegFt ?? 0), 0);
  const osszKoltsegFt = (ossz.uzemanyag?.ft ?? 0) + (ossz.utdij?.ft ?? 0) + ossz.napiFix.ft + (ossz.keziEgyeb?.ft ?? 0);
  const hozzarendelt = megbizasok.reduce((a, m) => a + m.koltsegFt, 0);
  const nemHozzarendeltFt = osszKoltsegFt - hozzarendelt;
  return {
    berDb: ber.length,
    sajatDb: sajat.length,
    berBevetelFt,
    atvaltatlanEur,
    berKoltsegFt,
    berEredmenyFt,
    sajatBelsoKoltsegFt,
    elkerultKoltsegFt,
    osszKoltsegFt,
    osszKoltsegForras: vegyes(ossz.uzemanyag?.forras ?? "becsles", ossz.utdij?.forras ?? "becsles", ossz.napiFix.forras, ossz.keziEgyeb?.forras),
    nemHozzarendeltFt,
    eredmenyFt: berEredmenyFt - nemHozzarendeltFt,
  };
}

/**
 * A kocsi teljes költsége az időszakban. Üzemanyag: GPS-liter × ár (tény), ha
 * van GPS, különben a megbízások becslése. Útdíj: a HU-GO tranzakciók (tény),
 * ha van import a kocsira, különben a megbízások becslése. Napi fix: az aktív
 * napok (GPS-mozgás vagy megbízás) × napi költség.
 */
export function jarmuOsszkoltseg(
  k: JarmuKontextus,
  megbizasok: MegbizasEredmeny[],
  p: Parameterek,
  aktivNapok: number
): JarmuOsszkoltseg {
  let uzemanyag: Tetel | null = null;
  const literOssz = k.utak.reduce((a, u) => a + u.liter, 0);
  if (k.vanGps && literOssz > 0) {
    const napiAr = tankolasArNaponta(k.tankolasok);
    let ft = 0;
    let ok = true;
    for (const [nap, x] of napiOsszeg(k.utak)) {
      const ar = napiAr.get(nap) ?? p.gazolajAr;
      if (ar == null) { ok = false; break; }
      ft += x.liter * ar;
    }
    if (ok) uzemanyag = { ft: Math.round(ft), forras: "teny", megjegyzes: `${Math.round(literOssz)} l (GPS) × aznapi tankolás Ft/l vagy NAV − kedvezmény` };
  }
  if (!uzemanyag) {
    const becsles = megbizasok.reduce((a, m) => a + (m.uzemanyag?.ft ?? 0), 0);
    uzemanyag = { ft: becsles, forras: "becsles", megjegyzes: "a megbízások becsült üzemanyaga (nincs mért liter)" };
  }
  // Útdíj: a kocsi összes importált HU-GO tranzakciója (tény) + azoknak a
  // megbízásoknak a becslése, amelyek napjait az import nem fedi le.
  // Kézi útdíj, amely egy megbízás HU-GO-részét írta felül: a kocsi szintjén is a kézi összeg számít.
  const felulirtFt = megbizasok.reduce((a, m) => a + (m.utdij?.felulirtHugoFt ?? 0), 0);
  const hugoFt = Math.round(k.utdijak.reduce((a, u) => a + u.bruttoFt, 0)) - felulirtFt;
  // Az import által nem fedett fuvarok útdíja: becslés, vagy kézzel rögzített tény.
  const kivul = megbizasok.filter((m) => m.utdij && !m.utdij.hugoBol).map((m) => m.utdij as Tetel);
  const kivulFt = kivul.reduce((a, t) => a + t.ft, 0);
  const kivulBecslesFt = kivul.filter((t) => t.forras !== "teny").reduce((a, t) => a + t.ft, 0);
  const kivulKeziFt = kivulFt - kivulBecslesFt;
  const utdij: Tetel = k.utdijak.length > 0
    ? {
        ft: hugoFt + kivulFt,
        forras: kivulBecslesFt > 0 ? "becsles" : "teny",
        megjegyzes: `${k.utdijak.length} HU-GO tranzakció${kivulKeziFt > 0 ? ` + ${kivulKeziFt.toLocaleString("hu-HU")} Ft kézzel rögzítve` : ""}${kivulBecslesFt > 0 ? ` + ${kivulBecslesFt.toLocaleString("hu-HU")} Ft becslés az import által nem fedett fuvarokra` : ""}`,
      }
    : {
        ft: kivulFt,
        forras: kivul.length > 0 && kivulBecslesFt === 0 ? "teny" : "becsles",
        megjegyzes: kivulKeziFt > 0 ? `nincs HU-GO import — ${kivulKeziFt.toLocaleString("hu-HU")} Ft kézzel rögzítve, a többi becslés` : "a megbízások becsült útdíja (nincs HU-GO import)",
      };
  const napiFix: Tetel = { ft: aktivNapok * p.napiKoltsegFt, forras: "becsles", megjegyzes: `${aktivNapok} aktív nap × ${p.napiKoltsegFt.toLocaleString("hu-HU")} Ft` };
  const keziEgyebFt = megbizasok.reduce((a, m) => a + (m.keziEgyeb?.ft ?? 0), 0);
  const keziEgyeb: Tetel | null = keziEgyebFt !== 0
    ? {
        ft: keziEgyebFt,
        forras: vegyes(...megbizasok.map((m) => m.keziEgyeb?.forras)),
        megjegyzes: "a megbízásokra kézzel rögzített egyéb költségek (várakozási pótdíj, kiállási díj…)",
        kezi: true,
      }
    : null;
  return { uzemanyag, utdij, napiFix, keziEgyeb };
}

/**
 * A Kimutatás fejlécének „Megtett km”-e: kocsinként a GPS-tény km, ha a
 * kocsinak van mérése (GPS és km > 0); különben a fuvarlánc becslése
 * (rakott + üres). Ha bármelyik kocsi becsült, az egész szám becslés.
 * (Korábban GPS nélkül „0 km · tény” jelent meg, miközben a becslés ott volt.)
 */
export function fejlecKmSzamitas(
  jarmuvek: { vanGps: boolean; km: number; berKm: number; sajatKm: number; uresKm: number }[]
): { ertek: number; forras: Forras; tenyKm: number; becsultKm: number; becsultKocsi: number } {
  let tenyKm = 0;
  let becsultKm = 0;
  let becsultKocsi = 0;
  for (const j of jarmuvek) {
    if (j.vanGps && j.km > 0) tenyKm += j.km;
    else {
      const b = j.berKm + j.sajatKm + j.uresKm;
      if (b > 0) { becsultKm += b; becsultKocsi++; }
    }
  }
  return {
    ertek: Math.round(tenyKm + becsultKm),
    forras: becsultKocsi > 0 || tenyKm === 0 ? "becsles" : "teny",
    tenyKm: Math.round(tenyKm),
    becsultKm: Math.round(becsultKm),
    becsultKocsi,
  };
}
