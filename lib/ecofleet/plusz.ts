// Ecofleet: tank, tachó-terv, sebesség és tankolás-egyeztetés. Tiszta számítások (DB, hálózat nélkül).
// Alapszabály: hiányzó / nem szám adat → null, SOHA nem 0.

import { ecofleetIdopont } from "@/lib/ecofleet/szamitas";

const objektum = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function szam(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const mpBolPerc = (v: unknown): number | null => {
  const n = szam(v);
  return n === null ? null : Math.round(n / 60);
};

/** A getLastData `fuel` mezője literben adja a tartály szintjét (élő mérés 2026-11-04: 838 l, a nyers Fuel-lel azonos). */
export function tankLiterLastDatabol(sor: unknown): number | null {
  return objektum(sor) ? szam(sor.fuel) : null;
}

export type TachoTerv = {
  /** Csak vezetés közben jön; álló kocsinál a hátralévő vezetési idő (szunetigPerc) marad. */
  szunetIdopont: Date | null;
  szunetigPerc: number | null;
  napiPihenoIdopont: Date | null;
  napiPihenoigPerc: number | null;
};

/** A tcoData következő kötelező szünete és napi pihenője; nincs tcoData → null. */
export function tachoTervLastDatabol(sor: unknown): TachoTerv | null {
  if (!objektum(sor) || !objektum(sor.tcoData)) return null;
  const t = sor.tcoData;
  return {
    szunetIdopont: ecofleetIdopont(t.nextDrivingBreakTimestamp),
    szunetigPerc: mpBolPerc(t.nextDrivingBreak),
    napiPihenoIdopont: ecofleetIdopont(t.nextDailyRestTimestamp),
    napiPihenoigPerc: mpBolPerc(t.nextDailyRest),
  };
}

/** Igaz, ha a becsült érkezés a kötelező napi pihenő kezdete után van. */
export function pihenoErkezesElott(terv: TachoTerv | null, eta: Date | null): boolean {
  return !!terv?.napiPihenoIdopont && !!eta && eta.getTime() > terv.napiPihenoIdopont.getTime();
}

/** A GPS szerinti max. ennél nagyobb → túllépés. A korlátozó 90 körül vág, a GPS pár km/h-t téved. */
export const SEBESSEG_HATAR_KMH = 95;

export function sebessegOsszegzes(utak: { maxSpeed: number }[], hatar = SEBESSEG_HATAR_KMH): { max: number | null; tullepesDb: number; utDb: number } {
  const ertekek = utak.map((u) => u.maxSpeed).filter((x) => Number.isFinite(x) && x > 0);
  return {
    max: ertekek.length ? Math.max(...ertekek) : null,
    tullepesDb: ertekek.filter((x) => x > hatar).length,
    utDb: utak.length,
  };
}

// ── Tankolás-egyeztetés ───────────────────────────────────────────────────
// Élő mérés 2026-11-04: menet közben a szenzor mintánként 50–80 litert is ugrik
// (lötyögés), a valódi tankolások viszont 300–730 literesek, és néha két
// lépésben jönnek. Ezért csak a ≥ 150 literes ugrás számít, a közeli ugrások
// pedig egy tankolásnak számítanak. A kisebb rátöltést így nem látjuk.

export type SzenzorUgras = { idopont: string; hozzaadott: number; literElotte?: number; literUtana?: number };
export type SzenzorTankolas = { idopont: Date; liter: number };
export type SzamlaTankolas = { idopont: Date; liter: number | null };

export const TANKOLAS_KUSZOB_L = 150;
const CSOPORT_MS = 90 * 60_000;
const ABLAK_MS = 6 * 3_600_000;
const LITER_TURES = 100;

export function szenzorTankolasok(ugrasok: SzenzorUgras[]): SzenzorTankolas[] {
  const rendben = ugrasok
    .map((u) => ({ t: ecofleetIdopont(u.idopont), l: szam(u.hozzaadott), elotte: szam(u.literElotte), utana: szam(u.literUtana) }))
    .filter((u): u is { t: Date; l: number; elotte: number | null; utana: number | null } => !!u.t && u.l !== null)
    .sort((a, b) => a.t.getTime() - b.t.getTime());
  // Egy tankolás literje a szint nettó emelkedése, így a közben lötyögő ugrások nem adódnak össze.
  const csoportok: { t: Date; utolso: number; liter: number; max: number; elotte: number | null; utana: number | null }[] = [];
  for (const u of rendben) {
    const c = csoportok[csoportok.length - 1];
    if (c && u.t.getTime() - c.utolso <= CSOPORT_MS) {
      c.utolso = u.t.getTime();
      c.liter += u.l;
      c.max = Math.max(c.max, u.l);
      c.utana = u.utana;
    } else {
      csoportok.push({ t: u.t, utolso: u.t.getTime(), liter: u.l, max: u.l, elotte: u.elotte, utana: u.utana });
    }
  }
  return csoportok.filter((c) => c.max >= TANKOLAS_KUSZOB_L).map((c) => ({ idopont: c.t, liter: Math.round(c.elotte !== null && c.utana !== null ? c.utana - c.elotte : c.liter) }));
}

export type EgyeztetesTetel = {
  tipus: "egyezik" | "elteres" | "nincsSzamla" | "nincsSzenzor";
  idopont: Date;
  szenzorL: number | null;
  szamlaL: number | null;
};

/**
 * Szenzor és kútszámla összevetése egy kocsira. A `szenzorNapok` azok a budapesti
 * napok, amelyekről van szenzoradat: máskor a számla hiánya nem jelent eltérést.
 */
export function tankolasEgyeztetes(szenzor: SzenzorTankolas[], szamlak: SzamlaTankolas[], szenzorNapok: Set<string>, napOf: (d: Date) => string): EgyeztetesTetel[] {
  // Minden számla a hozzá legközelebbi szenzoros tankoláshoz tartozik, így két közeli tankolás nem viszi el egymás számláját.
  const parok = new Map<SzenzorTankolas, SzamlaTankolas[]>();
  const felhasznalt = new Set<SzamlaTankolas>();
  for (const x of szamlak) {
    let legjobb: SzenzorTankolas | null = null;
    let tav = ABLAK_MS;
    for (const s of szenzor) {
      const d = Math.abs(x.idopont.getTime() - s.idopont.getTime());
      if (d <= tav) { legjobb = s; tav = d; }
    }
    if (!legjobb) continue;
    felhasznalt.add(x);
    parok.set(legjobb, [...(parok.get(legjobb) ?? []), x]);
  }
  const ki: EgyeztetesTetel[] = [];
  for (const s of szenzor) {
    const kozeli = parok.get(s) ?? [];
    if (kozeli.length === 0) {
      ki.push({ tipus: "nincsSzamla", idopont: s.idopont, szenzorL: s.liter, szamlaL: null });
      continue;
    }
    const literek = kozeli.map((x) => x.liter).filter((x): x is number => x !== null);
    const szamlaL = literek.length ? Math.round(literek.reduce((a, b) => a + b, 0)) : null;
    const elter = szamlaL !== null && Math.abs(szamlaL - s.liter) > LITER_TURES;
    ki.push({ tipus: elter ? "elteres" : "egyezik", idopont: s.idopont, szenzorL: s.liter, szamlaL });
  }
  for (const x of szamlak) {
    if (felhasznalt.has(x) || x.liter === null || x.liter < TANKOLAS_KUSZOB_L) continue;
    if (!szenzorNapok.has(napOf(x.idopont))) continue;
    ki.push({ tipus: "nincsSzenzor", idopont: x.idopont, szenzorL: null, szamlaL: Math.round(x.liter) });
  }
  return ki.sort((a, b) => b.idopont.getTime() - a.idopont.getTime());
}

// ── Megtett út ────────────────────────────────────────────────────────────
// Élő mérés 2026-11-04: egy nap kocsinként 2–3 ezer minta (Latitude, Longitude, időrendben).

export type Nyompont = { lat: number; lon: number };

function ritkit(p: Nyompont[], tures: number): Nyompont[] {
  if (p.length < 3) return p;
  const a = p[0], b = p[p.length - 1];
  const dx = b.lon - a.lon, dy = b.lat - a.lat;
  const h = Math.hypot(dx, dy);
  let max = -1, ix = 0;
  for (let i = 1; i < p.length - 1; i++) {
    // Azonos végpontoknál (oda-vissza út) a pont távolsága számít, nem az egyenestől mért.
    const d = h ? Math.abs(dy * (p[i].lon - a.lon) - dx * (p[i].lat - a.lat)) / h : Math.hypot(p[i].lon - a.lon, p[i].lat - a.lat);
    if (d > max) { max = d; ix = i; }
  }
  if (max <= tures) return [a, b];
  return [...ritkit(p.slice(0, ix + 1), tures).slice(0, -1), ...ritkit(p.slice(ix), tures)];
}

/** A nap nyers mintáiból a rajzolható út. Hiányzó vagy 0 koordinátájú minta kimarad, így nem ugrik a vonal. */
export function megtettUtNyersbol(sorok: unknown, tures = 0.004): Nyompont[] {
  if (!Array.isArray(sorok)) return [];
  const pontok = sorok.flatMap((s) => {
    if (!objektum(s)) return [];
    const lat = szam(s.Latitude), lon = szam(s.Longitude);
    return lat !== null && lon !== null && lat !== 0 && lon !== 0 ? [{ lat, lon, t: String(s.timestamp ?? "") }] : [];
  }).sort((a, b) => a.t.localeCompare(b.t)).map(({ lat, lon }) => ({ lat, lon }));
  return ritkit(pontok, tures);
}
