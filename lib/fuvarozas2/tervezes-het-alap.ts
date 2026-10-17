// Tervezés · A hét (az új terv 2. oldala, 2026-10-11) — tiszta számolás:
// kocsinként a hét fuvarjai, a köztük lévő üres utak („rések”), a szabad
// napok; egy beérkezett ajánlat mennyit tesz hozzá egy réshez; kiket érdemes
// hívni a saját múltból. Légvonal × 1,3 (KOZUTI_SZORZO) — becslés, a
// Kalkulátor számol pontosan (HU-GO). Teszt: scripts/teszt-tervezes-het.ts.

import { legvonalKm, type Pont } from "@/lib/fuvarozas2/tervezo-alap";
import { munkanap, munkaszunetiNap, torvenyesUnnep } from "@/lib/jelenlet/shared";
import { arLetra, felfeleKerekit, FT_LEPES, type ArLetra } from "@/lib/fuvarozas2/ar-letra";

export const RES_MIN_KM = 100;
export const ATLAG_KMH = 60;

export type HetiFuvar = {
  id: string;
  cim: string;
  felVaros: string;
  leVaros: string;
  fel: Pont | null;
  le: Pont | null;
  felNap: string;
  leNap: string;
  sajat: boolean;
  /** A megbízás állapota (allapotgep) — a kártya kész / úton jeléhez. */
  allapot?: string;
};

export type Res = {
  kulcs: string;
  kocsi: string;
  sofor: string;
  nap: string;
  honnan: string;
  hova: string;
  a: Pont;
  b: Pont;
  km: number;
  ft: number;
  haza: boolean;
  /** A fuvar azonosítója, amelynek a felrakójához ez az üres út vezet (a cellában elé kerül). */
  elott?: string;
};

export type HetiKocsi = { kod: string; sofor: string; fuvarok: HetiFuvar[]; elozoVeg: { pont: Pont; varos: string } | null };

export type NapCella = { nap: string; fuvarok: HetiFuvar[]; resek: Res[]; szabad: boolean };

export function utKm(a: Pont, b: Pont): number {
  return Math.round(legvonalKm(a, b));
}

/**
 * Az egy napon induló fuvarok sorrendje (2026-10-17): nem a rögzítés
 * sorrendje, hanem földrajzi fűzés — mindig az jön, amelyiknek a felrakója
 * a legközelebb van ahhoz, ahol a kocsi épp áll (az előző lerakó, vagy a hét
 * elején az indulási pont). Pl. Gergő H: Nyírbátor → Budapest, utána
 * Budapest → Szakoly — nem fordítva (az 2 × 270 km hamis üres utat adott).
 * Koordináta nélküli fuvar a csoport végére kerül, a sorrendje megmarad.
 */
export function napBelulFuzve(rendezett: HetiFuvar[], kezdo: Pont | null): HetiFuvar[] {
  const ki: HetiFuvar[] = [];
  let hol: Pont | null = kezdo;
  let i = 0;
  while (i < rendezett.length) {
    let j = i;
    while (j < rendezett.length && rendezett[j].felNap === rendezett[i].felNap) j++;
    const maradek = rendezett.slice(i, j);
    while (maradek.length) {
      let leg = 0;
      if (hol && maradek.length > 1) {
        let legKm = Infinity;
        maradek.forEach((f, n) => {
          const km = f.fel ? legvonalKm(hol!, f.fel) : Infinity;
          if (km < legKm) { legKm = km; leg = n; }
        });
      }
      const [f] = maradek.splice(leg, 1);
      ki.push(f);
      hol = f.le ?? null;
    }
    i = j;
  }
  return ki;
}

/** Kocsinként a hét rései (üres út ≥ 100 km) és napcellái. */
/**
 * `ma` (2026-10-14): a ma előtti napokra nem számolunk rést és nem írunk
 * „szabad”-ot — ami elmúlt, abba már nem lehet fuvart tenni.
 */
