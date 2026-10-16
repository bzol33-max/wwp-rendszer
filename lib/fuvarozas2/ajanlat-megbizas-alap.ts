// „Megnyertük → megbízás” (1. hullám C, 2026-10-16, docs/fuvarozas-1-hullam-terv.md):
// a megnyert Timocom-ajánlatból bérfuvar-adat. Tiszta modul — nincs
// adatbázis, nincs "use server"; teszt: scripts/teszt-1hullam-ajanlat.ts.

import type { BerFuvarAdat } from "@/lib/fuvarozas2/berfuvar";

export type AjanlatAdat = {
  /** radar_kiiras.id (szövegként) — a WWP-beli ajánlat-azonosító. */
  id: string;
  /** TimocomAjanlat.ajanlatId (az URL-ből), ha van. */
  timocomId: string | null;
  /** TimocomAjanlat.tcId (a megbízó Timocom-azonosítója), ha van. */
  tcId: string | null;
  /** radar_kiiras.megbizo_jelolt — az ajánlattevő cég. */
  megbizo: string | null;
  /** radar_kiiras.honnan / hova — a kész hely-szöveg („4200 Hajdúszoboszló”, „AT 4020 Linz”). */
  honnan: string;
  hova: string;
  /** radar_kiiras.felrakas_nap / lerakas_nap, "YYYY-MM-DD" vagy null. */
  felrakasNap: string | null;
  lerakasNap: string | null;
  /** radar_kiiras.tav_km — a rakott km, ha ismert. */
  tavKm: number | null;
  /** TimocomAjanlat.aru / sulyT. */
  aru: string | null;
  sulyT: number | null;
};

/** A visszatérés a BerFuvarAdat bővítése (így közvetlenül adható az ujBerFuvar-nak). */
export type AjanlatMegbizas = BerFuvarAdat & { forras: "timocom"; rakottKm: number | null; jarmuKod: string };

export type AjanlatDontes = { jarmuKod: string; felrakasNap: string; dij: number; penznem: "HUF" | "EUR" };

/** Ennyi km egy menetnap (a lerakás nap becsléséhez, ha az ajánlatban nincs). */
export const MENETNAP_KM = 600;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" + n nap (UTC délben számolva, így nincs időzóna-csúszás). */
export function napEltolva(nap: string, n: number): string {
  const d = new Date(`${nap}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A lerakás napja: az ajánlaté, ha nem esik a felrakás elé; különben felrakás + ceil(km / 600). */
export function lerakasNapAjanlatbol(a: Pick<AjanlatAdat, "lerakasNap" | "tavKm">, felrakasNap: string): string {
  if (a.lerakasNap && ISO.test(a.lerakasNap) && a.lerakasNap >= felrakasNap) return a.lerakasNap;
  const km = a.tavKm != null && Number.isFinite(a.tavKm) ? a.tavKm : 0;
  return napEltolva(felrakasNap, Math.max(0, Math.ceil(km / MENETNAP_KM)));
}

/** A megbízás megjegyzése: „Timocom-ajánlat #<id> · <timocomId> · TC ID <tcId>” (ami van). */
export function ajanlatMegjegyzes(a: Pick<AjanlatAdat, "id" | "timocomId" | "tcId">): string {
  return [`Timocom-ajánlat #${a.id}`, a.timocomId?.trim() || null, a.tcId?.trim() ? `TC ID ${a.tcId.trim()}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function megbizasAjanlatbol(a: AjanlatAdat, d: AjanlatDontes): AjanlatMegbizas {
  const le = lerakasNapAjanlatbol(a, d.felrakasNap);
  return {
    datum: d.felrakasNap,
    lerakasDatum: le === d.felrakasNap ? "" : le,
    idopont: "",
    felrako: a.honnan,
    lerako: a.hova,
    megrendelo: a.megbizo ?? "",
    pozicioszam: "",
    pozicioszamNincs: false,
    aru: a.aru ?? "",
    mennyiseg: "",
    suly: "",
    jarmu: d.jarmuKod,
    sofor: "",
    fuvardij: String(d.dij),
    fuvardijPenznem: d.penznem === "EUR" ? "EUR" : "Ft",
    koltseg: "",
    megjegyzes: ajanlatMegjegyzes(a),
    postazasiCim: "",
    forras: "timocom",
    rakottKm: a.tavKm,
    jarmuKod: d.jarmuKod,
  };
}

/** A megnyert ajánlat Ft/km-e (ár-memória): csak Ft-os díj és ismert, pozitív km esetén. */
export function nyertFtKm(x: { ar: number | null; penznem: string | null; km: number | null }): number | null {
  if (x.ar == null || !(x.ar > 0) || x.penznem !== "HUF" || x.km == null || !(x.km > 0)) return null;
  return Math.round((x.ar / x.km) * 10) / 10;
}
