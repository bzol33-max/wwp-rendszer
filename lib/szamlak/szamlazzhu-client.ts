// Számlázz.hu Számla Agent API — kliens a "számla lekérdezése XML-ben" (query
// invoice) funkcióhoz. FONTOS: ez a modul sosem ÁLLÍT KI számlát, csak
// lekérdezi a Számlázz.hu-ban már meglévőket.
//
// Dokumentáció: https://docs.szamlazz.hu/agent/querying_xml/xml és
// https://docs.szamlazz.hu/agent/querying_xml/response — az endpoint minden
// Agent-funkcióhoz ugyanaz (https://www.szamlazz.hu/szamla/), a hívott
// funkciót a multipart mezőnév dönti el: a számla-lekérdezéshez ez
// "action-szamla_agent_xml".
//
// A mezők SORRENDJE a request XML-ben KÖTÖTT (a Számlázz.hu XSD-je szerint),
// ezt NE változtasd meg.

import { XMLParser } from "fast-xml-parser";

const AGENT_URL = "https://www.szamlazz.hu/szamla/";

export class SzamlazzHuError extends Error {
  constructor(
    message: string,
    public readonly kod: "NEM_TALALHATO" | "HIBA" | "VALASZ_HIBA"
  ) {
    super(message);
  }
}

