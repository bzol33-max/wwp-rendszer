/** Feltöltési minőségpróbák és megjelenítési forgatás tiszta segédei. */
export const feltoltesiMinosegek = [0.9, 0.85, 0.8] as const;
export const MAX_FELTOLTESI_BAJT = 8 * 1024 * 1024;

export function kovetkezoMinoseg(alap: number, meretBajt: number, maxBajt = MAX_FELTOLTESI_BAJT): number | null {
  if (meretBajt <= maxBajt) return alap;
  const index = feltoltesiMinosegek.indexOf(alap as (typeof feltoltesiMinosegek)[number]);
  return index >= 0 && index + 1 < feltoltesiMinosegek.length ? feltoltesiMinosegek[index + 1] : null;
}

export function normalizalForgatast(fok: number): 0 | 90 | 180 | 270 {
  const normal = ((fok % 360) + 360) % 360;
  if (normal !== 0 && normal !== 90 && normal !== 180 && normal !== 270) throw new Error("A forgatás csak 90 fokos lépésekben lehetséges.");
  return normal;
}

export function pdfOldalMeret(szelesseg: number, magassag: number): "fekvo" | "allo" {
  return szelesseg > magassag ? "fekvo" : "allo";
}
