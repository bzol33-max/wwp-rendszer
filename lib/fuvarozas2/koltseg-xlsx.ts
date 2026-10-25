// A feltöltött HU-GO táblázat (XLSX / CSV) beolvasása cellákra — korlátokkal.
// Se DB, se hálózat: a koltsegek-core.ts importja hívja, a
// scripts/teszt-koltseg.ts valódi (generált) XLSX-szel ellenőrzi.

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { csvSorok, HUGO_MAX_SOR, xlsxKorlatHiba, type Cella } from "@/lib/fuvarozas2/koltseg-import";

function cellaErtek(v: ExcelJS.CellValue): Cella {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("result" in v) return cellaErtek((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text);
  }
  return String(v);
}

class TulSokSor extends Error {}

/**
 * A feltöltött fájl (XLSX vagy CSV) első munkalapja cellákra bontva.
 *
 * VÉDELEM (2026-10-10): a 7 MB-os korlát a TÖMÖRÍTETT méretre vonatkozik — egy
 * kicsi XLSX kibontva több száz MB is lehet, és a `wb.xlsx.load` az egészet
 * az éles folyamat memóriájába húzta. Most: (1) kibontás ELŐTT a zip központi
 * könyvtárából ellenőrizzük a kibontott méretet (xlsxKorlatHiba); (2) a
 * munkalapot az exceljs STREAMELŐ olvasója olvassa, és HUGO_MAX_SOR sor után
 * tisztán megáll, hibaüzenettel. (3) Ha a streamelő olvasó elbukik (Node 24-en
 * időzítéstől függően — 2026-10-25-i mérés: 30 olvasásból 17), a teljes
 * betöltés (teljesBetoltes) olvassa ugyanazzal a sor-korláttal; ahol a stream
 * sikerül, a kettő cellára azonos eredményt ad.
 */
function tulHosszu(maxSor: number) {
  return new Error(`A táblázat túl hosszú (legfeljebb ${maxSor.toLocaleString("hu-HU")} sor) — exportáld kisebb időszakra.`);
}

/** Tartalék a streamelő olvasó hibájára: a teljes munkafüzet betöltése, ugyanazzal a sor-korláttal. */
async function teljesBetoltes(tartalom: Buffer, maxSor: number, streamHiba: unknown): Promise<Cella[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(tartalom as unknown as ArrayBuffer);
  } catch (err) {
    const ok = streamHiba ?? err;
    throw new Error(`Az .xlsx nem olvasható: ${ok instanceof Error ? ok.message : String(ok)}`);
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  if (ws.rowCount > maxSor) throw tulHosszu(maxSor);
  const sorok: Cella[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cellak: Cella[] = [];
    row.eachCell({ includeEmpty: true }, (cell, oszlop) => { cellak[oszlop - 1] = cellaErtek(cell.value); });
    sorok[row.number - 1] = cellak;
  });
  return Array.from(sorok, (s) => s ?? []);
}

export async function tablazatSorai(fajlnev: string, tartalom: Buffer, maxSor = HUGO_MAX_SOR): Promise<Cella[][]> {
  const xlsx = /\.xlsx$/i.test(fajlnev) || (tartalom[0] === 0x50 && tartalom[1] === 0x4b);
  if (xlsx) {
    const korlat = xlsxKorlatHiba(tartalom);
    if (korlat) throw new Error(korlat);
    const olvaso = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(tartalom), {
      sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", worksheets: "emit", entries: "emit",
    });
    const sorok: Cella[][] = [];
    let volt = false;
    try {
      for await (const ws of olvaso) {
        volt = true;
        for await (const row of ws) {
          if (row.number > maxSor) throw new TulSokSor();
          const cellak: Cella[] = [];
          row.eachCell({ includeEmpty: true }, (cell, oszlop) => { cellak[oszlop - 1] = cellaErtek(cell.value); });
          sorok[row.number - 1] = cellak;
        }
        break; // csak az első munkalap
      }
    } catch (err) {
      if (err instanceof TulSokSor) throw tulHosszu(maxSor);
      // A streamelő olvasó zip-bejárása (unzipper 0.10) Node 24-en időzítéstől
      // függően idő előtt véget érhet, és a munkalapot a munkafüzet-adat előtt
      // dolgozza fel („reading 'sheets'”) — ugyanaz a fájl hol beolvasható,
      // hol nem (audit Q5, 2026-10-25). Ilyenkor a teljes betöltés jön; a
      // kibontott méretet a fenti xlsxKorlatHiba már 40 MB-ra korlátozta.
      return teljesBetoltes(tartalom, maxSor, err);
    }
    // Munkalap nélkül véget ért stream: ugyanaz az idő előtti vég, csendben.
    if (!volt) return teljesBetoltes(tartalom, maxSor, null);
    return Array.from(sorok, (s) => s ?? []);
  }
  if (/\.xls$/i.test(fajlnev)) throw new Error("A régi .xls formátumot nem tudjuk olvasni — mentsd el .xlsx-ként vagy CSV-ként.");
  // CSV: UTF-8, ha hibás karakter lenne benne, Windows-1250 (a magyar Excel alapja).
  let szoveg = new TextDecoder("utf-8").decode(tartalom);
  if (szoveg.includes("\uFFFD")) szoveg = new TextDecoder("windows-1250").decode(tartalom);
  const sorok = csvSorok(szoveg);
  if (sorok.length > maxSor) throw new Error(`A táblázat túl hosszú (legfeljebb ${maxSor.toLocaleString("hu-HU")} sor) — exportáld kisebb időszakra.`);
  return sorok;
}
