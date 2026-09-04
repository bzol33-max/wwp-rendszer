"use server";

import { getFleetLastPositions, EcofleetError, type EcofleetPosition } from "./ecofleet";
import {
  calculateToll,
  geocodeAddress,
  TollCalcError,
  type EuroCategory,
  type TollRoute,
  type VehicleCategory,
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

export type TollCalcInput = {
  from: string;
  to: string;
  vehicleCategory: VehicleCategory;
  euroCategory: EuroCategory;
  weight: number;
};

export type TollCalcResult =
  | { ok: true; fromLabel: string; toLabel: string; routes: TollRoute[] }
  | { ok: false; error: string };

export async function calculateTollForAddresses(
  input: TollCalcInput
): Promise<TollCalcResult> {
  try {
    const [from, to] = await Promise.all([
      geocodeAddress(input.from),
      geocodeAddress(input.to),
    ]);
    const routes = await calculateToll({
      fromLon: from.lon,
      fromLat: from.lat,
      toLon: to.lon,
      toLat: to.lat,
      vehicleCategory: input.vehicleCategory,
      euroCategory: input.euroCategory,
      weight: input.weight,
    });
    return { ok: true, fromLabel: from.label, toLabel: to.label, routes };
  } catch (err) {
    const message =
      err instanceof TollCalcError
        ? err.message
        : "Nem sikerült kiszámítani az útdíjat.";
    return { ok: false, error: message };
  }
}
