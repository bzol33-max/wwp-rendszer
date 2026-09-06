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

  // Több lehetséges paraméter-elnevezést próbálunk a getTrips-hez, mert a
  // doksi nem közli őket.
  const tripsAttempt1 = await rawGet("Vehicles/getTrips", {
    dateFrom: `${todayStr} 00:00:00`,
    dateTo: `${todayStr} 23:59:59`,
  });

  return NextResponse.json({
    vehicles,
    tripsAttempt1,
    todayStr,
  });
}
