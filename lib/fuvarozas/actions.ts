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
  | { ok: true; fromLabel: string; toLabel: string; route: TollRoute }
  | { ok: false; error: string };

async function runTollCalc(
  from: GeocodedAddress,
  to: GeocodedAddress
): Promise<TollCalcResult> {
  try {
    const route = await calculateToll({
      fromLon: from.lon,
      fromLat: from.lat,
      toLon: to.lon,
      toLat: to.lat,
      ...FIXED_VEHICLE,
    });
    return { ok: true, fromLabel: from.label, toLabel: to.label, route };
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}

/** Amikor a felhasználó egy javasolt címre kattintott — koordináta már ismert. */
export async function calculateTollForPoints(
  from: GeocodedAddress,
  to: GeocodedAddress
): Promise<TollCalcResult> {
  return runTollCalc(from, to);
}

/** Amikor a felhasználó szabadon beírt szöveggel indította a számítást. */
export async function calculateTollForAddresses(
  fromQuery: string,
  toQuery: string
): Promise<TollCalcResult> {
  try {
    const [from, to] = await Promise.all([
      geocodeAddress(fromQuery),
      geocodeAddress(toQuery),
    ]);
    return runTollCalc(from, to);
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}
