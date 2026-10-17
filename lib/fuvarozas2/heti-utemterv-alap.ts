// Hét rács 2.0 · becslő motor (tiszta modul, nincs I/O, nincs Date.now()).
// Spec: docs/het-racs-2-terv.md („Becslő motor”), teszt: scripts/teszt-het-utemterv.ts.
//
// Idők kívül: helyi Budapest "YYYY-MM-DDTHH:MM"; belül valós (UTC) percben számolunk a
// kamionstop.ts DST-biztos helpereivel (valos/helyi), a nap-hozzárendelés a helyi naptári nap.
//
// Vezetési szabály (lib/fuvarozas/eta-lanc.ts vezetSzaballyal + megalloTavozas):
//   - min(maradék, szünetig, keretig, tilalomig) vezetés; ha a tilalom ér előbb (vagy egyszerre):
//     megállás az ablak elején, várakozás a végéig (≥ szünet → folyamatos nullázás, ≥ napi pihenő →
//     mindkét számláló nullázás); különben ha keretig <= szünetig → napi pihenő, egyébként szünet.
//   - megállóban várakozás az ablakTol-ig (≥ 45 p szünet, ≥ 660 p napi pihenő); a rakodás nem szünet.
//   - a fuvar első megállója előtti tétlen rés (előző távozás → indulás) ugyanígy várakozásnak számít.
// Napi mérleg: a vezetés/km a ténylegesen arra a helyi napra eső percek szerint (a szakasz km-je a
// vezetett percekkel arányosan oszlik — napi pihenő, kamionstop és éjfél is vágja). A kezdő napon a
// vezetés tartalmazza a kezdes.napiPerc-et. `vegez` = az aznapi utolsó megálló-távozás, ha utána
// aznap nincs több menet / érkezés / napi pihenő / kamionstop; különben null.

import { helyi, napEltol, valos, type TilalmiAblak } from "@/lib/fuvarozas2/kamionstop";
import type { Pont } from "@/lib/fuvarozas2/tervezo-alap";

export type UtemMegallo = {
  tipus: "felrako" | "lerako";
  varos: string;
  nap: string;                 // tervezett nap "YYYY-MM-DD"
  ablakTol: string | null;     // helyi "YYYY-MM-DDTHH:MM"
  ablakIg: string | null;
  rakodasPerc: number;         // tanult vagy alapértelmezett
  /** B1: a megállóban töltött idő állásnak számít (bejegyzés-megálló: szerviz, mosás …), nem rakodás. */
  allasnakSzamit?: boolean;
};
export type UtemFuvar = {
  id: string; cim: string; jelleg: "ber" | "sajat";
  dijFt: number | null;        // forintra váltva; saját: null
  megallok: UtemMegallo[];     // sorrendben, ≥ 1
  /** Menet a megállók között (megallok.length - 1 elem): perc és km. */
  szakaszok: { perc: number; km: number; becsles: boolean }[];
  /** Üres ráállás az előző pontról az első megállóig. */
  raallas: { perc: number; km: number; becsles: boolean };
  /**
   * A „ráállás” valójában rakott menet: a fuvar felrakója (ma-módban) már kész, a lánc onnan
   * indul, és az első hátralévő megálló lerakó. Ekkor a km rakott (rakottKm, ftKm, bér-szétosztás).
   */
  raallasRakott?: boolean;
};
export type UtemKezdes = {
  ido: string;                 // a lánc legkorábbi kezdése (pl. holnap 06:00, vagy most)
  folyamatosPerc: number;      // utolsó ≥45 p szünet óta vezetett
  napiPerc: number;            // ma már vezetett (tachóból: 540 − napi_hatra)
};
export type UtemParam = {
  napKezdes: string;           // "06:00" — egy új nap legkorábbi indulása, ha nincs ablak
  szunetUtanPerc: number; szunetPerc: number; napiMaxPerc: number; napiPihenoPerc: number; // 270/45/540/660
  tilalmak: TilalmiAblak[];
  /**
   * B1 (docs/het-b1-terv.md): a kocsi foglalt időszakai (hely nélküli vagy egész napos bejegyzés,
   * sofőr-távollét), helyi "YYYY-MM-DDTHH:MM". Közben nem vezet és nem rakodik; a kivárás állásnak számít.
   */
  foglalt?: { tol: string; ig: string }[];
};

