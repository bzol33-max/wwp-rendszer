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
