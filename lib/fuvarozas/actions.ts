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
