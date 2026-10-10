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
 * tisztán megáll, hibaüzenettel.
 */
export async function tablazatSorai(fajlnev: string, tartalom: Buffer, maxSor = HUGO_MAX_SOR): Promise<Cella[][]> {
  const xlsx = /\.xlsx$/i.test(fajlnev) || (tartalom[0] === 0x50 && tartalom[1] === 0x4b);
  if (xlsx) {
    const korlat = xlsxKorlatHiba(tartalom);
    if (korlat) throw new Error(korlat);
    const olvaso = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(tartalom), {
      sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", worksheets: "emit", entries: "emit",
    });
    const sorok: Cella[][] = [];
    try {
      for await (const ws of olvaso) {
        for await (const row of ws) {
          if (row.number > maxSor) throw new TulSokSor();
          const cellak: Cella[] = [];
          row.eachCell({ includeEmpty: true }, (cell, oszlop) => { cellak[oszlop - 1] = cellaErtek(cell.value); });
          sorok[row.number - 1] = cellak;
        }
        break; // csak az első munkalap
      }
    } catch (err) {
      if (err instanceof TulSokSor) throw new Error(`A táblázat túl hosszú (legfeljebb ${maxSor.toLocaleString("hu-HU")} sor) — exportáld kisebb időszakra.`);
      throw new Error(`Az .xlsx nem olvasható: ${err instanceof Error ? err.message : String(err)}`);
    }
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
