// A NAV havonta közzétett, üzemanyagköltség-elszámoláshoz alkalmazható
// gázolajárának automatikus lekérése a hivatalos NAV oldalról — nincs
// hivatalos "heti" ár Magyarországon, ez a legfrissebb, jogszabály szerint
// közzétett referenciaár. A cél, hogy ezt SOHA ne kelljen kézzel frissíteni:
// a kalkulátor minden betöltéskor (napi cache mellett) újra lekérdezi.
//
// Az oldal (nav.gov.hu) nem ad publikus JSON API-t ehhez, a táblázat a HTML
// egy JSON-be ágyazott, HTML-entitásokkal kódolt mezőjében van — ezért
// szöveges kereséssel (nem class-névre vagy DOM-struktúrára támaszkodva)
// keressük meg a táblázatot és a "Gázolaj (piaci árszabás)" oszlopot, hogy
// egy apró oldalfrissítés se törje el.

const NAV_URL = "https://nav.gov.hu/ugyfeliranytu/uzemanyag/2026-ban-alkalmazhato-uzemanyagarak";

const HONAPOK = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
];

export class GazolajArError extends Error {}

export type GazolajAr = {
  ar: number;
  /** pl. "2026. szeptember" */
  cimke: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  // A forrás egy JSON-string-be ágyazott HTML, ahol az újsorok literális
  // "\n" (backslash + n) két karakterként maradnak a kinyert szövegben —
  // ezeket is szóköznek kell tekinteni, különben pl. "\n szeptember \n"
  // sosem egyezik a hónapnevek listájával.
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml))) {
    cells.push(stripTags(m[1]));
  }
  return cells;
}

/** Lekéri a NAV oldaláról a legfrissebb hónap "Gázolaj (piaci árszabás)" árát. */
export async function fetchGazolajAr(): Promise<GazolajAr> {
  const res = await fetch(NAV_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
    // A NAV havonta egyszer frissíti — napi újralekérdezés bőven elég, de nem
    // terheli feleslegesen az oldalukat minden egyes kalkulátor-betöltésnél.
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!res.ok) {
    throw new GazolajArError(`NAV oldal nem elérhető (HTTP ${res.status}).`);
  }
  const raw = await res.text();
  const decoded = decodeEntities(raw);

  const gazolajIdx = decoded.indexOf("Gázolaj");
  if (gazolajIdx === -1) {
    throw new GazolajArError("A NAV oldalon nem található \"Gázolaj\" szövegrész.");
  }
  const tableStart = decoded.lastIndexOf("<table", gazolajIdx);
  const tableEndTag = decoded.indexOf("</table>", gazolajIdx);
  if (tableStart === -1 || tableEndTag === -1) {
    throw new GazolajArError("Nem található a táblázat a NAV oldalán.");
  }
  const tableHtml = decoded.slice(tableStart, tableEndTag + "</table>".length);

  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  if (rows.length < 2) {
    throw new GazolajArError("A NAV táblázatában nem található elég sor.");
  }

  const headerCells = extractCells(rows[0]);
  const gazolajPiaciIdx = headerCells.findIndex(
    (c) => /gázolaj/i.test(c) && /piaci/i.test(c)
  );
  if (gazolajPiaciIdx === -1) {
    throw new GazolajArError("Nem található a \"Gázolaj (piaci árszabás)\" oszlop.");
  }

  const evMatch = headerCells[0].match(/\d{4}/);
  const ev = evMatch ? evMatch[0] : String(new Date().getFullYear());

  for (const row of rows.slice(1)) {
    const cells = extractCells(row);
    const honap = cells[0]?.toLowerCase();
    if (!honap || !HONAPOK.includes(honap)) continue;
    const arSzoveg = cells[gazolajPiaciIdx];
    const ar = Number(arSzoveg?.replace(/[^\d]/g, ""));
    if (!ar || ar < 200 || ar > 2000) continue; // életszerűtlen érték — kihagyjuk
    return { ar, cimke: `${ev}. ${honap}` };
  }

  throw new GazolajArError("Nem található érvényes havi gázolajár a táblázatban.");
}