export type MegalloEredmeny = {
  tipus: "felrako" | "lerako"; varos: string;
  erkezes: string; kezdes: string; tavozas: string; varakozasPerc: number;
  tartalekPerc: number | null; // ablakIg − erkezes (percben); nincs ablakIg → null
};
export type FuvarEredmeny = {
  id: string;
  megallok: MegalloEredmeny[];
  rakottKm: number; uresKmElotte: number; dijFt: number | null; ftKm: number | null; // díj / rakott km, egészre
  legszukebbTartalek: number | null; // min(tartalekPerc), ha van
  becsles: boolean;                  // bármely szakasz becslés
};
export type NapMerleg = {
  nap: string;
  vegez: { ido: string; varos: string } | null;   // az aznapi utolsó távozás (ha aznap ér véget)
  rakottKm: number; uresKm: number;
  berFt: number;              // több napos fuvar: km-arányosan szétosztva a napokra
  vezetesPerc: number;
  napiPihenoTol: string | null; // ha aznap a lánc napi pihenőre áll meg útközben
  kamionstop: TilalmiAblak | null;
  delutanSzabad: { tol: string; maradekVezetesPerc: number } | null; // vegez < 15:00 és maradék ≥ 180
};
export type KocsiUtemterv = { fuvarok: FuvarEredmeny[]; napok: NapMerleg[] };

type NapGyujto = {
  vezetes: number; rakott: number; ures: number; ber: number;
  vegez: { ido: string; varos: string } | null;
  napiPihenoTol: string | null;
  kamionstop: TilalmiAblak | null;
};

const ures = (): NapGyujto => ({ vezetes: 0, rakott: 0, ures: 0, ber: 0, vegez: null, napiPihenoTol: null, kamionstop: null });
const napja = (t: number) => helyi(t).slice(0, 10);
const egesz = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0);