export function hetiReszek(k: HetiKocsi, napok: string[], telephely: { pont: Pont; varos: string }, kmKoltseg: number, ma?: string): { cellak: NapCella[]; resek: Res[] } {
  const elso = napok[0], utolso = napok[napok.length - 1];
  const heti = napBelulFuzve(
    k.fuvarok.filter((f) => f.felNap <= utolso && f.leNap >= elso).sort((x, y) => x.felNap.localeCompare(y.felNap) || x.leNap.localeCompare(y.leNap)),
    (k.elozoVeg ?? telephely).pont
  );
  const resek: Res[] = [];
  // Ahol a kocsi áll; null, ha egy fuvar lerakójának nincs koordinátája (onnan nem becsülünk).
  let hol: { pont: Pont; varos: string } | null = k.elozoVeg ?? telephely;
  let holNap = elso;
  for (const f of heti) {
    if (f.fel && hol) {
      const km = utKm(hol.pont, f.fel);
      if (km >= RES_MIN_KM) {
        const nap = f.felNap < elso ? elso : f.felNap;
        resek.push({ kulcs: `${k.kod}:${resek.length}`, kocsi: k.kod, sofor: k.sofor, nap, honnan: hol.varos, hova: f.felVaros, a: hol.pont, b: f.fel, km, ft: Math.round(km * kmKoltseg), haza: false, elott: f.id });
      }
    }
    hol = f.le ? { pont: f.le, varos: f.leVaros } : null;
    holNap = f.leNap;
  }
  if (heti.length && hol) {
    const km = utKm(hol.pont, telephely.pont);
    if (km >= RES_MIN_KM && holNap <= utolso) {
      resek.push({ kulcs: `${k.kod}:${resek.length}`, kocsi: k.kod, sofor: k.sofor, nap: holNap < elso ? elso : holNap, honnan: hol.varos, hova: telephely.varos, a: hol.pont, b: telephely.pont, km, ft: Math.round(km * kmKoltseg), haza: true });
    }
  }
  const elo = ma ? resek.filter((x) => x.nap >= ma) : resek;
  const cellak = napok.map((nap) => {
    const fuvarok = heti.filter((f) => f.felNap <= nap && f.leNap >= nap);
    const r = elo.filter((x) => x.nap === nap);
    return { nap, fuvarok, resek: r, szabad: fuvarok.length === 0 && r.length === 0 && (!ma || nap >= ma) };
  });
  return { cellak, resek: elo };
}

export type AjanlatHely = { varos: string; pont: Pont | null; nap: string | null };

export type Illeszkedes = {
  res: Res;
  plusKm: number;
  plusPerc: number;
  tobbletFt: number;
  rakottKm: number;
  /** Ráállás: a rés kezdőpontjától a felrakóig (üres km). */
  raallasKm: number;
  /** Az ajánlat TELJES önköltsége: (ráállás + rakott km) × km-költség + az idő az óradíjjal. */
  teljesFt: number;
  /** Az árlétra a teljes önköltségre (+10/20/30%, Ft és EUR) — ez a fő ár. */
  letra: ArLetra;
  /** Teljes önköltség +10% (a létra minimuma). */
  minFt: number;
  /** Teljes önköltség +20% — „mennyit kérj”. */
  kerjFt: number;
  minEur: number | null;
  kerjEur: number | null;
  /** Alsó határ visszfuvarnál: a többlet (határköltség) +10%, Ft és EUR. */
  alsoFt: number;
  alsoEur: number | null;
  /** Ár-memória: a hasonló korábbi fuvarok Ft/km-e erre az útra (tájékoztató, a kérést nem emeli). */
  elozmenyFt: number | null;
  draga: boolean;
};

const napKul = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/**
 * Egy ajánlat (felrakó F, lerakó L) beillesztése egy résbe (A → B):
 * +km = A→F + F→L + L→B − A→B. Csak ha a felrakás napja a rés napjától
 * legfeljebb 1 napra van (vagy ismeretlen), és a kerülő ≤ 250 km.
 */
export type IllesztParam = { kmKoltseg: number; oraFt: number; ftKmElozmeny: number | null; eurArfolyam?: number | null };

