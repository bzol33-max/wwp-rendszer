// Europe/Budapest időzóna-konverziók, a szerver tényleges (jellemzően UTC)
// időzónájától FÜGGETLENÜL.
//
// FONTOS: sima `date.getHours()`/`getMinutes()` stb. hívás mindig a
// SZERVER (Railway konténer, jellemzően UTC) időzónája szerint adja vissza
// az órát/percet — nem Budapest szerint. Ha ezt közvetlenül egy "helyi idő"
// szöveggé alakítjuk (pl. az Ecofleet API-nak), és a szerver nem UTC+2-ben
// fut, a kapott időpont akár órákkal is eltolódhat a valós budapesti
// időhöz képest. Ez a modul mindig explicit Europe/Budapest időzónával
// számol, `Intl.DateTimeFormat`-tal — így a szerver időzónájától
// függetlenül helyes eredményt ad.
//
// NEM "use server" fájl — tiszta, szinkron függvények.

const BUDAPEST_TZ = "Europe/Budapest";

/** A megadott pillanatban (Date) mennyi Budapest az UTC-hez képest, ezredmásodpercben (pl. nyáron +2 óra = 7200000). */
function budapestOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BUDAPEST_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtcMs - instant.getTime();
}

/** Budapesti naptári nap (YYYY-MM-DD) a jelenlegi pillanatra, vagy egy adott Date-re. */
export function budapestNapISO(instant: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("sv-SE", { timeZone: BUDAPEST_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return dtf.format(instant);
}

/** Budapesti falióra-időpontból (év, hó, nap, óra, perc, mp) a hozzá tartozó valós pillanat (Date). */
export function budapestFalioraToInstant(
  ev: number,
  ho: number,
  nap: number,
  ora = 0,
  perc = 0,
  mp = 0
): Date {
  const becsles = Date.UTC(ev, ho - 1, nap, ora, perc, mp);
  const offset = budapestOffsetMs(new Date(becsles));
  return new Date(becsles - offset);
}

/** Budapesti helyi óra (0-23) egy adott pillanatra. */
export function budapestOra(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: BUDAPEST_TZ, hourCycle: "h23", hour: "2-digit" });
  return Number(dtf.format(instant));
}

/** Budapesti helyi hét napja (0 = vasárnap .. 6 = szombat) egy adott pillanatra. */
export function budapestHetNapja(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: BUDAPEST_TZ, weekday: "short" });
  const terkep: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return terkep[dtf.format(instant)] ?? 0;
}

/** Egy Date objektumból az Ecofleet API által elvárt "YYYY-MM-DD HH:MM:SS" budapesti falióra-szöveg. */
export function formatBudapestFaliora(instant: Date): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BUDAPEST_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
