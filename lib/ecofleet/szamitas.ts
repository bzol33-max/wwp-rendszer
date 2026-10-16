// Ecofleet tiszta számítások (DB, hálózat nélkül) — docs/ecofleet-telemetria-terv.md 2. pont.
// Alapszabály: hiányzó / nem szám adat → null, SOHA nem 0.

import { budapestFalioraToInstant } from "@/lib/fuvarozas/idozona";

export type TachoAllapot = {
  objectId: string;
  allapot: string | null;
  allapotKezdete: Date | null;
  napiVezetesHatraPerc: number | null;
  hetiVezetesHatraPerc: number | null;
  hetiVezetesPerc: number | null;
  muszakHatraPerc: number | null;
  munkaidoHatraPerc: number | null;
  kovetkezoNapiPihenoPerc: number | null;
  csokkentettPihenok: number | null;
  hosszabbitottVezetesek: number | null;
  adatIdopont: Date | null;
};

export type CanNap = {
  literCan: number | null;
  kmCan: number | null;
  l100: number | null;
  tankolasok: { idopont: string; literElotte: number; literUtana: number; hozzaadott: number }[];
  szervizHatraKm: number | null;
  szervizMegbizhato: boolean;
  tengelyTerhelesKg: Record<string, number> | null;
  mintaDb: number;
};