export function utemterv(fuvarok: UtemFuvar[], kezdes: UtemKezdes, p: UtemParam, napok: string[]): KocsiUtemterv {
  const gyujto = new Map<string, NapGyujto>();
  const g = (nap: string) => {
    let x = gyujto.get(nap);
    if (!x) gyujto.set(nap, (x = ures()));
    return x;
  };
  const tilalmak = p.tilalmak
    .map((a) => ({ tol: valos(a.tol), ig: valos(a.ig), ablak: a as TilalmiAblak | null }))
    .sort((a, b) => a.tol - b.tol);
  const foglaltak = (p.foglalt ?? [])
    .map((a) => ({ tol: valos(a.tol), ig: valos(a.ig), ablak: null as TilalmiAblak | null }))
    .filter((a) => Number.isFinite(a.tol) && Number.isFinite(a.ig) && a.ig > a.tol)
    .sort((a, b) => a.tol - b.tol);
  /** Menet közbeni megállás-okok: kamionstop (ablak ≠ null) és foglalt időszak (ablak = null). */
  const blokkok = [...tilalmak, ...foglaltak].sort((a, b) => a.tol - b.tol);

  /** Ha `x` foglalt időszakba esik, annak a végéig tol (egymásba érő időszakokon át). */
  const foglaltUtan = (x: number) => {
    let y = x;
    for (let kor = 0; kor < 50; kor++) {
      const f = foglaltak.find((a) => a.tol <= y && y < a.ig);
      if (!f) break;
      y = f.ig;
    }
    return y;
  };
  /** Rakodás kezdete: ne essen foglalt időszakba, és ne is nyúljon bele (különben utána kezd). */
  const rakodasKezd = (x: number, perc: number) => {
    let y = x;
    for (let kor = 0; kor < 50; kor++) {
      y = foglaltUtan(y);
      const bele = foglaltak.find((a) => a.tol > y && a.tol < y + perc);
      if (!bele) break;
      y = bele.ig;
    }
    return y;
  };

  let t = valos(kezdes.ido);
  let folyamatos = Math.max(0, kezdes.folyamatosPerc);
  let napi = Math.max(0, kezdes.napiPerc);
  g(napja(t)).vezetes += napi;

  /** Állás (várakozás) hatása a számlálókra. */
  const allas = (perc: number) => {
    if (perc >= p.szunetPerc) folyamatos = 0;
    if (perc >= p.napiPihenoPerc) napi = 0;
  };

  /** Vezetett darab rögzítése a napokra (éjfélnél vágva, km arányosan). */
  const rogzit = (tol: number, perc: number, km: number, rakott: boolean, fuvarNapKm: Map<string, number>) => {
    let s = tol;
    let hatra = perc;
    while (hatra > 0) {
      const nap = napja(s);
      const ejfel = valos(`${napEltol(nap, 1)}T00:00`);
      const most = Math.min(hatra, ejfel - s);
      const dkm = (km * most) / perc;
      const x = g(nap);
      x.vezetes += most;
      if (rakott) {
        x.rakott += dkm;
        fuvarNapKm.set(nap, (fuvarNapKm.get(nap) ?? 0) + dkm);
      } else x.ures += dkm;
      x.vegez = null;
      s += most;
      hatra -= most;
    }
  };

  /** Menet a vezetési szabállyal és a kamionstoppal; visszaadja az érkezést. */
  const vezet = (percBe: number, km: number, rakott: boolean, fuvarNapKm: Map<string, number>) => {
    const ossz = egesz(percBe);
    if (ossz <= 0) {
      if (km > 0) {
        const x = g(napja(t));
        if (rakott) {
          x.rakott += km;
          fuvarNapKm.set(napja(t), (fuvarNapKm.get(napja(t)) ?? 0) + km);
        } else x.ures += km;
      }
      return;
    }
    let maradek = ossz;
    // Egymást követő megállás-okok (kamionstop, foglalt) kivárása összeadódik (QA2 #2).
    let egymasUtan = 0;
    // Védőkorlát hibás (óriási) menetidőre.
    for (let kor = 0; maradek > 0 && kor < 1000; kor++) {
      const ban = blokkok.find((a) => a.ig > t);
      if (ban && ban.tol <= t) {
        const x = g(napja(t));
        if (ban.ablak) x.kamionstop ??= { ...ban.ablak };
        x.vegez = null;
        egymasUtan += ban.ig - t;
        allas(egymasUtan);
        t = ban.ig;
        continue;
      }
      egymasUtan = 0;
      const tilalomig = ban ? ban.tol - t : Infinity;
      const szunetig = p.szunetUtanPerc > 0 ? Math.max(0, p.szunetUtanPerc - folyamatos) : Infinity;
      const keretig = p.napiMaxPerc > 0 ? Math.max(0, p.napiMaxPerc - napi) : Infinity;
      const most = Math.min(maradek, szunetig, keretig, tilalomig);
      if (most > 0) {
        rogzit(t, most, (km * most) / ossz, rakott, fuvarNapKm);
        t += most;
        maradek -= most;
        folyamatos += most;
        napi += most;
      }
      if (maradek <= 0) break;
      // A tilalom ér előbb (vagy egyszerre): a következő körben az ablak végéig vár — ez fedi a szünetet/pihenőt.
      if (tilalomig <= Math.min(szunetig, keretig)) continue;
      if (keretig <= szunetig) {
        const x = g(napja(t));
        x.napiPihenoTol ??= helyi(t);
        x.vegez = null;
        t += p.napiPihenoPerc;
        folyamatos = 0;
        napi = 0;
      } else {
        // Ha a szünet tilalmi ablakba nyúlik, a következő kör az ablak végéig vár (a várakozás fedi).
        t += p.szunetPerc;
        folyamatos = 0;
      }
    }
  };

  const fuvarEredmenyek: FuvarEredmeny[] = [];
  const berTetelek: { dij: number; napKm: Map<string, number>; tartalekNap: string }[] = [];

  for (const f of fuvarok) {
    const napKm = new Map<string, number>();
    const megallok: MegalloEredmeny[] = [];
    let elsoTavozasNap: string | null = null;

    for (let i = 0; i < f.megallok.length; i++) {
      const m = f.megallok[i];
      if (i === 0) {
        // Indulás: max(előző távozás, a megálló napjának napKezdes-e); a tétlen rés várakozás.
        const indulas = foglaltUtan(Math.max(t, valos(`${m.nap}T${p.napKezdes}`)));
        allas(indulas - t);
        t = indulas;
        vezet(f.raallas.perc, f.raallas.km, !!f.raallasRakott, napKm);
      } else {
        const sz = f.szakaszok[i - 1] ?? { perc: 0, km: 0, becsles: false };
        vezet(sz.perc, sz.km, true, napKm);
      }
      const erkezes = t;
      g(napja(erkezes)).vegez = null;
      const tol = m.ablakTol ? valos(m.ablakTol) : null;
      const kezd = rakodasKezd(tol != null && tol > erkezes ? tol : erkezes, egesz(m.rakodasPerc));
      const varakozas = kezd - erkezes;
      allas(varakozas);
      const tavozas = kezd + egesz(m.rakodasPerc);
      if (m.allasnakSzamit) allas(tavozas - erkezes);
      t = tavozas;
      g(napja(tavozas)).vegez = { ido: helyi(tavozas), varos: m.varos };
      elsoTavozasNap ??= napja(tavozas);
      megallok.push({
        tipus: m.tipus, varos: m.varos,
        erkezes: helyi(erkezes), kezdes: helyi(kezd), tavozas: helyi(tavozas),
        varakozasPerc: varakozas,
        tartalekPerc: m.ablakIg ? valos(m.ablakIg) - erkezes : null,
      });
    }

    const rakottKm = f.szakaszok.reduce((s, x) => s + x.km, 0) + (f.raallasRakott ? f.raallas.km : 0);
    const tartalekok = megallok.map((m) => m.tartalekPerc).filter((x): x is number => x != null);
    fuvarEredmenyek.push({
      id: f.id,
      megallok,
      rakottKm,
      uresKmElotte: f.raallasRakott ? 0 : f.raallas.km,
      dijFt: f.dijFt,
      ftKm: f.dijFt != null && rakottKm > 0 ? Math.round(f.dijFt / rakottKm) : null,
      legszukebbTartalek: tartalekok.length ? Math.min(...tartalekok) : null,
      becsles: f.raallas.becsles || f.szakaszok.some((x) => x.becsles),
    });
    if (f.jelleg === "ber" && f.dijFt != null) {
      berTetelek.push({ dij: f.dijFt, napKm, tartalekNap: elsoTavozasNap ?? napja(t) });
    }
  }

  // Bér napokra: a rakott km arányában (rakott km nélkül: az első távozás napjára).
  for (const b of berTetelek) {
    const ossz = [...b.napKm.values()].reduce((s, x) => s + x, 0);
    if (ossz > 0) for (const [nap, km] of b.napKm) g(nap).ber += (b.dij * km) / ossz;
    else g(b.tartalekNap).ber += b.dij;
  }

  const napMerlegek: NapMerleg[] = napok.map((nap) => {
    const x = gyujto.get(nap) ?? ures();
    const maradek = p.napiMaxPerc - x.vezetes;
    // Foglalt időszak a végzés és 18:00 között → nincs „délután szabad” (QA2 #5).
    const foglaltDelutan = x.vegez
      ? (() => { const v = valos(x.vegez.ido), e = valos(`${nap}T18:00`); return foglaltak.some((a) => a.tol < e && a.ig > v); })()
      : false;
    const delutanSzabad =
      x.vegez && !foglaltDelutan && x.vegez.ido < `${nap}T15:00` && maradek >= 180 ? { tol: x.vegez.ido, maradekVezetesPerc: maradek } : null;
    return {
      nap,
      vegez: x.vegez,
      rakottKm: x.rakott,
      uresKm: x.ures,
      berFt: x.ber,
      vezetesPerc: x.vezetes,
      napiPihenoTol: x.napiPihenoTol,
      kamionstop: x.kamionstop,
      delutanSzabad,
    };
  });

  return { fuvarok: fuvarEredmenyek, napok: napMerlegek };
}

