// Excel-megbízás (.xls / .xlsx) a Drive-importban (2026-10-06: az Endo-Star
// régi .xls sablonban küldi a megbízást).
//
// Három dolog: a táblázat szövege a kiolvasáshoz, egy olcsó előszűrő, hogy a
// mappába tévedt NEM megbízás táblázat (kimutatás, lista) ne jusson a nyelvi
// modellig, és egy telefonon olvasható HTML-nézet a sofőrnek (a nyers .xls
// a telefonon csak letöltődne).
//
// NEM "use server" fájl — a drive-sync-core.ts és a dokumentum-végpont hívja.

export const EXCEL_MIME_TIPUSOK = new Set([
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
]);

/** A munkalapok sorai a megjelenített cellaértékekkel (a dátum „2026-10-06”, nem az Excel-sorszám); az üres sorok nélkül. */
async function munkalapok(buffer: Buffer): Promise<{ nev: string; sorok: string[][] }[]> {
  const XLSX = await import("xlsx");
  const munkafuzet = XLSX.read(buffer, { type: "buffer", cellDates: false });
  return munkafuzet.SheetNames.map((nev) => {
    const nyers = XLSX.utils.sheet_to_json<unknown[]>(munkafuzet.Sheets[nev], { header: 1, raw: false, blankrows: false, defval: "" });
    const sorok = nyers
      .map((sor) => sor.map((c) => String(c ?? "").replace(/\s+/g, " ").trim()))
      .filter((sor) => sor.some(Boolean));
    return { nev, sorok };
  }).filter((l) => l.sorok.length > 0);
}

/** Munkalaponként, soronként a nem üres cellák „ | ”-vel — a nyelvi modell ugyanúgy olvassa, mint a PDF szövegét. */
export async function excelSzovege(buffer: Buffer): Promise<string> {
  return (await munkalapok(buffer))
    .map((l) => l.sorok.map((sor) => sor.filter(Boolean).join(" | ")).join("\n"))
    .join("\n\n");
}

function normal(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Megbízásnak látszik-e a táblázat: a megbízás szó (vagy idegen nyelvű
 * megfelelője) szerepel benne, és nem lista — egy megbízásban legfeljebb
 * néhány különböző dátum van (felrakás, lerakás, kelt), egy kimutatásban sok.
 */
export function excelMegbizasnakLatszik(szoveg: string): boolean {
  const n = normal(szoveg);
  if (!/megbiz|auftrag|transport ?order|zlecenie|objednavka/.test(n)) return false;
  const datumok = new Set(n.match(/\b20\d{2}[-./]\s?\d{1,2}[-./]\s?\d{1,2}\b/g) ?? []);
  return datumok.size <= 5;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Önálló, szkript nélküli HTML-oldal a táblázatból (a sofőr telefonján nyílik meg). */
export async function excelHtml(buffer: Buffer, cim: string, letoltesHref: string): Promise<string> {
  const lapok = await munkalapok(buffer);
  const tablak = lapok.map((l) => {
    // A jobb szélső, mindenhol üres oszlopok nem kellenek.
    const szeles = Math.max(0, ...l.sorok.map((sor) => sor.reduce((m, c, i) => (c ? i + 1 : m), 0)));
    const sorok = l.sorok
      .map((sor) => `<tr>${sor.slice(0, szeles).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("");
    return `${lapok.length > 1 ? `<h2>${esc(l.nev)}</h2>` : ""}<div class="g"><table>${sorok}</table></div>`;
  });
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cim)}</title>
<style>
body{margin:0;padding:12px;font:14px/1.4 -apple-system,system-ui,sans-serif;background:#fff;color:#111}
h1{font-size:16px;margin:0 0 8px}h2{font-size:14px;margin:16px 0 6px}
.g{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse}td{border:1px solid #ddd;padding:4px 6px;vertical-align:top;min-width:2em}
td:empty{border-color:#f2f2f2}
a{color:#2563eb}
</style></head><body>
<h1>${esc(cim)}</h1>
${tablak.join("\n") || "<p>A táblázat üres.</p>"}
<p><a href="${esc(letoltesHref)}">Eredeti Excel-fájl letöltése</a></p>
</body></html>`;
}
