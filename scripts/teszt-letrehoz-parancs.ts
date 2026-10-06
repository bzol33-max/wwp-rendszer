import { letrehozInsert } from "../lib/megbizasok/letrehoz-parancs";

function ellenoriz(név: string, feltetel: boolean) {
  if (!feltetel) throw new Error(`Hibás létrehozási leképezés: ${név}`);
}
function adat(input: Parameters<typeof letrehozInsert>[0], megrendelo: string | null): Record<string, { value: unknown; expression: string }> {
  const { columns, values, expressions } = letrehozInsert(input, megrendelo);
  return Object.fromEntries(columns.map((column, i) => {
    const expression = expressions[i];
    const bind = expression.match(/^\$(\d+)$/)?.[1];
    return [column, { value: bind ? values[Number(bind) - 1] : null, expression }];
  }));
}

const ber = adat({ tipus: "sajat", datum: "2026-10-06", lerako: "Bécs", fuvardijPenznem: "Ft" }, "Partner Kft.");
ellenoriz("bér: fordított tipus", ber.tipus.value === "sajat");
ellenoriz("bér: megrendelő", ber.megrendelo.value === "Partner Kft.");

const sajatParancs = { tipus: "ber" as const, datum: "2026-10-06", felrako: "Honnan", lerako: "Telep", forras: "kezi" as const, ellenorzott: true, elokeszites: true, elokeszitesJarmu: "ABC-123", kitol: "Sofőr", allapot: "tervezett", statusz: "uj", letrehozasUt: "sajat-elokeszites" as const };
const sajat = adat(sajatParancs, "Saját fuvar");
ellenoriz("saját: fordított tipus", sajat.tipus.value === "ber");
ellenoriz("saját: státusz és állapot", sajat.statusz.value === "uj" && sajat.allapot.value === "tervezett");
ellenoriz("saját: előkészítési mezők", sajat.elokeszites.value === true && sajat.elokeszites_jarmu.value === "ABC-123" && sajat.kitol.value === "Sofőr");
ellenoriz("saját: allapot_at now()", sajat.allapot_at.expression === "now()");
ellenoriz("saját: régi oszloplista", Object.keys(sajat).join(",") === "tipus,datum,felrako,lerako,megrendelo,megjegyzes,statusz,forras,ellenorzott,elokeszites,elokeszites_jarmu,allapot,allapot_at,created_by,kitol");

const duvenbeck = adat({ tipus: "sajat", datum: "2026-10-06", lerako: "Ulm", megrendelo: "Duvenbeck Logisztikai Kft.", forras: "pdf_import", ellenorzott: false, reiseId: "R-1", fuvardijPenznem: "EUR", felrakasAblakTol: new Date("2026-10-06T06:00:00Z"), letrehozasUt: "duvenbeck" }, "Duvenbeck Logisztikai Kft.");
ellenoriz("Duvenbeck: reise id és EUR", duvenbeck.reise_id.value === "R-1" && duvenbeck.fuvardij_penznem.value === "EUR");
ellenoriz("Duvenbeck: forrás és ellenőrzés", duvenbeck.forras.value === "pdf_import" && duvenbeck.ellenorzott.value === false);
ellenoriz("Duvenbeck: időablak", duvenbeck.felrakas_ablak_tol.value instanceof Date);
ellenoriz("Duvenbeck: a korábbi oszloplista", Object.keys(duvenbeck).join(",") === "tipus,datum,idopont,felrako,lerako,megrendelo,suly,jarmu,sofor,fuvardij,fuvardij_penznem,dokumentum_url,drive_file_id,forras,ellenorzott,lerakas_datum,pozicioszam,postazasi_cim,reise_id,felrakas_ablak_tol,felrakas_ablak_ig,lerakas_ablak_tol,lerakas_ablak_ig");

const drive = adat({ tipus: "sajat", datum: "2026-10-06", lerako: "Győr", dokumentumUrl: "https://drive.test/file", driveFileId: "f-1", forras: "pdf_import", ellenorzott: false }, "Megrendelő");
ellenoriz("Drive-import mezői", drive.tipus.value === "sajat" && drive.dokumentum_url.value === "https://drive.test/file" && drive.drive_file_id.value === "f-1" && drive.ellenorzott.value === false);

console.log("Létrehozási parancs teszt: 4 útvonal rendben");
