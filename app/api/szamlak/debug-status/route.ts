import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

// IDEIGLENES diagnosztikai végpont: az Ecofleet Vehicles/getTrips és
// getRawData végpontjainak valós válasz-formátumát térképezi fel (a
// hivatalos doksi ezekhez nem ad kitöltött mező-listát). SOHA nem adja
// vissza az API-kulcsot — csak a lekérdezés eredményét.

const ECOFLEET_BASE = "https://app.ecofleet.com/seeme/Api";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (name) => name === "node" });

async function rawGet(path: string, params: Record<string, string>) {
  const apiKey = process.env.ECOFLEET_API_KEY;
  if (!apiKey) return { error: "nincs ECOFLEET_API_KEY" };
  const url = new URL(`${ECOFLEET_BASE}/${path}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const xml = await res.text();
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    parsed = { parseError: true, xmlPreview: xml.slice(0, 500) };
  }
  return { httpStatus: res.status, parsed, xmlPreview: xml.slice(0, 800) };
}

export async function GET() {
  // 1) járművek listája -> objectId-k megszerzése
  const vehicles = await rawGet("Vehicles/get", {});

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // Az első próbálkozásból kiderült: a helyes paraméternevek
  // begTimestamp/endTimestamp (nem dateFrom/dateTo), de a formátum nem jó.
  // Több formátumot és az objectId paramot is kipróbáljuk.
  const objectId = "1144376"; // AO PU-427

  const dayStartUnix = Math.floor(new Date(`${todayStr}T00:00:00+02:00`).getTime() / 1000);
  const dayEndUnix = Math.floor(new Date(`${todayStr}T23:59:59+02:00`).getTime() / 1000);

  // A begTimestamp/endTimestamp formátum ("YYYY-MM-DD HH:MM:SS") jó (status 0),
  // de a mai napra üres a válasz -> szélesebb (14 napos) tartományt próbálunk,
  // és objectId nélkül is (hátha minden járműre kell).
  const d14 = new Date(today);
  d14.setDate(d14.getDate() - 14);
  const from14 = `${d14.getFullYear()}-${String(d14.getMonth() + 1).padStart(2, "0")}-${String(d14.getDate()).padStart(2, "0")}`;

  const attemptWideRange = await rawGet("Vehicles/getTrips", {
    objectId,
    begTimestamp: `${from14} 00:00:00`,
    endTimestamp: `${todayStr} 23:59:59`,
  });

  const attemptNoObjectId = await rawGet("Vehicles/getTrips", {
    begTimestamp: `${from14} 00:00:00`,
    endTimestamp: `${todayStr} 23:59:59`,
  });

  const attemptOtherVehicleWide = await rawGet("Vehicles/getTrips", {
    objectId: "369485",
    begTimestamp: `${from14} 00:00:00`,
    endTimestamp: `${todayStr} 23:59:59`,
  });

  return NextResponse.json({
    vehicles,
    attemptWideRange,
    attemptNoObjectId,
    attemptOtherVehicleWide,
    todayStr,
    from14,
    dayStartUnix,
    dayEndUnix,
  });
}