export function illeszt(res: Res, fel: AjanlatHely, le: AjanlatHely, p: IllesztParam): Illeszkedes | null {
  if (!fel.pont || !le.pont) return null;
  if (fel.nap && Math.abs(napKul(res.nap, fel.nap)) > 1) return null;
  const rakottKm = utKm(fel.pont, le.pont);
  const plusKm = Math.max(0, utKm(res.a, fel.pont) + rakottKm + utKm(le.pont, res.b) - res.km);
  if (plusKm > 250) return null;
  const plusPerc = Math.round((plusKm / ATLAG_KMH) * 60) + 60; // + 1 óra fel- és lerakás
  const tobbletFt = Math.round(plusKm * p.kmKoltseg + (plusPerc / 60) * p.oraFt);
  // Fő ár: az árlétra az ajánlat TELJES önköltségére (ráállás + rakott út, az
  // idő a napi fix arányában) — ugyanazzal a becsléssel, mint a többlet.
  const raallasKm = utKm(res.a, fel.pont);
  const teljesPerc = Math.round(((raallasKm + rakottKm) / ATLAG_KMH) * 60) + 60;
  const teljesFt = Math.round((raallasKm + rakottKm) * p.kmKoltseg + (teljesPerc / 60) * p.oraFt);
  const arf = p.eurArfolyam ?? null;
  const letra = arLetra(teljesFt, arf);
  const [min, kerj] = letra.fokok;
  // Alsó határ visszfuvarnál: a többlet (határköltség) +10%.
  const also = arLetra(tobbletFt, arf).fokok[0];
  const elozmenyFt = p.ftKmElozmeny != null ? felfeleKerekit(p.ftKmElozmeny * rakottKm, FT_LEPES) : null;
  return {
    res, plusKm, plusPerc, tobbletFt, rakottKm, raallasKm, teljesFt, letra,
    minFt: min.ft, kerjFt: kerj.ft, minEur: min.eur, kerjEur: kerj.eur,
    alsoFt: also.ft, alsoEur: also.eur, elozmenyFt, draga: plusKm > 100,
  };
}

/** A legkisebb többletű rés egy ajánlathoz. */
export function legjobbRes(resek: Res[], fel: AjanlatHely, le: AjanlatHely, p: IllesztParam): Illeszkedes | null {
  let best: Illeszkedes | null = null;
  for (const r of resek) {
    const i = illeszt(r, fel, le, p);
    if (i && (!best || i.tobbletFt < best.tobbletFt)) best = i;
  }
  return best;
}

export type MultFuvar = { partner: string; fel: Pont | null; felVaros: string; leVaros: string; nap: string; dijFt: number | null };
export type HivandoPartner = { partner: string; db: number; utolsoUt: string; utolsoNap: string; utolsoDijFt: number | null; tavKm: number };

/** Kiket hívj: akik a rés kezdőpontjától ≤ 50 km-re rakattak fel nálunk, legalább kétszer. */
export function kiketHivj(res: Res, mult: MultFuvar[], maxKm = 50): HivandoPartner[] {
  const m = new Map<string, { sorok: MultFuvar[]; tav: number }>();
  for (const f of mult) {
    if (!f.fel) continue;
    const tav = utKm(res.a, f.fel);
    if (tav > maxKm) continue;
    const x = m.get(f.partner) ?? { sorok: [], tav };
    x.sorok.push(f);
    x.tav = Math.min(x.tav, tav);
    m.set(f.partner, x);
  }
  return [...m.entries()]
    .filter(([, x]) => x.sorok.length >= 2)
    .map(([partner, x]) => {
      const u = [...x.sorok].sort((a, b) => b.nap.localeCompare(a.nap))[0];
      return { partner, db: x.sorok.length, utolsoUt: `${u.felVaros} → ${u.leVaros}`, utolsoNap: u.nap, utolsoDijFt: u.dijFt, tavKm: x.tav };
    })
    .sort((a, b) => b.db - a.db || a.tavKm - b.tavKm)
    .slice(0, 6);
}

