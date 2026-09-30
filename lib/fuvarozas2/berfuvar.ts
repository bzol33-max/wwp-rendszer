// A bérfuvar szerkesztése és kézi felvétele a Megbízások oldalon
// (2026-09-30, a régi Fuvarozás kivezetése előtt): a régi szerkesztő
// (components/fuvarozas/megbizasok.tsx FuvarFields) minden mezője. Tiszta
// modul — nincs adatbázis, nincs "use server"; scripts/teszt-berfuvar.ts.

export type BerFuvarAdat = {
  datum: string;
  /** Üres, ha a lerakás a felrakás napján van. */
  lerakasDatum: string;
  idopont: string;
  felrako: string;
  lerako: string;
  megrendelo: string;
  pozicioszam: string;
  pozicioszamNincs: boolean;
  aru: string;
  mennyiseg: string;
  suly: string;
  /** A kocsi címkéje (jarmuLabel, pl. „Gergő - AOPU-427 / AOTY-474”), ahogy a régi szerkesztő írta. */
  jarmu: string;
  sofor: string;
  fuvardij: string;
  fuvardijPenznem: "Ft" | "EUR";
  koltseg: string;
  megjegyzes: string;
  postazasiCim: string;
};

export function uresBerFuvar(ma: string): BerFuvarAdat {
  return {
    datum: ma, lerakasDatum: "", idopont: "", felrako: "", lerako: "", megrendelo: "",
    pozicioszam: "", pozicioszamNincs: false, aru: "", mennyiseg: "", suly: "", jarmu: "", sofor: "",
    fuvardij: "", fuvardijPenznem: "Ft", koltseg: "", megjegyzes: "", postazasiCim: "",
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A szám mező értéke: üres → null. Szóköz nélkül; a pont csak akkor ezres
 * elválasztó, ha hármas csoportokat választ el („1.250.000”), különben
 * tizedespont („850.50” EUR); a tizedesvessző is jó.
 */
export function berSzam(s: string): number | null | "hibas" {
  let t = s.replace(/\s/g, "");
  t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t.replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : "hibas";
}

/** Mentés előtti ellenőrzés: az első hiba szövege, vagy null. */
export function berFuvarHiba(a: BerFuvarAdat): string | null {
  if (!ISO.test(a.datum)) return "Add meg a dátumot.";
  if (a.lerakasDatum && !ISO.test(a.lerakasDatum)) return "A lerakás dátuma hibás.";
  if (a.lerakasDatum && a.lerakasDatum < a.datum) return "A lerakás nem lehet a felrakás előtt.";
  if (!a.felrako.trim() || !a.lerako.trim()) return "Add meg a felrakó és a lerakó helyet.";
  if (berSzam(a.fuvardij) === "hibas") return "A fuvardíj nem szám.";
  if (berSzam(a.koltseg) === "hibas") return "A költség nem szám.";
  return null;
}

/** Mely mezők változtak (a naplóhoz). */
export function valtozottMezok(elotte: BerFuvarAdat, utana: BerFuvarAdat): (keyof BerFuvarAdat)[] {
  return (Object.keys(utana) as (keyof BerFuvarAdat)[]).filter((k) => String(elotte[k] ?? "").trim() !== String(utana[k] ?? "").trim());
}
