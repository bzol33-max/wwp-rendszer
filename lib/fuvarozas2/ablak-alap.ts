// Időablak: „csak dátum” felismerése. Tiszta modul (nincs I/O) —
// teszt: scripts/teszt-ablak-alap.ts.
//
// A Duvenbeck-megbízás időpont nélküli napot „16.11.2026 00:00 – 00:00”
// formában ad (2026-11-13, #373 Debrecen). Ez nem éjféli határidő, hanem
// „ezen a napon” — a felület ne írjon ki „00:00”-t, és ne számoljon belőle
// késést („+480 p várható”, „−561 p”).

const HELYI = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Az időpont budapesti „HH:MM” alakja. Elfogad helyi „YYYY-MM-DDTHH:MM”-et, ISO/Postgres szöveget és Date-et. */
export function helyiOraPerc(x: string | Date | null | undefined): string | null {
  if (x == null || x === "") return null;
  if (typeof x === "string") {
    const h = HELYI.exec(x.trim());
    if (h) return `${h[2]}:${h[3]}`;
    let s = x.trim().replace(" ", "T");
    if (/[+-]\d{2}$/.test(s)) s += ":00";
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : fmt.format(d);
  }
  return Number.isNaN(x.getTime()) ? null : fmt.format(x);
}

const NAP = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" });

/** Az időpont budapesti napja „YYYY-MM-DD”. */
export function helyiNap(x: string | Date | null | undefined): string | null {
  if (x == null || x === "") return null;
  if (typeof x === "string") {
    const h = HELYI.exec(x.trim());
    if (h) return h[1];
    let s = x.trim().replace(" ", "T");
    if (/[+-]\d{2}$/.test(s)) s += ":00";
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : NAP.format(d);
  }
  return Number.isNaN(x.getTime()) ? null : NAP.format(x);
}

/** Igaz, ha az ablak csak napot jelöl: mindkét (meglévő) vége budapesti 00:00. */
export function csakDatumAblak(tol: string | Date | null | undefined, ig: string | Date | null | undefined): boolean {
  const t = helyiOraPerc(tol);
  const i = helyiOraPerc(ig);
  if (t == null && i == null) return false;
  return (t == null || t === "00:00") && (i == null || i === "00:00");
}

/** Az ablak, ahogy a tervezés és a késés-számítás használja: a „csak dátum” ablak nincs ablak. */
export function ervenyesAblak<T extends string | Date | null | undefined>(tol: T, ig: T): { tol: T | null; ig: T | null } {
  return csakDatumAblak(tol, ig) ? { tol: null, ig: null } : { tol: tol ?? null, ig: ig ?? null };
}
