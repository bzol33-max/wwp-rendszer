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

  const attemptSpaceFormat = await rawGet("Vehicles/getTrips", {
    objectId,
    begTimestamp: `${todayStr} 00:00:00`,
    endTimestamp: `${todayStr} 23:59:59`,
  });

  const attemptIsoFormat = await rawGet("Vehicles/getTrips", {
    objectId,
    begTimestamp: `${todayStr}T00:00:00`,
    endTimestamp: `${todayStr}T23:59:59`,
  });

  const attemptUnixFormat = await rawGet("Vehicles/getTrips", {
    objectId,
    begTimestamp: String(dayStartUnix),
    endTimestamp: String(dayEndUnix),
  });

  const attemptDateOnlyFormat = await rawGet("Vehicles/getTrips", {
    objectId,
    begTimestamp: todayStr,
    endTimestamp: todayStr,
  });

  return NextResponse.json({
    vehicles,
    attemptSpaceFormat,
    attemptIsoFormat,
    attemptUnixFormat,
    attemptDateOnlyFormat,
    todayStr,
    dayStartUnix,
    dayEndUnix,
  });
}