/** A Hét nézet ablaka (2026-10-17, Budaházi Zoltán): nem naptári hét, hanem egy munkanap vissza + előre, 6 munkanap. */
export const ABLAK_MUNKANAP = 6;

const napLep = (nap: string, delta: number) => {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

/** Az előző munkanap (hétvége, ünnep átugorva). */
export function elozoMunkanap(nap: string): string {
  let d = nap;
  for (let i = 0; i < 14; i++) { d = napLep(d, -1); if (munkanap(d)) return d; }
  return d;
}

/** Az alapablak első napja: a mai előtti munkanap („egy nap vissza”). */
export function ablakKezdet(ma: string): string {
  return elozoMunkanap(ma);
}

/** `n` munkanappal odébb (negatív: vissza). A kiinduló nap nem számít. */
export function munkanapLepes(nap: string, n: number): string {
  let d = nap;
  const irany = n < 0 ? -1 : 1;
  for (let db = 0, i = 0; db < Math.abs(n) && i < 60; i++) { d = napLep(d, irany); if (munkanap(d)) db++; }
  return d;
}

/**
 * Az ablak napjai `kezdet`-től: `ABLAK_MUNKANAP` munkanap; a köztük lévő nem
 * munkanap (szombat, ünnep) csak akkor oszlop, ha `fuvarVan(nap)` — vasárnap soha.
 */
export function tervAblak(kezdet: string, fuvarVan: (nap: string) => boolean = () => false): string[] {
  const ki: string[] = [];
  let d = kezdet;
  for (let db = 0, i = 0; db < ABLAK_MUNKANAP && i < 60; i++, d = napLep(d, 1)) {
    if (munkanap(d)) { ki.push(d); db++; continue; }
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0 && fuvarVan(d)) ki.push(d);
  }
  return ki;
}

