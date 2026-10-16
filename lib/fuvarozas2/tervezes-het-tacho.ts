// Tachográf-kijelzés (Ecofleet tcoData) — tiszta szöveg-összerakás a Ma
// kocsi-kártyához, a Tervezés · A hét kocsi-sorához és a sofőr /m lapjához
// (docs/ecofleet-telemetria-terv.md 5. szakasz). Nincs DB, nincs "use server":
// a hívó tölti be a legutobbiTacho()-t, és hibánál egyszerűen nem hívja ezt.
//
// Csak friss (tachoFriss, alapból 15 percen belüli) adatból ad szöveget —
// régi tachó-adat félrevezetőbb, mint a semmi.

import { percSzoveg, tachoFriss, type TachoAllapot } from "@/lib/ecofleet/szamitas";

export type TachoKijelzes = {
  /** Ma kártya: „Tachó: ma még 2 ó 40 p · hét 31/56 ó”. */
  hetiSor: string;
  /** Tervezés chip: „ma 2 ó 40 p · hét 26 ó 25 p hátra”. */
  chip: string;
  /** Súgó (title) a részletekkel, soronként. */
  reszletek: string;
  /** Sofőr /m: „Ma még vezethetsz: 2 ó 40 p · a héten: 26 ó 25 p”. */
  soforSor: string;
  /** Az adat kora percben (a forrás-jel súgójához). */
  korPerc: number;
};

const nemNull = <T,>(x: T | null | undefined | false): x is T => x != null && x !== false;

/** Friss tachó-adatból a négy kijelzés; null, ha nincs, régi, vagy nincs benne vezetési idő. */
export function tachoKijelzes(t: TachoAllapot | null | undefined, most: Date, maxKorPerc = 15): TachoKijelzes | null {
  if (!t || !tachoFriss(t, most, maxKorPerc)) return null;
  const napi = t.napiVezetesHatraPerc;
  const hetiHatra = t.hetiVezetesHatraPerc;
  const hetiVezetes = t.hetiVezetesPerc;
  if (napi == null && hetiHatra == null && hetiVezetes == null) return null;
  const korPerc = t.adatIdopont ? Math.max(0, Math.round((most.getTime() - t.adatIdopont.getTime()) / 60000)) : 0;

  const hetiSor = "Tachó: " + [
    napi != null ? `ma még ${percSzoveg(napi)}` : null,
    hetiVezetes != null ? `hét ${Math.round(hetiVezetes / 60)}/56 ó` : hetiHatra != null ? `hét ${percSzoveg(hetiHatra)} hátra` : null,
  ].filter(nemNull).join(" · ");

  const chip = [
    napi != null ? `ma ${percSzoveg(napi)}` : null,
    hetiHatra != null ? `hét ${percSzoveg(hetiHatra)} hátra` : null,
  ].filter(nemNull).join(" · ") || `hét ${Math.round((hetiVezetes ?? 0) / 60)}/56 ó`;

  const reszletek = [
    t.allapot ? `Állapot: ${t.allapot}` : null,
    t.muszakHatraPerc != null ? `Műszak hátra: ${percSzoveg(t.muszakHatraPerc)}` : null,
    t.csokkentettPihenok != null ? `Csökkentett pihenők: ${t.csokkentettPihenok}` : null,
    t.hosszabbitottVezetesek != null ? `Hosszabbított vezetések: ${t.hosszabbitottVezetesek}` : null,
    `Adat kora: ${korPerc === 0 ? "most" : `${korPerc} perce`}`,
  ].filter(nemNull).join("\n");

  const soforSor = "Ma még vezethetsz: " + [
    napi != null ? percSzoveg(napi) : "—",
    hetiHatra != null ? `a héten: ${percSzoveg(hetiHatra)}` : null,
  ].filter(nemNull).join(" · ");

  return { hetiSor, chip, reszletek, soforSor, korPerc };
}
