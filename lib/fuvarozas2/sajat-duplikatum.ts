// Saját fuvar duplikátum-szűrő — a döntés, adatbázis nélkül
// (scripts/teszt-sajat-duplikatum.ts).
//
// Budaházi Zoltán, 2026-10-06: a 2026-10-05-i Fabrika-fuvar kétszer került
// be (#274 előre beírva 09.24-én, #295 a tényleges útra), a szállítólevél a
// rosszhoz párosult, és a heti rács + a Kimutatás megtakarítása kétszer
// számolta. Mentés előtt ezért megnézzük: van-e már ugyanaz a kocsi (vagy
// kocsi nélküli), ±1 nap, ugyanaz a felrakó- és lerakó-város. Ha van, a
// szerver csak kifejezett „mégis mentem”-re (duplikatumOk) ment.

import { cimKulcs, varosNev } from "@/lib/fuvarozas/varos";
import { findJarmuInSzoveg } from "@/lib/fuvarozas/vehicles";

export type DuplikatumUj = {
  datum: string;
  jarmuKod: string | null;
  honnan: string;
  hova: string;
};

export type DuplikatumJelolt = {
  id: string;
  /** A fuvar napja (ISO). */
  datum: string | null;
  /** Kocsi szövege (rendszám vagy „Sofőr — címke”); előkészítésben az elokeszites_jarmu. */
  jarmu: string | null;
  felrako: string | null;
  lerako: string | null;
  partner: string | null;
  /** Olvasható állapot („Előkészítés”, „Lezárt” …). */
  allapot: string;
};

export const DUPLIKATUM_NAP_TURES = 1;

function nap(iso: string): number {
  return Math.round(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / 86400000);
}

/** A cím városának kulcsa (kisbetű, ékezet nélkül) — „Tata” és „2890 TATA, Fő u. 1.” egyezik. */
export function varosKulcs(cim: string | null | undefined): string {
  return cimKulcs(varosNev(cim ?? ""));
}

/** Ugyanaz a kocsi-e; ha bármelyiknek nincs kocsija, nem zárja ki az egyezést. */
function kocsiEgyezhet(a: string | null, b: string | null): boolean {
  if (!a?.trim() || !b?.trim()) return true;
  const ja = findJarmuInSzoveg(a);
  const jb = findJarmuInSzoveg(b);
  if (ja && jb) return ja === jb;
  if (ja || jb) return false;
  return cimKulcs(a) === cimKulcs(b);
}

/** A jelöltek közül azok, amelyek ugyanannak az útnak látszanak, mint az új/módosított fuvar. */
export function keresDuplikatumot(uj: DuplikatumUj, jeloltek: DuplikatumJelolt[]): DuplikatumJelolt[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(uj.datum)) return [];
  const honnan = varosKulcs(uj.honnan);
  const hova = varosKulcs(uj.hova);
  if (!honnan || !hova) return [];
  return jeloltek.filter(
    (j) =>
      !!j.datum &&
      Math.abs(nap(j.datum) - nap(uj.datum)) <= DUPLIKATUM_NAP_TURES &&
      kocsiEgyezhet(uj.jarmuKod, j.jarmu) &&
      varosKulcs(j.felrako) === honnan &&
      varosKulcs(j.lerako) === hova
  );
}

/** A figyelmeztetés szövege: „#274 · Fabrika 2000 Kft · Lezárt”. */
export function duplikatumSor(j: DuplikatumJelolt): string {
  return [`#${j.id}`, j.partner || "partner nélkül", j.datum, j.allapot].filter(Boolean).join(" · ");
}
