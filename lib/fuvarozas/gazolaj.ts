import "server-only";
import { fetchGazolajAr, GazolajArError } from "./uzemanyagar";
import { FUVAR_BEALLITAS_ALAP } from "@/lib/beallitasok/fuvar-alap";
import { getFuvarBeallitasok } from "@/lib/beallitasok/fuvar";

// A gázolajár kedvezménnyel — a régi kalkulátor (lib/fuvarozas/actions.ts
// getGazolajAr) és a Fuvarozás 2 kalkulátora (lib/fuvarozas2/kalkulator.ts) közös forrása.

// Ha a NAV oldala nem érhető el (átmeneti hiba, oldalszerkezet-változás),
// ez a tartalék érték jelenik meg — utoljára kézzel ellenőrizve 2026.
// szeptemberében. Csak akkor használódik, ha az automatikus lekérés hibázik.
// 2026-10-10-től a beállításokból (gazolaj_ar_tartalek_ft) jön — ez az alapértéke.
export const GAZOLAJ_AR_TARTALEK = { ar: FUVAR_BEALLITAS_ALAP.gazolaj_ar_tartalek_ft, cimke: "2026. szeptember (tartalék érték)" };

// A flotta mindig ugyanott tankol, ahol literenként 50 Ft kedvezményt kap a
// NAV hivatalos árához képest — ezt a kalkulátor a NAV-áron automatikusan
// levonja. 2026-10-10-től a beállításokból (tankolasi_kedvezmeny_ft_l) jön —
// ez az alapértéke.
export const TANKOLASI_KEDVEZMENY_FT_PER_LITER = FUVAR_BEALLITAS_ALAP.tankolasi_kedvezmeny_ft_l;

export type GazolajArResult = {
  /** A ténylegesen alkalmazandó ár (NAV ár - kedvezmény) — ezzel kell számolni. */
  ar: number;
  /** A NAV hivatalos, kedvezmény nélküli ára — csak tájékoztatásul. */
  navAr: number;
  kedvezmeny: number;
  cimke: string;
  /** false, ha a NAV oldaláról nem sikerült frissen lekérni, és a tartalék érték jelenik meg. */
  friss: boolean;
};

/**
 * A NAV hivatalos, aktuális havi gázolajárának automatikus lekérése (napi
 * cache-eléssel), a flotta állandó tankolási kedvezményével csökkentve.
 */
export async function gazolajArKedvezmennyel(): Promise<GazolajArResult> {
  const beallitas = await getFuvarBeallitasok();
  const kedvezmeny = beallitas.tankolasi_kedvezmeny_ft_l;
  const tartalekAr = beallitas.gazolaj_ar_tartalek_ft;
  try {
    const { ar, cimke } = await fetchGazolajAr();
    return { ar: ar - kedvezmeny, navAr: ar, kedvezmeny, cimke, friss: true };
  } catch (err) {
    if (!(err instanceof GazolajArError)) {
      console.error("[uzemanyagar] váratlan hiba:", err);
    }
    return {
      ar: tartalekAr - kedvezmeny,
      navAr: tartalekAr,
      kedvezmeny,
      cimke: GAZOLAJ_AR_TARTALEK.cimke,
      friss: false,
    };
  }
}
