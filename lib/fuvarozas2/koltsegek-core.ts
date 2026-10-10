import "server-only";
import ExcelJS from "exceljs";
import { query } from "@/lib/db";
import { getJarmuvek } from "@/lib/fuvarozas/jarmuvek-db";
import { findJarmuByPlate } from "@/lib/fuvarozas/vehicles";
import { csvSorok, parseHuGoTabla, parseOpluszErtesites, type Cella, type HuGoBeolvasas } from "@/lib/fuvarozas2/koltseg-import";

// Költség-importok — az ÍRÓ rész (DB, fájl-beolvasás). NEM "use server"
// fájl: a Gmail-végpont (levelek-core.ts) és a Költségek oldal szerver-akciói
// (lib/fuvarozas2/koltsegek.ts) hívják; a jogosultságot a hívó ellenőrzi.

export type TankolasRogzites = {
  /** "YYYY-MM-DD HH:MM[:SS]" budapesti idő. */
  idopont: string;
  rendszam: string | null;
  osszegFt: number;
  liter: number | null;
  tranzakcioSzam: string;
  forras: "oplusz_email" | "kezi" | "import";
  levelId?: string | null;
  rogzitette?: string | null;
};

/** Egy tankolás mentése; idempotens a tranzakciószámra. true, ha új sor lett. */
export async function rogzitTankolast(t: TankolasRogzites): Promise<boolean> {
  const jarmuvek = await getJarmuvek();
  const jarmu = t.rendszam ? findJarmuByPlate(t.rendszam, jarmuvek) : null;
  const sorok = await query<{ id: string }>(
    `insert into tankolas (jarmu_id, rendszam_nyers, idopont, liter, osszeg_ft, tranzakcio_szam, forras, level_id, rogzitette)
     values ($1::bigint, $2, ($3::timestamp at time zone 'Europe/Budapest'), $4, $5, $6, $7, $8, $9)
     on conflict (tranzakcio_szam) do nothing
     returning id::text`,
    [jarmu?.id ?? null, t.rendszam, t.idopont, t.liter, t.osszegFt, t.tranzakcioSzam, t.forras, t.levelId ?? null, t.rogzitette ?? null]
  );
  return sorok.length > 0;
}

/**
 * Egy 'tankolas' osztályú levél (Oplusz bizonylat-értesítő) feldolgozása —
 * a levelek-core hívja minden ilyen levélre (idempotens). A havi számla-
 * értesítőből nem lesz tankolás (nincs benne vásárlás).
 */
export async function tankolasLevelbol(l: { gmailMessageId: string; targy: string | null; snippet: string | null }): Promise<"uj" | "ismert" | "nem_bizonylat"> {
  const t = parseOpluszErtesites(`${l.targy ?? ""}\n${l.snippet ?? ""}`);
  if (!t) return "nem_bizonylat";
  const uj = await rogzitTankolast({
    idopont: t.idopont, rendszam: t.rendszam, osszegFt: t.osszegFt, liter: t.liter,
    tranzakcioSzam: t.tranzakcioSzam, forras: "oplusz_email", levelId: l.gmailMessageId, rogzitette: "gmail-figyelo",
  });
  return uj ? "uj" : "ismert";
}

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

/** A feltöltött fájl (XLSX vagy CSV) első munkalapja cellákra bontva. */
export async function tablazatSorai(fajlnev: string, tartalom: Buffer): Promise<Cella[][]> {
  const xlsx = /\.xlsx$/i.test(fajlnev) || (tartalom[0] === 0x50 && tartalom[1] === 0x4b);
  if (xlsx) {
    const wb = new ExcelJS.Workbook();
    // Az exceljs saját Buffer-deklarációja nem egyezik a Node-éval (lásd lib/szamlak/kontokivonat-parositas.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(tartalom as any);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const sorok: Cella[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, sorSzam) => {
      const cellak: Cella[] = [];
      row.eachCell({ includeEmpty: true }, (cell, oszlop) => { cellak[oszlop - 1] = cellaErtek(cell.value); });
      sorok[sorSzam - 1] = cellak;
    });
    return Array.from(sorok, (s) => s ?? []);
  }
  if (/\.xls$/i.test(fajlnev)) throw new Error("A régi .xls formátumot nem tudjuk olvasni — mentsd el .xlsx-ként vagy CSV-ként.");
  // CSV: UTF-8, ha hibás karakter lenne benne, Windows-1250 (a magyar Excel alapja).
  let szoveg = new TextDecoder("utf-8").decode(tartalom);
  if (szoveg.includes("�")) szoveg = new TextDecoder("windows-1250").decode(tartalom);
  return csvSorok(szoveg);
}

export type HuGoImportEredmeny = {
  beolvasva: number;
  uj: number;
  marVolt: number;
  kocsiNelkul: number;
  hibak: string[];
  kihagyott: number;
  oszlopok: Record<string, string>;
  osszegFt: number;
  idoszak: { tol: string; ig: string } | null;
};

/** HU-GO export beolvasása és mentése az utdij_tranzakcio táblába (idempotens a kulso_azonosito-ra). */
export async function importalHuGo(fajlnev: string, tartalom: Buffer): Promise<HuGoImportEredmeny> {
  const sorok = await tablazatSorai(fajlnev, tartalom);
  const b: HuGoBeolvasas = parseHuGoTabla(sorok, await getJarmuvek());
  let uj = 0;
  for (const t of b.tranzakciok) {
    const r = await query<{ id: string }>(
      `insert into utdij_tranzakcio (jarmu_id, rendszam, rendszam_nyers, idopont, szakasz, kategoria, brutto_ft, netto_ft, tav_km, kulso_azonosito, forras_fajl)
       values ($1::bigint, $2, $3, ($4::timestamp at time zone 'Europe/Budapest'), $5, $6, $7, $8, $9, $10, $11)
       on conflict (kulso_azonosito) do nothing returning id::text`,
      [t.jarmuId, t.rendszam, t.rendszam, t.idopont, t.szakasz, t.kategoria, t.bruttoFt, t.nettoFt, t.tavKm, t.kulsoAzonosito, fajlnev.slice(0, 200)]
    );
    if (r.length > 0) uj++;
  }
  const idok = b.tranzakciok.map((t) => t.idopont).sort();
  return {
    beolvasva: b.tranzakciok.length,
    uj,
    marVolt: b.tranzakciok.length - uj,
    kocsiNelkul: b.tranzakciok.filter((t) => !t.jarmuId).length,
    hibak: b.hibak.slice(0, 30),
    kihagyott: b.kihagyott,
    oszlopok: b.oszlopok,
    osszegFt: b.tranzakciok.reduce((a, t) => a + t.bruttoFt, 0),
    idoszak: idok.length ? { tol: idok[0], ig: idok[idok.length - 1] } : null,
  };
}
