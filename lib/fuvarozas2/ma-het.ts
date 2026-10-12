// A Ma oldal közös, tiszta segédei (nincs adatbázis) — scripts/teszt-ma-het.ts.
// 2026-10-12: a heti rács (R2) és a Diszpécser megszűnt; ami innen és a
// diszpecser-alap.ts-ből a Ma lapnak kell, itt maradt.

import type { Allapot } from "@/lib/fuvarozas/allapot";

export type HetFuvar = {
  id: string;
  allapot: Allapot;
  jelleg: "ber" | "sajat";
  partner: string | null;
  hivatkozas: string | null;
  jarmu_kod: string | null;
  felrakas_nap: string | null;
  lerakas_nap: string | null;
  felrako: string | null;
  lerako: string | null;
  /** A kiírt felrakási ablak kezdete és az időpont-mező — a közös sorrendhez (napi-sorrend.ts). */
  felrakas_ablak_tol?: string | null;
  idopont?: string | null;
};

export type HetNap = { nap: string; cimke: string; ma: boolean; /** Szombat / vasárnap (csak ha aznap van fuvar). */ hetvege?: boolean };

const NAPNEV = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"];

/** A megjelenítendő hét hétfője–péntekje: hétvégén már a következő hét. */
export function hetNapjai(ma: string): HetNap[] {
  const d = new Date(`${ma}T12:00:00Z`);
  const hetNapja = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (hetNapja === 6 ? 2 : hetNapja === 0 ? 1 : 1 - hetNapja));
  const ki: HetNap[] = [];
  for (let i = 0; i < 5; i++) {
    const nap = d.toISOString().slice(0, 10);
    ki.push({ nap, cimke: `${NAPNEV[d.getUTCDay()]} ${d.getUTCDate()}.`, ma: nap === ma });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return ki;
}

/** Helykitöltő felirat a még nem üzemelő kocsihoz (nincs GPS, rendszám, fuvar); egyébként null. */
export function kocsiHelykitolto(k: { vanGps: boolean; vanRendszam: boolean; vanFuvar: boolean }): string | null {
  if (k.vanGps || k.vanFuvar) return null;
  return k.vanRendszam ? null : "még nem üzemel";
}

/** Pihenőnap-e a nap ("YYYY-MM-DD"): vasárnapra nem kell fuvar (Zoltán, 2026-10-11). */
export function pihenoNapE(nap: string | null | undefined): boolean {
  if (!nap || !/^\d{4}-\d{2}-\d{2}$/.test(nap)) return false;
  return new Date(`${nap}T12:00:00Z`).getUTCDay() === 0;
}

/** A kocsi neve a felületen: „NMZ-492 · Gergő”, vagy csak a kód / címke, ha a másik üres vagy benne van. */
export function jarmuNev(j: { kod: string | null | undefined; cimke: string | null | undefined }): string {
  const kod = (j.kod ?? "").trim();
  const cimke = (j.cimke ?? "").trim();
  if (!kod) return cimke || "?";
  if (!cimke || cimke.toLocaleUpperCase("hu-HU").includes(kod.toLocaleUpperCase("hu-HU"))) return cimke || kod;
  return `${kod} · ${cimke}`;
}
