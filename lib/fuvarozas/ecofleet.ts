import { XMLParser } from "fast-xml-parser";

// Ecofleet (FleetComplete / "seeme") GPS API kliens.
//
// Auth: a `key` query paraméterben megy az API kulcs (nem header, nem OAuth
// a doksi elnevezése ellenére) — lásd https://app.ecofleet.com/seeme/services/apidoc/seeme
// Válasz mindig XML, sikeres híváskor <status>0</status>, hiba esetén
// <status> != 0 és <errormessage> tartalmazza az okot.

const ECOFLEET_BASE = "https://app.ecofleet.com/seeme/Api";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "node",
});

export class EcofleetError extends Error {}

type EcofleetEnvelope = {
  nodes?: {
    status?: number | string;
    errormessage?: string;
    response?: Record<string, unknown>;
  };
};

async function ecofleetGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const apiKey = process.env.ECOFLEET_API_KEY;
  if (!apiKey) {
    throw new EcofleetError("Nincs beállítva az ECOFLEET_API_KEY környezeti változó.");
  }

  const url = new URL(`${ECOFLEET_BASE}/${path}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  const xml = await res.text();

  let parsed: EcofleetEnvelope;
  try {
    parsed = parser.parse(xml) as EcofleetEnvelope;
  } catch {
    throw new EcofleetError(`Ecofleet válasz nem értelmezhető (HTTP ${res.status}).`);
  }

  const nodes = parsed.nodes;
  if (!nodes || String(nodes.status) !== "0") {
    throw new EcofleetError(
      nodes?.errormessage || `Ecofleet hiba (HTTP ${res.status}, státusz: ${nodes?.status ?? "?"})`
    );
  }

  return (nodes.response ?? {}) as T;
}

type RawVehicle = {
  id?: number | string;
  name?: string;
  plate?: string;
  info?: { make?: string; model?: string };
  status?: string;
};

export type EcofleetVehicle = {
  id: string;
  name: string;
  plate: string;
  make: string | null;
  model: string | null;
  active: boolean;
};

export async function getVehicles(): Promise<EcofleetVehicle[]> {
  const response = await ecofleetGet<{ node?: RawVehicle[] }>("Vehicles/get");
  const nodes = response.node ?? [];
  return nodes.map((n) => ({
    id: String(n.id ?? ""),
    name: String(n.name ?? ""),
    plate: String(n.plate ?? ""),
    make: n.info?.make ? String(n.info.make) : null,
    model: n.info?.model ? String(n.info.model) : null,
    active: n.status === "A",
  }));
}

type RawLastData = {
  objectId?: number | string;
  objectName?: string;
  plate?: string;
  timestamp?: string;
  latitude?: number | string;
  longitude?: number | string;
  speed?: number | string;
  direction?: number | string;
  enginestate?: number | string;
  currentOdometer?: number | string;
};

export type EcofleetPosition = {
  objectId: string;
  name: string;
  plate: string;
  /** Ecofleet timestamp string, már helyi (Europe/Budapest) eltolással, pl. "2026-09-04 13:35:05+0200" */
  timestamp: string;
  latitude: number;
  longitude: number;
  /** km/h */
  speed: number;
  /** fok, 0-360, iránytű szerint */
  direction: number;
  engineOn: boolean;
  odometerKm: number | null;
};

function toNumberOrNull(v: number | string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Az összes jármű utolsó ismert GPS-adata egy hívással. */
export async function getFleetLastPositions(): Promise<EcofleetPosition[]> {
  const response = await ecofleetGet<{ node?: RawLastData[] }>("Vehicles/getLastData");
  const nodes = response.node ?? [];
  return nodes
    .filter((n) => n.latitude !== undefined && n.longitude !== undefined)
    .map((n) => ({
      objectId: String(n.objectId ?? ""),
      name: String(n.objectName ?? n.plate ?? ""),
      plate: String(n.plate ?? ""),
      timestamp: String(n.timestamp ?? ""),
      latitude: Number(n.latitude),
      longitude: Number(n.longitude),
      speed: toNumberOrNull(n.speed) ?? 0,
      direction: toNumberOrNull(n.direction) ?? 0,
      engineOn: String(n.enginestate) === "1",
      odometerKm: toNumberOrNull(n.currentOdometer),
    }));
}

type RawTrip = {
  id?: number | string;
  startTimestamp?: string;
  endTimestamp?: string;
  distance?: number | string;
  duration?: number | string;
  /** Az adott fuvarszakasz UTÁN a jármű hány másodpercig állt (a következő trip indulásáig). */
  stoppedAfter?: number | string;
  driverId?: number | string;
  driverName?: string;
  startLocation?: string;
  startLatitude?: number | string;
  startLongitude?: number | string;
  endLocation?: string;
  endLatitude?: number | string;
  endLongitude?: number | string;
  avgSpeed?: number | string;
  maxSpeed?: number | string;
};

export type EcofleetTrip = {
  id: string;
  /** Ecofleet timestamp string, helyi eltolással, pl. "2026-09-04 13:35:05+0200" */
  startTimestamp: string;
  endTimestamp: string;
  /** km */
  distance: number;
  /** másodperc */
  duration: number;
  /** másodperc — mennyi ideig állt a jármű ezután a szakasz után, a következő indulásig */
  stoppedAfter: number;
  driverName: string | null;
  startLocation: string | null;
  startLatitude: number;
  startLongitude: number;
  endLocation: string | null;
  endLatitude: number;
  endLongitude: number;
  avgSpeed: number;
  maxSpeed: number;
};

/** "2026-09-04 13:35:05+0200" -> Date */
export function parseEcofleetTimestamp(ts: string): Date | null {
  const normalized = ts.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ecofleetDateParam(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Egy jármű útvonal-előzménye (trip-jei) egy időszakra. A `begin`/`end`
 * helyi idő szerint értendő (Europe/Budapest) — a hívó felelőssége a
 * megfelelő Date objektumokat átadni.
 *
 * Az Ecofleet ezt már trip-ekre bontva, geokódolt címekkel adja vissza —
 * a `stoppedAfter` mező pedig pontosan azt jelzi, mennyi ideig állt a
 * jármű az adott trip vége után a következő indulásig, ami a rakodási/
 * lerakodási (vagy egyéb megállási) idő számításának alapja.
 */
export async function getVehicleTrips(objectId: string, begin: Date, end: Date): Promise<EcofleetTrip[]> {
  const response = await ecofleetGet<{ node?: RawTrip[] }>("Vehicles/getTrips", {
    objectId,
    begTimestamp: ecofleetDateParam(begin),
    endTimestamp: ecofleetDateParam(end),
  });
  const nodes = response.node ?? [];
  return nodes.map((n) => ({
    id: String(n.id ?? ""),
    startTimestamp: String(n.startTimestamp ?? ""),
    endTimestamp: String(n.endTimestamp ?? ""),
    distance: toNumberOrNull(n.distance) ?? 0,
    duration: toNumberOrNull(n.duration) ?? 0,
    stoppedAfter: toNumberOrNull(n.stoppedAfter) ?? 0,
    driverName: n.driverName ? String(n.driverName) : null,
    startLocation: n.startLocation ? String(n.startLocation) : null,
    startLatitude: toNumberOrNull(n.startLatitude) ?? 0,
    startLongitude: toNumberOrNull(n.startLongitude) ?? 0,
    endLocation: n.endLocation ? String(n.endLocation) : null,
    endLatitude: toNumberOrNull(n.endLatitude) ?? 0,
    endLongitude: toNumberOrNull(n.endLongitude) ?? 0,
    avgSpeed: toNumberOrNull(n.avgSpeed) ?? 0,
    maxSpeed: toNumberOrNull(n.maxSpeed) ?? 0,
  }));
}
