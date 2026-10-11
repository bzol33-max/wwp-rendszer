// Az EGYETLEN árlétra (2026-10-11, Budaházi Zoltán szabálya):
// az önköltség látszik; a minimum = önköltség +10%, aztán +20% és +30%.
// Minden ár felfelé kerekítve 1 000 Ft-ra, és EUR-ban is (10 EUR-ra felfelé) —
// telefonon gyakran euróban alkudnak.
//
// Ezt használja a Kalkulátor, a Tervezés döntés-panelje (a célár előtöltése a
// +10%-os fok) és a hét-nézet rés-táblája (ott az alap a többlet/határköltség).
// Tiszta függvény: adatbázis és hálózat nélkül, a hívó adja az MNB-árfolyamot
// (lib/fuvarozas/arfolyam.ts, szerveroldalon); ha nincs, az EUR `null` („—”).

/** A létra fokai: felár az önköltségre, százalék. Az első a minimum. */
export const LETRA_SZAZALEKOK = [10, 20, 30] as const;
/** A minimum árrés (önköltségre vetítve): ez alatt „határeset”. */
export const MIN_ARRES_SZAZALEK = LETRA_SZAZALEKOK[0];
export const FT_LEPES = 1000;
export const EUR_LEPES = 10;

export type LetraFok = { szazalek: number; ft: number; eur: number | null };
export type ArLetra = {
  onkoltsegFt: number;
  /** Az önköltség EUR-ban (egészre felfelé), ha van árfolyam. */
  onkoltsegEur: number | null;
  /** Ft / 1 EUR, amivel számolt (null: nincs árfolyam). */
  eurArfolyam: number | null;
  fokok: LetraFok[];
};

/** Felfelé kerekítés `lepes` többszörösére; a lebegőpontos zajt (110000.00000001) előbb levágja. */
export function felfeleKerekit(x: number, lepes: number): number {
  if (!(x > 0)) return 0;
  const tiszta = Math.round(x * 100) / 100;
  return Math.ceil(tiszta / lepes) * lepes;
}

/** Ft → EUR, 10 EUR-ra felfelé; null, ha nincs (érvényes) árfolyam. */
export function eurFelfele(ft: number, eurArfolyam: number | null | undefined): number | null {
  if (!eurArfolyam || !(eurArfolyam > 0)) return null;
  return felfeleKerekit(ft / eurArfolyam, EUR_LEPES);
}

/** Az árlétra: önköltség + 10 / 20 / 30%, Ft-ban (1 000-re) és EUR-ban (10-re) felfelé kerekítve. */
export function arLetra(onkoltsegFt: number, eurArfolyam: number | null): ArLetra {
  const onk = Math.max(0, Math.round(Number.isFinite(onkoltsegFt) ? onkoltsegFt : 0));
  const arf = eurArfolyam && eurArfolyam > 0 ? eurArfolyam : null;
  return {
    onkoltsegFt: onk,
    onkoltsegEur: arf ? Math.ceil(Math.round((onk / arf) * 100) / 100) : null,
    eurArfolyam: arf,
    fokok: LETRA_SZAZALEKOK.map((szazalek) => {
      const nyers = (onk * (100 + szazalek)) / 100;
      return { szazalek, ft: felfeleKerekit(nyers, FT_LEPES), eur: eurFelfele(nyers, arf) };
    }),
  };
}