// --- Betöltő-segédek (tiszta; a heti-utemterv.ts 5. lépése használja, a teszt közvetlenül hívja) ---

export type LancMegalloBe = { tipus: "felrako" | "lerako"; varos: string; cim: string; pont: Pont | null; kesz: boolean };
/** Honnan indul a ráállás: pont (ha ismert) és a hely neve (a koordináta nélküli „azonos hely” döntéshez). */
export type LancHely = { pont: Pont | null; varos: string; cim: string | null };

/**
 * A kocsi láncának kiindulópontjai fuvaronként. Ma-módban a kész fuvarok kimaradnak (csak a
 * kiindulópontot adják, ha még nincs előttük élő fuvar), a kész megállók is kimaradnak; az első
 * élő fuvar a saját utolsó kész megállójából indul. `raallasRakott`: ekkor a fuvar egy felrakója
 * már kész és az első hátralévő megálló lerakó — a ráállás valójában rakott menet.
 */
export function lancKiindulasok<F, M extends LancMegalloBe>(
  fuvarok: { f: F; mind: M[]; keszFuvar: boolean; le: Pont | null }[],
  kezdo: { pont: Pont; varos: string },
  maMod: boolean,
): { f: F; megallok: M[]; honnan: LancHely; raallasRakott: boolean }[] {
  const hely = (m: M): LancHely => ({ pont: m.pont, varos: m.varos, cim: m.cim });
  let hol: LancHely = { pont: kezdo.pont, varos: kezdo.varos, cim: null };
  let vanMarElo = false;
  const ki: { f: F; megallok: M[]; honnan: LancHely; raallasRakott: boolean }[] = [];
  for (const { f, mind, keszFuvar, le } of fuvarok) {
    const hatra = maMod ? mind.filter((m) => !m.kesz) : mind;
    if (maMod && (keszFuvar || hatra.length === 0)) {
      // A már elvégzett fuvar csak a kiindulópontot adja (ha még nincs előtte élő fuvar).
      if (!vanMarElo) {
        const u = [...mind].reverse().find((m) => m.pont);
        const utolso = mind[mind.length - 1];
        if (u) hol = hely(u);
        else if (le) hol = { pont: le, varos: utolso?.varos ?? "", cim: utolso?.cim ?? null };
      }
      continue;
    }
    let raallasRakott = false;
    if (maMod && !vanMarElo) {
      const kezdettKesz = mind.filter((m) => m.kesz && m.pont);
      if (kezdettKesz.length) {
        hol = hely(kezdettKesz[kezdettKesz.length - 1]);
        raallasRakott = hatra[0]?.tipus === "lerako" && mind.some((m) => m.kesz && m.tipus === "felrako");
      }
    }
    ki.push({ f, megallok: hatra, honnan: hol, raallasRakott });
    vanMarElo = true;
    const utolso = hatra[hatra.length - 1];
    hol = { pont: [...hatra].reverse().find((m) => m.pont)?.pont ?? null, varos: utolso?.varos ?? "", cim: utolso?.cim ?? null };
  }
  return ki;
}

