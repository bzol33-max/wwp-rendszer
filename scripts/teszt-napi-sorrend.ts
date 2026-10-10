// Egy kocsi fuvarjainak sorrendje (Ma oldal, Tervezés).
// Futtatás: npx tsx scripts/teszt-napi-sorrend.ts
//
// Valós minta: Gergő (AOPU-427) 2026-10-05 — a Lösung-fuvar (#293) korábban
// lett rögzítve, mint a két saját fuvar, mégis az a nap utolsó fuvarja.

import { berUtkozes, napiSorrend, osszehasonlitFuvarokat, parositasiSorrend, tervIdoMegbizasbol, type SorrendAdat } from "@/lib/fuvarozas2/napi-sorrend";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const ids = (l: SorrendAdat[]) => napiSorrend(l, (x) => x).map((x) => x.id);

const losung: SorrendAdat = { id: "293", felrakasNap: "2026-10-05", lerakasNap: "2026-10-06", felrako: "HU-9600 Sárvár, Ikervári út 42.", lerako: "HU-4031 Debrecen" };
const palFerr: SorrendAdat = { id: "294", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "Szakoly, Rákóczi utca 26", lerako: "Tata" };
const fabrika: SorrendAdat = { id: "295", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "2890 Tata, Agráripari telep", lerako: "9662 Tompaládony, 0117/8 hrsz." };