const objektum = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Szám vagy számot tartalmazó szöveg → szám; minden más (null, "", NaN) → null. */
function szam(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const kerekit2 = (n: number) => Math.round(n * 100) / 100;

function mpBolPerc(v: unknown): number | null {
  const n = szam(v);
  return n === null ? null : Math.round(n / 60);
}

/**
 * Ecofleet időpont → Date. "YYYY-MM-DD HH:mm:ss+ZZZZ" (eltolással), vagy
 * eltolás nélkül budapesti faliórának értelmezve. Értelmezhetetlen → null.
 */
export function ecofleetIdopont(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  const [, ev, ho, nap, ora, perc, mp, eltolas] = m;
  if (!eltolas) {
    const d = budapestFalioraToInstant(+ev, +ho, +nap, +ora, +perc, +mp);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const tz = eltolas === "Z" ? "Z" : eltolas.replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2");
  const d = new Date(`${ev}-${ho}-${nap}T${ora}:${perc}:${mp}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Egy getLastData-sor tcoData-jából tachó-állapot; nincs tcoData (vagy nem objektum a sor) → null. */
export function tachoAllapotLastDatabol(sor: unknown): TachoAllapot | null {
  if (!objektum(sor)) return null;
  const t = sor.tcoData;
  if (!objektum(t)) return null;
  const allapot = typeof t.currentState === "string" && t.currentState.trim() ? t.currentState.trim() : null;
  return {
    objectId: String(sor.objectId ?? ""),
    allapot,
    allapotKezdete: ecofleetIdopont(t.stateBeginTime),
    napiVezetesHatraPerc: mpBolPerc(t.drivetimeLeftDay),
    hetiVezetesHatraPerc: mpBolPerc(t.drivetimeLeftWeek),
    hetiVezetesPerc: mpBolPerc(t.totalDriveTimeThisWeek),
    muszakHatraPerc: mpBolPerc(t.remainingShiftTime),
    munkaidoHatraPerc: mpBolPerc(t.remainingWorkingHours),
    kovetkezoNapiPihenoPerc: mpBolPerc(t.nextDailyRestDuration),
    csokkentettPihenok: szam(t.countOfReducedDailyRests),
    hosszabbitottVezetesek: szam(t.countOfExtendedDrives),
    adatIdopont: ecofleetIdopont(sor.timestamp),
  };
}

/** Igaz, ha a tachó-adat legfeljebb `maxKorPerc` perces. */
export function tachoFriss(t: TachoAllapot, most: Date, maxKorPerc = 15): boolean {
  if (!t.adatIdopont) return false;
  return most.getTime() - t.adatIdopont.getTime() <= maxKorPerc * 60_000;
}

/** 160 → "2 ó 40 p", 45 → "45 p", negatív → "0 p". */
export function percSzoveg(perc: number): string {
  const p = Math.max(0, Math.round(Number.isFinite(perc) ? perc : 0));
  if (p < 60) return `${p} p`;
  return `${Math.floor(p / 60)} ó ${p % 60} p`;
}

const LITER_MAX_LEPES = 500;
const TANKOLAS_MIN_L = 50;
const L100_MIN_KM = 20;

/** Egy nap getRawData-soraiból CAN-összesítés (a bemenet sorrendje nem számít). */
export function canNapNyersbol(sorok: unknown[]): CanNap {
  const lista = (Array.isArray(sorok) ? sorok : []).filter(objektum);
  const idorend = lista
    .map((s, i) => ({ s, i, t: ecofleetIdopont(s.timestamp)?.getTime() ?? null }))
    .sort((a, b) => {
      if (a.t !== null && b.t !== null && a.t !== b.t) return a.t - b.t;
      if (a.t === null && b.t !== null) return -1;
      if (a.t !== null && b.t === null) return 1;
      return a.i - b.i;
    })
    .map((x) => x.s);

  // Üzemanyag-számláló (CANFuelUsed): visszaesés vagy > 500 l lépés → hibás nap.
  const fogyasztott = idorend.map((s) => szam(s.CANFuelUsed)).filter((x): x is number => x !== null);
  let literCan: number | null = null;
  if (fogyasztott.length > 0) {
    let hibas = false;
    for (let i = 1; i < fogyasztott.length; i++) {
      const lepes = fogyasztott[i] - fogyasztott[i - 1];
      if (lepes < 0 || lepes > LITER_MAX_LEPES) hibas = true;
    }
    const osszes = Math.max(...fogyasztott) - Math.min(...fogyasztott);
    if (!hibas && osszes <= LITER_MAX_LEPES) literCan = kerekit2(osszes);
  }

  const tavok = idorend.map((s) => szam(s.CANDistance)).filter((x): x is number => x !== null);
  const kmCan = tavok.length > 0 ? kerekit2(Math.max(...tavok) - Math.min(...tavok)) : null;

  const l100 = literCan !== null && kmCan !== null && kmCan >= L100_MIN_KM ? kerekit2((literCan / kmCan) * 100) : null;

  const tankolasok: CanNap["tankolasok"] = [];
  let elozoFuel: number | null = null;
  for (const s of idorend) {
    const f = szam(s.Fuel);
    if (f === null) continue;
    if (elozoFuel !== null && f - elozoFuel >= TANKOLAS_MIN_L) {
      tankolasok.push({
        idopont: String(s.timestamp ?? ""),
        literElotte: elozoFuel,
        literUtana: f,
        hozzaadott: kerekit2(f - elozoFuel),
      });
    }
    elozoFuel = f;
  }

  const szervizErtekek = idorend.map((s) => szam(s.CANServiceDistance)).filter((x): x is number => x !== null);
  const utolsoSzerviz = szervizErtekek.length > 0 ? szervizErtekek[szervizErtekek.length - 1] : null;
  const szervizHatraKm = utolsoSzerviz === null ? null : utolsoSzerviz <= 0 ? 0 : utolsoSzerviz;
  const szervizMegbizhato = szervizErtekek.some((x) => x > 0);

  let tengelyTerhelesKg: Record<string, number> | null = null;
  for (let i = idorend.length - 1; i >= 0 && tengelyTerhelesKg === null; i--) {
    tengelyTerhelesKg = tengelyParse(idorend[i].CANAxleWeights);
  }

  return {
    literCan,
    kmCan,
    l100,
    tankolasok,
    szervizHatraKm,
    szervizMegbizhato,
    tengelyTerhelesKg,
    mintaDb: lista.length,
  };
}

function tengelyParse(v: unknown): Record<string, number> | null {
  let obj: unknown = v;
  if (typeof v === "string") {
    if (!v.trim()) return null;
    try {
      obj = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!objektum(obj)) return null;
  const ki: Record<string, number> = {};
  for (const [k, ertek] of Object.entries(obj)) {
    const n = szam(ertek);
    if (n !== null) ki[k] = n;
  }
  return Object.keys(ki).length > 0 ? ki : null;
}
