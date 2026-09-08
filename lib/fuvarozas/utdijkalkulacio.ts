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
  /**
   * Kérje-e a kalkulátortól a vonalgeometriát is (térképes megjelenítéshez).
   * Alapból kikapcsolva: ezt csak a Kalkulátor fül térképe igényli — a
   * megbízáslista automatikus, soronkénti költségbecslése és az
   * idővonal-becslés (sok, gyakori háttérhívás) az eredeti, bevált
   * kéréssel fut tovább, hogy egy esetleges guidance-viselkedésbeli
   * meglepetés (lassulás/válaszalak-eltérés) ne érinthesse a fuvarköltség-
   * számításokat.
   */
  withGeometry?: boolean;
};

type RawTariff = {
  infrastructure: number;
  external: number;
  netTotal: number;
  vat: number;
  total: number;
};

/**
 * A route-planner válasz vonalgeometriája — nincs hivatalos dokumentáció
 * arról, pontosan melyik mezőnéven és milyen alakban érkezik (GeoJSON
 * LineString, nyers [lon,lat] koordinátatömb, vagy kódolt polyline-string
 * is elképzelhető egy ilyen, Vuex store-ból visszafejtett API-nál) — az
 * extractRouteGeometry ezért több lehetséges alakot is megpróbál értelmezni.
 */
type RawGeometry =
  | { type?: string; coordinates?: unknown }
  | [number, number][]
  | string
  | null
  | undefined;

type RawRoute = {
  distanceMeter: number;
  durationSecond: number;
  method: "FAST" | "ECONOMY" | string;
  tariff?: RawTariff;
  paidHighwayLength?: number;
  paidMotorwayLength?: number;
  geometry?: RawGeometry;
  path?: RawGeometry;
  route?: RawGeometry;
  overviewGeometry?: RawGeometry;
  polyline?: RawGeometry;
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
  /**
   * A leggyorsabb útvonal vonalgeometriája, [lon, lat] pontok sorozataként
   * (ugyanaz a sorrend, mint a fuzzySearch koordinátáknál) — a térképes
   * megjelenítéshez. `null`, ha a kalkulátor válaszából nem sikerült
   * kinyerni (ekkor a térkép csak az állomások közti egyenes vonalat tudja
   * mutatni, a tényleges útvonal helyett).
   */
  geometryLonLat: [number, number][] | null;
};

/** Szabványos (Google-féle) kódolt polyline dekódolása [lat, lon] pontokra. */
function decodePolyline(encoded: string): [number, number][] | null {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const len = encoded.length;

  try {
    while (index < len) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lon += result & 1 ? ~(result >> 1) : result >> 1;

      points.push([lat / 1e5, lon / 1e5]);
    }
  } catch {
    return null;
  }
  return points.length > 1 ? points : null;
}

function isLonLatPair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

/** Egy geometria-jelölt normalizálása [lon, lat] pontsorozattá, vagy `null`, ha az alakja nem ismerhető fel. */
function normalizeGeometry(raw: RawGeometry): [number, number][] | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    const decoded = decodePolyline(raw);
    // A kódolt polyline hagyományosan [lat, lon] sorrendű — a belső [lon, lat]
    // konvencióhoz igazítjuk.
    return decoded ? decoded.map(([lat, lon]) => [lon, lat] as [number, number]) : null;
  }

  if (Array.isArray(raw)) {
    return raw.every(isLonLatPair) && raw.length > 1 ? (raw as [number, number][]) : null;
  }

  if (typeof raw === "object" && Array.isArray(raw.coordinates)) {
    const coords = raw.coordinates;
    if (coords.every(isLonLatPair) && coords.length > 1) {
      return coords as [number, number][];
    }
  }

  return null;
}

function extractRouteGeometry(r: RawRoute): [number, number][] | null {
  return (
    normalizeGeometry(r.geometry) ??
    normalizeGeometry(r.overviewGeometry) ??
    normalizeGeometry(r.path) ??
    normalizeGeometry(r.route) ??
    normalizeGeometry(r.polyline) ??
    null
  );
}

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
      // A "guidance" (útvonal-navigáció) bekapcsolása kell ahhoz, hogy a
      // válasz a vonalgeometriát (route.geometry) is tartalmazza — enélkül
      // csak a táv/idő/útdíj összegek jönnek vissza, térképi megjelenítésre
      // alkalmas útvonalrajz nélkül. Csak akkor kérjük, ha ténylegesen kell
      // (lásd TollCalcParams.withGeometry) — a gyakori, tömeges háttérhívások
      // (költségbecslés, idővonal) az eredeti, bevált kérésalakot kapják.
      guidance: params.withGeometry ?? false,
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
    geometryLonLat: extractRouteGeometry(r),
  };
}