eq("Gergő 10.05.: a több napos bérfuvar a végére", ids([losung, palFerr, fabrika]), ["294", "295", "293"]);
eq("láncolás: Tata-lerakó a Tata-felrakó elé, fordított id-nál is", ids([{ ...fabrika, id: "1" }, { ...palFerr, id: "2" }]), ["2", "1"]);
// Az id (rögzítés sorrendje) már CSAK a legutolsó döntő: ha egyiknek sincs
// ideje (tény vagy kiírt időpont) és lánc sincs. Időpont esetén az dönt —
// lásd T5 lent (2026-10-10: a később rögzített 10:00-s bérfuvar nem
// kerülhet az időpont nélküli saját mögé).
eq("lánc és időpont nélkül az id dönt", ids([{ ...losung, id: "5", lerakasNap: "2026-10-05" }, { ...palFerr, id: "3", lerako: "Győr" }]), ["3", "5"]);
eq("ugyanez, de a később rögzítettnek kiírt időpontja van: az előre", ids([{ ...losung, id: "5", lerakasNap: "2026-10-05", tervIdo: Date.parse("2026-10-05T08:00:00Z") }, { ...palFerr, id: "3", lerako: "Győr" }]), ["5", "3"]);
eq("körbeérő lánc nem akad meg", ids([
  { id: "1", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "Tata", lerako: "Győr" },
  { id: "2", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", felrako: "Győr", lerako: "Tata" },
]).length, 2);
eq("korábbi lerakás-nap mindig előrébb", ids([losung, { ...palFerr, felrakasNap: "2026-10-04", lerakasNap: "2026-10-04" }]), ["294", "293"]);

// --- Az egységes szabály (2026-10-10): „bérfuvar után a saját fuvar külön,
// a helyes sorrendben — ne ugorjon előre”.
const BP = (hhmm: string) => Date.parse(`2026-10-12T${hhmm}:00+02:00`);
const ber10: SorrendAdat = { id: "320", felrakasNap: "2026-10-12", lerakasNap: "2026-10-12", felrako: "Debrecen", lerako: "Miskolc", tervIdo: BP("10:00") };
const sajatIdoNelkul: SorrendAdat = { id: "310", felrakasNap: "2026-10-12", lerakasNap: "2026-10-12", felrako: "Szakoly", lerako: "Nyíregyháza" };
eq("T5: a később rögzített 10:00-s bérfuvar az időpont nélküli saját elé", ids([sajatIdoNelkul, ber10]), ["320", "310"]);
eq("T5: a bejövő sorrendtől független", ids([ber10, sajatIdoNelkul]), ["320", "310"]);
eq("T5: összehasonlító is így dönt", osszehasonlitFuvarokat(ber10, sajatIdoNelkul) < 0, true);
eq("T5: elkezdett saját (tény 07:10) a 10:00-s bérfuvar elé", ids([ber10, { ...sajatIdoNelkul, tenyIdo: BP("07:10") }]), ["310", "320"]);
eq("T5: két időzített az idő szerint, nem id szerint", ids([{ ...ber10, id: "1", tervIdo: BP("13:00") }, { ...ber10, id: "2", tervIdo: BP("09:00") }]), ["2", "1"]);

// T6: a bérfuvart az iroda zárta le (nincs GPS-, sem sofőr-tény), utána a saját.
const berLezart: SorrendAdat = { ...ber10, id: "330", tervIdo: null, lezart: true };
const sajatUtana: SorrendAdat = { ...sajatIdoNelkul, id: "325" };
eq("T6: tény nélkül lezárt bérfuvar az 1., a saját a 2.", ids([sajatUtana, berLezart]), ["330", "325"]);
eq("T6: akkor is, ha a saját már elkezdődött", ids([{ ...sajatUtana, tenyIdo: BP("11:00") }, berLezart]), ["330", "325"]);
eq("T6: a lezárt a kiírt idejénél marad (09:00 a 11:00-s tény előtt)", ids([{ ...sajatUtana, tenyIdo: BP("11:00") }, { ...berLezart, tervIdo: BP("09:00") }]), ["330", "325"]);
eq("T6: tényes lezárt a tény ideje szerint (14:00 a 11:00 után)", ids([{ ...berLezart, tenyIdo: BP("14:00") }, { ...sajatUtana, tenyIdo: BP("11:00") }]), ["325", "330"]);

// Többnapos: időpont nélkül a felrakás napjának végére; kiírt időponttal az időpontja szerint.
eq("többnapos időpont nélkül: a nap végére, az időpont nélküliek mögé is", ids([losung, { ...palFerr, tervIdo: Date.parse("2026-10-05T12:00:00+02:00") }, fabrika]), ["294", "295", "293"]);
eq("többnapos kiírt időponttal (06:00): a felrakás napján elöl", ids([{ ...losung, tervIdo: Date.parse("2026-10-05T06:00:00+02:00") }, palFerr, fabrika]), ["293", "294", "295"]);
eq("többnapos, már felrakva (tény): a felrakás napján a tény szerint", ids([{ ...losung, tenyIdo: Date.parse("2026-10-05T16:00:00+02:00") }, { ...palFerr, tenyIdo: Date.parse("2026-10-05T07:00:00+02:00") }, fabrika]), ["294", "293", "295"]);
eq("előző napról hozott rakomány a lerakás napján elöl", ids([
  { id: "1", felrakasNap: "2026-10-06", lerakasNap: "2026-10-06", felrako: "Debrecen", lerako: "Ebes" },
  losung,
]), ["293", "1"]);
eq("láncolás az időzítettek után is működik", ids([
  { ...fabrika, id: "1" }, { ...palFerr, id: "2" }, { ...ber10, id: "3", felrakasNap: "2026-10-05", lerakasNap: "2026-10-05", tervIdo: Date.parse("2026-10-05T15:00:00+02:00") },
]), ["3", "2", "1"]);

// Terv-idő: ablak, különben az időpont-mező budapesti faliórával; helykitöltő nincs.
eq("terv-idő: ablak", tervIdoMegbizasbol("2026-10-12", "2026-10-12 06:00:00+00", "13:00"), Date.parse("2026-10-12T06:00:00Z"));
eq("terv-idő: időpont-mező (Budapest, nyári idő)", tervIdoMegbizasbol("2026-10-12", null, "10:00"), Date.parse("2026-10-12T08:00:00Z"));
eq("terv-idő: nincs → null (nincs reggel 7)", tervIdoMegbizasbol("2026-10-12", null, "reggel"), null);

// A GPS lap és a figyelő párosítási sorrendje ugyanaz (parositasiSorrend).
const parSor = (id: string, x: Partial<{ idopont: string | null; felrakas_ablak_tol: string | null; teljesitve: boolean }> = {}) =>
  ({ id, datum: "2026-10-12", lerakas_datum: null, felrako: `F${id}`, lerako: `L${id}`, felrakas_ablak_tol: null, idopont: null, teljesitve: false, ...x });
eq("párosítás: időpontos bérfuvar a korábbi id-jű időpont nélküli saját előtt", parositasiSorrend([parSor("310"), parSor("320", { idopont: "10:00" })]).map((x) => x.id), ["320", "310"]);
eq("párosítás: a bejövő sorrend nem számít", parositasiSorrend([parSor("320", { idopont: "10:00" }), parSor("310")]).map((x) => x.id), ["320", "310"]);

eq("ütközés: Gergő 10.05. (1 bér + 2 saját) nem az", berUtkozes([{ jelleg: "ber" }, { jelleg: "sajat" }, { jelleg: "sajat" }]), false);
eq("ütközés: két bérfuvar egy napon az", berUtkozes([{ jelleg: "ber" }, { jelleg: "ber" }]), true);

console.log(`napi sorrend: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
