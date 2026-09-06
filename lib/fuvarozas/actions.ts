"use server";

import { getFleetLastPositions, EcofleetError, type EcofleetPosition } from "./ecofleet";
import {
  calculateToll,
  FIXED_VEHICLE,
  geocodeAddress,
  suggestAddresses,
  TollCalcError,
  type GeocodedAddress,
  type TollRoute,
} from "./utdijkalkulacio";
import { fetchGazolajAr, GazolajArError } from "./uzemanyagar";

// Ha a NAV oldala nem érhető el (átmeneti hiba, oldalszerkezet-változás),
// ez a tartalék érték jelenik meg — utoljára kézzel ellenőrizve 2026.
// szeptemberében. Csak akkor használódik, ha az automatikus lekérés hibázik.
const GAZOLAJ_AR_TARTALEK = { ar: 667, cimke: "2026. szeptember (tartalék érték)" };

// A flotta mindig ugyanott tankol, ahol literenként 50 Ft kedvezményt kap a
// NAV hivatalos árához képest — ezt a kalkulátor a NAV-áron automatikusan
// levonja.
const TANKOLASI_KEDVEZMENY_FT_PER_LITER = 50;

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
export async function getGazolajAr(): Promise<GazolajArResult> {
  const kedvezmeny = TANKOLASI_KEDVEZMENY_FT_PER_LITER;
  try {
    const { ar, cimke } = await fetchGazolajAr();
    return { ar: ar - kedvezmeny, navAr: ar, kedvezmeny, cimke, friss: true };
  } catch (err) {
    if (!(err instanceof GazolajArError)) {
      console.error("[uzemanyagar] váratlan hiba:", err);
    }
    return {
      ar: GAZOLAJ_AR_TARTALEK.ar - kedvezmeny,
      navAr: GAZOLAJ_AR_TARTALEK.ar,
      kedvezmeny,
      cimke: GAZOLAJ_AR_TARTALEK.cimke,
      friss: false,
    };
  }
}

export type FleetPositionResult =
  | { ok: true; positions: EcofleetPosition[] }
  | { ok: false; error: string };

export async function getFleetPositions(): Promise<FleetPositionResult> {
  try {
    const positions = await getFleetLastPositions();
    // Rendszám szerint, hogy a felület mindig ugyanabban a sorrendben mutassa.
    positions.sort((a, b) => a.plate.localeCompare(b.plate));
    return { ok: true, positions };
  } catch (err) {
    const message =
      err instanceof EcofleetError
        ? err.message
        : "Nem sikerült lekérni a jármű-pozíciókat.";
    return { ok: false, error: message };
  }
}

export async function searchAddressSuggestions(query: string): Promise<GeocodedAddress[]> {
  try {
    return await suggestAddresses(query);
  } catch {
    return [];
  }
}

export type TollCalcResult =
  | { ok: true; stopLabels: string[]; route: TollRoute }
  | { ok: false; error: string };

async function runTollCalc(stops: GeocodedAddress[]): Promise<TollCalcResult> {
  try {
    const route = await calculateToll({
      points: stops.map((s) => ({ lon: s.lon, lat: s.lat })),
      ...FIXED_VEHICLE,
    });
    return { ok: true, stopLabels: stops.map((s) => s.label), route };
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}

/** Amikor a felhasználó minden állomásnál egy javasolt címre kattintott — koordináták már ismertek. */
export async function calculateTollForPoints(
  stops: GeocodedAddress[]
): Promise<TollCalcResult> {
  return runTollCalc(stops);
}

/** Amikor a felhasználó (legalább egy állomásnál) szabadon beírt szöveggel indította a számítást. */
export async function calculateTollForAddresses(
  queries: string[]
): Promise<TollCalcResult> {
  try {
    const stops = await Promise.all(queries.map((q) => geocodeAddress(q)));
    return runTollCalc(stops);
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}