/** A tervezett hét: hétköznap az aktuális hét hétfőjétől, vasárnap a következő hétfőtől; hétfő–szombat. */
export function tervHetNapjai(ma: string): string[] {
  const d = new Date(`${ma}T12:00:00Z`);
  const nap = d.getUTCDay();
  const hetfoEltolas = nap === 0 ? 1 : -(nap - 1);
  d.setUTCDate(d.getUTCDate() + hetfoEltolas);
  const ki: string[] = [];
  for (let i = 0; i < 6; i++) {
    ki.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ki;
}

/**
 * Kocsira váró (még ki nem osztott) fuvarok a hét napjaira bontva (2026-10-12:
 * a Ma heti rácsa megszűnt, ez volt az egyetlen hely, ahol a holnaputáni kocsi
 * nélküli fuvar látszott). A fuvar a felrakása napján áll; ha az a hét előtt
 * volt, de a fuvar még tart, a hét első napján. A már lerakott (a mai nap
 * előtt véget ért) és a hét utáni fuvar nem kerül be.
 */
export function kiosztatlanCellak(fuvarok: HetiFuvar[], napok: string[], ma: string): HetiFuvar[][] {
  const cellak: HetiFuvar[][] = napok.map(() => []);
  if (!napok.length) return cellak;
  const utolso = napok[napok.length - 1];
  for (const f of fuvarok) {
    if (f.leNap < ma || f.leNap < napok[0] || f.felNap > utolso) continue;
    const nap = f.felNap < napok[0] ? napok[0] : f.felNap;
    const i = napok.indexOf(nap);
    if (i >= 0) cellak[i].push(f);
  }
  return cellak;
}

/** A hét kezdőnapja (hétfő) `n` héttel odébb — a hét-lapozáshoz. */
export function hetEltolva(hetfo: string, n: number): string {
  const d = new Date(`${hetfo}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

/** A kártya állapot-jele: kész (lerakva / utána), úton, vagy terv. */
export function fuvarJel(allapot: string | undefined): "kesz" | "uton" | "terv" {
  if (!allapot) return "terv";
  if (allapot === "folyamatban") return "uton";
  if (["teljesitve", "szamlazhato", "szamlazva", "email_elment", "postazva", "lezart"].includes(allapot)) return "kesz";
  return "terv";
}

/**
 * Mennyire friss egy Timocom-ajánlat (2026-10-14). A Timocomon egy ajánlat
 * jellemzően órák alatt elkel: 24 óra után „régi”, és dátum nélkül sem
 * tartjuk elöl 24 óránál tovább.
 */
export function ajanlatFrissesseg(rogzitveIso: string, most: Date): { orak: number; szoveg: string; regi: boolean } {
  const orak = Math.max(0, Math.floor((most.getTime() - Date.parse(rogzitveIso)) / 3_600_000));
  const szoveg = orak < 1 ? "most jött" : orak < 24 ? `${orak} órája` : `${Math.floor(orak / 24)} napja`;
  return { orak, szoveg, regi: orak >= 24 };
}

/** A következő munkanap: hétvégét és munkaszüneti napot átugorja (a Jelenlét ünnepnaptárával), ledolgozós szombat munkanap. */
export function kovetkezoMunkanap(ma: string): string {
  const d = new Date(`${ma}T12:00:00Z`);
  for (let i = 0; i < 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (munkanap(iso)) return iso;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Visszfuvar-riasztás (2. hullám #3): a ma és a következő munkanap üres útjai
 * (rés ≥ 100 km, a hazaút is) — időrendben, egy napon belül a hosszabb elöl.
 */
export function riasztandoResek(resek: Res[], ma: string): Res[] {
  const kov = kovetkezoMunkanap(ma);
  return resek.filter((r) => r.nap >= ma && r.nap <= kov).sort((a, b) => a.nap.localeCompare(b.nap) || b.km - a.km);
}

export type RiasztasAjanlat = { id: string; megbizo: string | null; felVaros: string; leVaros: string; regi: boolean; illik: Illeszkedes };
export type VisszfuvarRiasztas = { res: Res; ajanlat: RiasztasAjanlat | null; hivandok: HivandoPartner[] };

/** Egy réshez a legjobb ajánlat: friss előbb, azon belül a legkisebb többlet; a hívandókból az első 3. */
export function riasztasOsszerak(res: Res, jeloltek: RiasztasAjanlat[], hivandok: HivandoPartner[]): VisszfuvarRiasztas {
  const rendezve = [...jeloltek].sort((a, b) => Number(a.regi) - Number(b.regi) || a.illik.tobbletFt - b.illik.tobbletFt);
  return { res, ajanlat: rendezve[0] ?? null, hivandok: hivandok.slice(0, 3) };
}

const ROVID_NAPNEV = ["V", "H", "K", "Sze", "Cs", "P", "Szo"];

/**
 * Hétvége/ünnep sáv (Rács 2.0, 2026-10-17): két egymást követő oszlop közti
 * kihagyott nem-munkanapok, a második oszlop napja előtt. Címke: rövid napnév, + „ünnep”
 * (törvényes ünnep) vagy „pihenőnap” (áthelyezett pihenőnap), „ · ” elválasztóval,
 * pl. „P ünnep · Szo · V”. Teszt: scripts/teszt-het-szunetsav.ts.
 */
export function szunetSavok(napok: string[]): { elott: string; cimke: string }[] {
  const ki: { elott: string; cimke: string }[] = [];
  for (let i = 1; i < napok.length; i++) {
    const cimkek: string[] = [];
    for (let d = napLep(napok[i - 1], 1), n = 0; d < napok[i] && n < 60; d = napLep(d, 1), n++) {
      if (munkanap(d)) continue; // a kihagyott munkanap (pl. tesztben, lapozásnál) nem sáv
      const nev = ROVID_NAPNEV[new Date(`${d}T12:00:00Z`).getUTCDay()];
      cimkek.push(torvenyesUnnep(d) ? `${nev} ünnep` : munkaszunetiNap(d) ? `${nev} pihenőnap` : nev);
    }
    if (cimkek.length) ki.push({ elott: napok[i], cimke: cimkek.join(" · ") });
  }
  return ki;
}
