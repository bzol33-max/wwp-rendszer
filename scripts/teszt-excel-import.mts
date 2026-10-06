// Excel-megbízás a Drive-importban (lib/fuvarozas/import/excel.ts).
// Futtatás: npx tsx scripts/teszt-excel-import.mts [megbizas.xls]
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { excelHtml, excelMegbizasnakLatszik, excelSzovege } from "../lib/fuvarozas/import/excel";

let hiba = 0;
const ellenoriz = (nev: string, ok: boolean) => { console.log(`${ok ? "OK  " : "HIBA"} ${nev}`); if (!ok) hiba++; };
const xlsx = (sorok: unknown[][]) => XLSX.write({ SheetNames: ["Lap1"], Sheets: { Lap1: XLSX.utils.aoa_to_sheet(sorok) } }, { type: "buffer", bookType: "xlsx" }) as Buffer;

// 1. Megbízás-sablon: átmegy az előszűrőn, a szöveg soronként jön.
const megbizas = await excelSzovege(xlsx([["SZÁLLÍTÁSI MEGBÍZÁS"], ["Megbízó:", "Teszt Kft."], ["Rakodás", "2026-10-06"], ["Fuvardíj:", "100.000 Ft+áfa"]]));
ellenoriz("megbízás szövege soronként", megbizas.includes("Megbízó: | Teszt Kft.") && megbizas.includes("Rakodás | 2026-10-06"));
ellenoriz("megbízás átmegy az előszűrőn", excelMegbizasnakLatszik(megbizas));

// 2. Kimutatás (sok dátum) és megbízás-szó nélküli táblázat: kiszűrve.
const kimutatas = await excelSzovege(xlsx([["Fuvar megbízások kimutatás"], ...Array.from({ length: 12 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, "Teszt Kft.", "NMZ-492", 100000])]));
ellenoriz("kimutatás kiszűrve", !excelMegbizasnakLatszik(kimutatas));
ellenoriz("megbízás-szó nélküli táblázat kiszűrve", !excelMegbizasnakLatszik(await excelSzovege(xlsx([["Készlet"], ["Paletta", 120]]))));

// 3. HTML-nézet: a cellatartalom escape-elve, nincs szkript.
const html = await excelHtml(xlsx([["<script>alert(1)</script>", "a & b"]]), "Teszt <x>", "/letolt?x=1&y=2");
ellenoriz("HTML: nincs nyers <script>", !/<script/i.test(html) && html.includes("&lt;script&gt;"));
ellenoriz("HTML: & escape-elve", html.includes("a &amp; b") && html.includes("Teszt &lt;x&gt;") && html.includes("/letolt?x=1&amp;y=2"));

// 4. Valódi fájl, ha meg van adva (pl. a régi .xls Endo-Star sablon).
const ut = process.argv[2];
if (ut) {
  const buf = readFileSync(ut);
  const szoveg = await excelSzovege(buf);
  ellenoriz(`valódi fájl átmegy az előszűrőn (${ut.split("/").pop()})`, excelMegbizasnakLatszik(szoveg));
  console.log(szoveg.split("\n").slice(0, 6).join("\n"));
}

if (hiba) { console.error(`${hiba} hiba`); process.exit(1); }