const normHely = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Koordináta nélkül: azonos hely, ha a cím egyezik. */
export function azonosHely(a: { varos: string; cim: string | null }, b: { varos: string; cim: string | null }): boolean {
  const ac = normHely(a.cim), bc = normHely(b.cim);
  return !!ac && ac === bc;
}

/** Azonos település (eltérő cím): városon belüli ráállás. */
function azonosTelepules(a: { varos: string }, b: { varos: string }): boolean {
  const av = normHely(a.varos), bv = normHely(b.varos);
  return !!av && av !== "?" && av === bv;
}

/** Városon belüli ráállás becsült ideje, ha nincs koordináta (pl. Debrecen BMW → Nyomdász u.). */
export const VAROSON_BELULI_PERC = 20;

/**
 * A ráállás szakasza: két ismert pont között a `szakasz` (HU-GO / becslés); ha valamelyik pont
 * hiányzik, azonos helyen 0, különben az ismeretlen-szakasz tartalék (`ismeretlenPerc`, 0 km, becslés).
 */
export function raallasSzakasz(
  honnan: LancHely,
  elso: { pont: Pont | null; varos: string; cim: string | null },
  szakasz: (a: Pont, b: Pont) => { perc: number; km: number; becsles: boolean },
  ismeretlenPerc: number,
): { perc: number; km: number; becsles: boolean } {
  if (honnan.pont && elso.pont) return szakasz(honnan.pont, elso.pont);
  if (azonosHely(honnan, elso)) return { perc: 0, km: 0, becsles: false };
  if (azonosTelepules(honnan, elso)) return { perc: VAROSON_BELULI_PERC, km: 0, becsles: true };
  return { perc: ismeretlenPerc, km: 0, becsles: true };
}