function buildQueryXml(szamlaszam: string, agentKulcs: string): string {
  // Az XML-entitásokat (&, <, >) escape-eljük, bár számlaszámban ezek nem
  // várhatók — a robusztusság kedvéért mégis megtesszük.
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<xmlszamlaxml xmlns="http://www.szamlazz.hu/xmlszamlaxml" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamlaxml https://www.szamlazz.hu/szamla/docs/xsds/agentxml/xmlszamlaxml.xsd">
  <szamlaagentkulcs>${escape(agentKulcs)}</szamlaagentkulcs>
  <szamlaszam>${escape(szamlaszam)}</szamlaszam>
  <rendelesSzam></rendelesSzam>
  <pdf>false</pdf>
  <szamlaKulsoAzon></szamlaKulsoAzon>
</xmlszamlaxml>`;
}

/** A Számlázz.hu <szamla> válaszából kinyert, számunkra releváns mezők. */
export type SzamlazzHuSzamla = {
  szamlaszam: string;
  vevoNev: string;
  rendelesszam: string | null;
  fizmod: string | null;
  penznem: string;
  teljesitesDatum: string | null;
  kiallitasDatum: string;
  fizetesiHatarido: string | null;
  netto: number | null;
  afa: number | null;
  brutto: number;
  /** A tételek megnevezése összefűzve — a kategorizáláshoz. */
  tetelekSzoveg: string;
  rawXml: string;
};

/**
 * A fast-xml-parser alapból nem old fel minden numerikus HTML-entitást (a
 * Számlázz.hu válasza pl. "&#225;"-t küld "á" helyett) — egy valós
 * válaszban ellenőrizve ez okozott hibás ("VASB&#193;R-KER Kft.") neveket.
 * Ez a függvény utólag, biztonságosan feloldja ezeket.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toIsoDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // A Számlázz.hu jellemzően YYYY-MM-DD-t ad vissza az XML-ben (a PDF-en
  // látható "2026.09.03." csak a nyomtatott formátum) — mindkettőt kezeljük.
  const m = s.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})\.?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s || null;
}

/** Egy elem tömbbé alakítása, ha az XML-parser egyetlen elemnél nem tömböt adna vissza. */
function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Lekérdez egy számlát a Számlázz.hu-ból sorszám alapján.
 * - Ha nincs ilyen sorszámú számla (hibakód 7), `null`-t ad vissza — ez NEM
 *   hiba, hanem azt jelenti, hogy ezt a sorszámot még figyelni kell (lásd
 *   szamlak_poll_pending, lib/szamlak/poll.ts).
 * - Minden más hibánál (hálózati hiba, hibás kulcs, egyéb hibakód) dob.
 */
export async function lekerdezSzamla(
  szamlaszam: string,
  agentKulcs: string
): Promise<SzamlazzHuSzamla | null> {
  const xml = buildQueryXml(szamlaszam, agentKulcs);
  const form = new FormData();
  form.append(
    "action-szamla_agent_xml",
    new Blob([xml], { type: "text/xml" }),
    "action-szamla_agent_xml.xml"
  );

  const res = await fetch(AGENT_URL, { method: "POST", body: form });
  const bodyText = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(bodyText);
  } catch {
    throw new SzamlazzHuError(
      `A Számlázz.hu válasza nem értelmezhető XML-ként (HTTP ${res.status}).`,
      "VALASZ_HIBA"
    );
  }

  // Hibaválasz: <xmlszamlavalasz><sikeres>false</sikeres>...
  const hibaValasz = parsed["xmlszamlavalasz"] as Record<string, unknown> | undefined;
  if (hibaValasz) {
    const sikeres = String(hibaValasz["sikeres"]).toLowerCase() === "true";
    if (!sikeres) {
      const hibakod = String(hibaValasz["hibakod"] ?? "");
      const hibauzenet = String(hibaValasz["hibauzenet"] ?? "ismeretlen hiba");
      if (hibakod === "7") return null; // nincs ilyen számlaszám (még)
      throw new SzamlazzHuError(
        `Számlázz.hu hiba (${hibakod}): ${hibauzenet}`,
        "HIBA"
      );
    }
  }

  // Sikeres válasz: <szamla><vevo>...</vevo><alap>...</alap><tetelek>...</tetelek>...
  const szamla = parsed["szamla"] as Record<string, unknown> | undefined;
  if (!szamla) {
    throw new SzamlazzHuError(
      "A Számlázz.hu válasza sem hibát, sem számla-adatot nem tartalmazott.",
      "VALASZ_HIBA"
    );
  }

  const alap = (szamla["alap"] ?? {}) as Record<string, unknown>;
  const vevo = (szamla["vevo"] ?? {}) as Record<string, unknown>;
  const osszegek = (szamla["osszegek"] ?? {}) as Record<string, unknown>;
  // A tényleges (élő) válasz szerint az összesítők az <osszegek><totalossz>
  // alatt vannak, nem közvetlenül az <osszegek> alatt.
  const totalossz = (osszegek["totalossz"] ?? {}) as Record<string, unknown>;
  const tetelekNode = (szamla["tetelek"] ?? {}) as Record<string, unknown>;
  const tetelSorok = asArray(tetelekNode["tetel"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
  // A tétel megnevezése <nev> (nem <megnevezes>) — élő válaszban ellenőrizve.
  const tetelekSzoveg = decodeEntities(
    tetelSorok
      .map((t) => String(t["nev"] ?? "").trim())
      .filter(Boolean)
      .join("; ")
  );

  const szamlaszamValasz = String(alap["szamlaszam"] ?? szamlaszam);
  // A pénznem mezője <devizanem> (pl. "Ft"), nem <penznem>.
  const penznem = alap["devizanem"] ? decodeEntities(String(alap["devizanem"]).trim()) : "Ft";

  return {
    szamlaszam: szamlaszamValasz,
    vevoNev: decodeEntities(String(vevo["nev"] ?? "").trim()),
    rendelesszam: alap["rendelesszam"] ? String(alap["rendelesszam"]).trim() || null : null,
    fizmod: alap["fizmod"] ? decodeEntities(String(alap["fizmod"]).trim()) || null : null,
    penznem,
    // <telj> = teljesítés dátuma, <fizh> = fizetési határidő, <kelt> = kiállítás dátuma.
    teljesitesDatum: toIsoDate(alap["telj"]),
    kiallitasDatum: toIsoDate(alap["kelt"]) ?? new Date().toISOString().slice(0, 10),
    fizetesiHatarido: toIsoDate(alap["fizh"]),
    netto: toNumber(totalossz["netto"]),
    afa: toNumber(totalossz["afa"]),
    brutto: toNumber(totalossz["brutto"]) ?? 0,
    tetelekSzoveg,
    rawXml: bodyText,
  };
}
