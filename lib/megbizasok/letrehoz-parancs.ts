import type { AddFuvarInput } from "@/lib/fuvarozas/fuvar-constants";

/** Az új megbízások INSERT-leképezése közös, tiszta építővel (2026-10-06). */
export function letrehozInsert(input: AddFuvarInput & {
  reiseId?: string; felrakasAblakTol?: Date | null; felrakasAblakIg?: Date | null;
  lerakasAblakTol?: Date | null; lerakasAblakIg?: Date | null; megalloReszletek?: unknown;
  referencia?: string; jarmuEloiras?: string; elokeszites?: boolean;
  elokeszitesJarmu?: string | null; kitol?: string | null; allapot?: string; statusz?: string; allapotAtMost?: boolean;
  letrehozasUt?: "sajat-elokeszites" | "duvenbeck";
  idopontNyitott?: boolean; legkorabban?: string | null;
}, megrendelo: string | null) {
  if (input.letrehozasUt === "sajat-elokeszites") {
    return {
      columns: ["tipus", "datum", "felrako", "lerako", "megrendelo", "megjegyzes", "statusz", "forras", "ellenorzott", "elokeszites", "elokeszites_jarmu", "allapot", "allapot_at", "created_by", "kitol", "idopont_nyitott", "legkorabban"],
      // A régi INSERT nyersen adta át a „honnan” és a megjegyzés értékét ("" is maradt "").
      values: [input.tipus, input.datum, input.felrako ?? null, input.lerako, megrendelo, input.megjegyzes ?? null, input.statusz ?? "uj", input.forras ?? "kezi", input.ellenorzott ?? true, input.elokeszites ?? true, input.elokeszitesJarmu ?? null, input.allapot ?? "tervezett", input.createdBy ?? null, input.kitol ?? null, input.idopontNyitott ?? false, input.legkorabban ?? null],
      expressions: ["$1", "$2", "$3", "$4", "$5", "$6", "$7", "$8", "$9", "$10", "$11", "$12", "now()", "$13", "$14", "$15", "$16"],
    };
  }
  if (input.letrehozasUt === "duvenbeck") {
    const columns = ["tipus", "datum", "idopont", "felrako", "lerako", "megrendelo", "suly", "jarmu", "sofor", "fuvardij", "fuvardij_penznem", "dokumentum_url", "drive_file_id", "forras", "ellenorzott", "lerakas_datum", "pozicioszam", "postazasi_cim", "reise_id", "felrakas_ablak_tol", "felrakas_ablak_ig", "lerakas_ablak_tol", "lerakas_ablak_ig"];
    const values: unknown[] = [input.tipus, input.datum, input.idopont ?? null, input.felrako ?? null, input.lerako, megrendelo, input.suly ?? null, input.jarmu ?? null, input.sofor ?? null, input.fuvardij ?? null, input.fuvardijPenznem ?? "EUR", input.dokumentumUrl ?? null, input.driveFileId ?? null, input.forras ?? "pdf_import", input.ellenorzott ?? false, input.lerakasDatum ?? null, input.pozicioszam ?? null, input.postazasiCim ?? null, input.reiseId ?? null, input.felrakasAblakTol ?? null, input.felrakasAblakIg ?? null, input.lerakasAblakTol ?? null, input.lerakasAblakIg ?? null];
    return { columns, values, expressions: values.map((_, i) => `$${i + 1}`) };
  }
  const columns = ["tipus","datum","idopont","felrako","lerako","megrendelo","aru","mennyiseg","suly","jarmu","sofor","alvallalkozo","fuvardij","fuvardij_penznem","koltseg","megjegyzes","dokumentum_url","drive_file_id","forras","ellenorzott","created_by","erkezett_datum","lerakas_datum","fizetesi_hatarido_nap","pozicioszam","pozicioszam_nincs","postazasi_cim"];
  const values: unknown[] = [input.tipus,input.datum,input.idopont||null,input.felrako||null,input.lerako,megrendelo,input.aru||null,input.mennyiseg||null,input.suly||null,input.jarmu||null,input.sofor||null,input.alvallalkozo||null,input.fuvardij??null,input.fuvardijPenznem??"Ft",input.koltseg??null,input.megjegyzes||null,input.dokumentumUrl||null,input.driveFileId||null,input.forras??"kezi",input.ellenorzott??true,input.createdBy??null,input.erkezettDatum||null,input.lerakasDatum||null,input.fizetesiHataridoNap??null,input.pozicioszam||null,input.pozicioszamNincs??false,input.postazasiCim||null];
  const optional: [string, unknown][] = [["reise_id",input.reiseId],["felrakas_ablak_tol",input.felrakasAblakTol],["felrakas_ablak_ig",input.felrakasAblakIg],["lerakas_ablak_tol",input.lerakasAblakTol],["lerakas_ablak_ig",input.lerakasAblakIg],["referencia",input.referencia],["jarmu_eloiras",input.jarmuEloiras],["elokeszites",input.elokeszites],["elokeszites_jarmu",input.elokeszitesJarmu],["kitol",input.kitol],["allapot",input.allapot],["statusz",input.statusz]];
  for (const [column,value] of optional) if (value !== undefined) { columns.push(column); values.push(value); }
  const expressions = columns.map((column, index) => column === "allapot_at" ? "now()" : `$${index + 1}`);
  if (input.allapotAtMost) { columns.push("allapot_at"); expressions.push("now()"); }
  return { columns, values, expressions };
}
