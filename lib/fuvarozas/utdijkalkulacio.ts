// Az állami HU-GO útdíj kalkulátor (utdijkalkulacio.hu) publikus, auth nélküli
// végpontjai. Nincs hivatalos dokumentáció — az itteni séma a kalkulátor
// oldal saját Vuex store-jából (routePlanner.routeParams / routeResult) lett
// visszafejtve.

const BASE = "https://utdijkalkulacio.hu";

export class TollCalcError extends Error {}

type FuzzyFeature = {
  geometry: { coordinates: [number, number]; type: "Point" };
  properties: { address: string; type: string };
};

type FuzzyResponse = {
  result?: { features?: FuzzyFeature[] };
};

export type GeocodedAddress = {
  label: string;
  lon: number;
  lat: number;
};

async function fuzzySearch(query: string): Promise<GeocodedAddress[]> {
  const url = new URL(`${BASE}/location/fuzzy`);
  url.searchParams.set("query", query);
  url.searchParams.set("types", "hnum,road,cos,admin,poi");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new TollCalcError(`Címkeresés sikertelen (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as FuzzyResponse;
  return (data.result?.features ?? []).map((f) => ({
    label: f.properties.address,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

/** Cím -> legjobb találat (koordináta + a kalkulátor által ismert cím-alak). */
export async function geocodeAddress(query: string): Promise<GeocodedAddress> {
  const first = (await fuzzySearch(query))[0];
  if (!first) {
    throw new TollCalcError(`Nem található cím erre: "${query}".`);
  }
  return first;
}

/** Gépelés közbeni javaslatlista (max `limit` találat). */
export async function suggestAddresses(
  query: string,
  limit = 6
): Promise<GeocodedAddress[]> {
  if (query.trim().length < 2) return [];
  return (await fuzzySearch(query)).slice(0, limit);
}

type NominatimAddress = {
  road?: string;
  house_number?: string;
  city?: string;
  town?: string;
  village?: string;
  postcode?: string;
};

type NominatimReverseResponse = {
  display_name?: string;
  address?: NominatimAddress;
};

/**
 * Koordináta -> rövid, olvasható cím (pl. "4400 Nyíregyháza, Rákóczi utca 26.").
 * A GPS-pozíció kártyákhoz kell (kocsi mellett a cím, nem csak a koordináta) —
 * a HU-GO kalkulátornak nincs fordított (koordináta -> cím) végpontja, ezért
 * ehhez a nyílt, kulcs nélküli OpenStreetMap Nominatim reverse API-t
 * használjuk. `null`-t ad vissza hiba esetén (nem dobunk — ez csak
 * kényelmi kiegészítő adat, egy lassú/hibázó geokódolás miatt nem szabad az
 * egész GPS-kártyát elhasalnia).
 */
export async function reverseGeocodeCoords(lat: number, lon: number): Promise<string | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        // A Nominatim használati feltételei megkövetelik az azonosító
        // User-Agentet (nem böngésző-alapértelmezettet).
        "User-Agent": "wwp-system/1.0 (Well-Worn Pallet Kft. belso vallalatiranyitasi rendszer)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimReverseResponse;
    const a = data.address;
    if (a) {
      const varos = a.city || a.town || a.village || "";
      const utca = [a.road, a.house_number].filter(Boolean).join(" ");
      const cim = [varos, utca].filter(Boolean).join(", ");
      if (cim) return a.postcode ? `${a.postcode} ${cim}` : cim;
    }
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

// A kalkulátor oldal saját enumjai (app.$store.state.app), a HT (nehéz
// tehergépjármű) típushoz tartozó tartományokkal.
export const VEHICLE_CATEGORIES = ["J2", "J3", "J4", "J5"] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const EURO_CATEGORIES = [
  "EURO0",
  "EURO1",
  "EURO2",
  "EURO3",
  "EURO4",
  "EURO5",
  "EURO6",
  "LOW_EMISSION",
  "NO_EMISSION",
] as const;
export type EuroCategory = (typeof EURO_CATEGORIES)[number];

// A flotta HU-GO besorolása fix: J5 kategória, EURO6, kb. 40t össztömeg
// (nyerges vontató + Schmitz Mega pótkocsi). Nem felhasználó által állítható.
export const FIXED_VEHICLE = {
  vehicleCategory: "J5" as const,
  euroCategory: "EURO6" as const,
  weight: 40,
};

export type RoutePoint = { lon: number; lat: number };

export type TollCalcParams = {
  /** Legalább 2 pont: az útvonal állomásai sorrendben (honnan → [köztes megállók] → hová). */
  points: RoutePoint[];
  vehicleCategory: VehicleCategory;
  euroCategory: EuroCategory;
  /** tonna, HT esetén 3.5-44 közt */
  weight: number;
};

type RawTariff = {
  infrastructure: number;
  external: number;
  netTotal: number;
  vat: number;
  total: number;
};

type RawRoute = {
  distanceMeter: number;
  durationSecond: number;
  method: "FAST" | "ECONOMY" | string;
  tariff?: RawTariff;
  paidHighwayLength?: number;
  paidMotorwayLength?: number;
};

export type TollRoute = {
  method: string;
  distanceKm: number;
  durationMin: number;
  /** hiányzik, ha a szakasz nem díjköteles (pl. nincs útdíjas útvonal) */
  tollHuf: {
    infrastructure: number;
    external: number;
    grossTotal: number;
  } | null;
};

/**
 * Csak a leggyorsabb útvonalat adja vissza (a többi opciót nem mutatjuk).
 * A points tömb 2 vagy több állomást tartalmazhat — a kalkulátor a teljes,
 * több-megállós útvonalra (honnan → köztes megállók → hová) számol.
 */
export async function calculateToll(params: TollCalcParams): Promise<TollRoute> {
  if (params.points.length < 2) {
    throw new TollCalcError("Legalább két cím szükséges az útvonalhoz.");
  }

  const res = await fetch(`${BASE}/route-planner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      vehicleType: "HT",
      vehicleCategory: params.vehicleCategory,
      euroCategory: params.euroCategory,
      weight: params.weight,
      axleWeight: 0,
      height: 0,
      width: 0,
      length: 0,
      useFallback: true,
      guidance: false,
      ferry: true,
      motorway: true,
      waypoints: params.points.map((p) => [p.lon, p.lat]),
    }),
  });

  if (!res.ok) {
    throw new TollCalcError(`Az útdíjkalkulátor hibát adott (HTTP ${res.status}).`);
  }

  let routes: RawRoute[];
  try {
    routes = (await res.json()) as RawRoute[];
  } catch {
    throw new TollCalcError("Az útdíjkalkulátor válasza nem értelmezhető.");
  }

  if (!Array.isArray(routes) || routes.length === 0) {
    throw new TollCalcError("Nem található útvonal a megadott címek között.");
  }

  const r = routes.find((x) => x.method === "FAST") ?? routes[0];

  return {
    method: r.method,
    distanceKm: Math.round((r.distanceMeter / 1000) * 10) / 10,
    durationMin: Math.round(r.durationSecond / 60),
    tollHuf: r.tariff
      ? {
          infrastructure: Math.round(r.tariff.infrastructure),
          external: Math.round(r.tariff.external),
          grossTotal: Math.round(r.tariff.total),
        }
      : null,
  };
}
