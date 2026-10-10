// Költségek és tények (5. fázis) — a tiszta részek tesztje.
//
// Futtatás:  npx tsx scripts/teszt-koltseg.ts
//
// Amit bizonyít: a HU-GO export rugalmas beolvasása (fejlécnevek, magyar
// számalakok "5 002,00", dátumformák, ismétlődés), az Oplusz-értesítő
// kiolvasása, az MNB SOAP-válasz értelmezése (valódi minta, 2026-10-10),
// a km/liter felosztás, az EUR-átváltás, és hogy a saját fuvar „elkerült
// költsége" NEM adódik hozzá a kocsi eredményéhez.

import ExcelJS from "exceljs";
import {
  csvSorok, HUGO_MAX_KIBONTOTT_BYTE, idopontHu, opluszFeladoPontos, parseHuGoTabla, parseOpluszErtesites, szamHu, xlsxKorlatHiba, zipKibontottMeret,
} from "@/lib/fuvarozas2/koltseg-import";
import { tablazatSorai } from "@/lib/fuvarozas2/koltseg-xlsx";
import { arfolyamNapra, elvartArfolyamNap, hianyzoArfolyamNapok, kozzetettNapKell, parseMnbArfolyamok } from "@/lib/fuvarozas/arfolyam-alap";
import {
  eurAtvaltas, fejlecKmSzamitas, jarmuEredmeny, jarmuOsszkoltseg, literFelosztas, megbizasKoltseg, napiFixFelosztas, napiOsszeg, utakAblakban, utdijNapiFelosztas,
  type JarmuKontextus, type MegbizasBemenet, type Parameterek,
} from "@/lib/fuvarozas2/koltseg-szamitas";
import type { SajatJarmu } from "@/lib/fuvarozas/vehicles";

let ok = 0;
let bad = 0;
function all(nev: string, felt: boolean) {
  if (felt) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  all(`${nev} — várt ${JSON.stringify(vart)}, kapott ${JSON.stringify(kapott)}`, JSON.stringify(kapott) === JSON.stringify(vart));
}
const kozel = (a: number | null | undefined, b: number, tures = 0.5) => a != null && Math.abs(a - b) <= tures;

// --- Számok ------------------------------------------------------------------
eq("szamHu 5 002,00", szamHu("5 002,00"), 5002);
eq("szamHu nem törő szóköz + Ft", szamHu("12 345,50 Ft"), 12345.5);
eq("szamHu 5.002,00", szamHu("5.002,00"), 5002);
eq("szamHu 1,234,567", szamHu("1,234,567"), 1234567);
eq("szamHu 12,5", szamHu("12,5"), 12.5);
eq("szamHu 12.5", szamHu("12.5"), 12.5);
eq("szamHu szám", szamHu(4321), 4321);
eq("szamHu szöveg", szamHu("abc"), null);
eq("szamHu üres", szamHu(""), null);

// --- Időpontok ---------------------------------------------------------------
eq("idopont 2026.09.27 17:43:41", idopontHu("2026.09.27 17:43:41"), "2026-09-27 17:43:41");
eq("idopont 2026-09-27T08:05", idopontHu("2026-09-27T08:05"), "2026-09-27 08:05:00");
eq("idopont 27.09.2026 8:05", idopontHu("27.09.2026 8:05"), "2026-09-27 08:05:00");
eq("idopont Date (exceljs, UTC falióra)", idopontHu(new Date(Date.UTC(2026, 8, 27, 17, 43, 41))), "2026-09-27 17:43:41");
eq("idopont Excel sorszám", idopontHu(46292.5), "2026-09-27 12:00:00");
eq("idopont dátum + külön idő-oszlop", idopontHu("2026.09.27.", "06:30"), "2026-09-27 06:30:00");
eq("idopont rossz", idopontHu("holnap"), null);

// --- HU-GO tábla -------------------------------------------------------------
const JARMUVEK: SajatJarmu[] = [
  { kod: "AOPU-427", id: "1", sofor: "Gergő", label: "AOPU-427/AOTY-474", rendszamok: ["AOPU-427", "AOTY-474"], szin: "blue", ecofleetObjectId: "1" },
  { kod: "NMZ-492", id: "2", sofor: "Micó", label: "NMZ-492/XZV-926", rendszamok: ["NMZ-492", "XZV-926"], szin: "yellow", ecofleetObjectId: "2" },
];
const csv = [
  "HU-GO tranzakciók lekérdezése;;;;;",
  "Időszak: 2026.09.01 - 2026.09.30;;;;;",
  "Tranzakció dátuma;Rendszám;Díjkategória;Díjköteles útszakasz;Hossz (km);Nettó díj;Bruttó díj (Ft)",
  '2026.09.27 06:12:10;AOPU427;J4;M3 Nyíregyháza - Görbeháza;24,6;"4 001,57";"5 082,00"',
  '2026.09.27 06:31:44;AOPU-427;J4;M3 Görbeháza - Polgár;12,1;1 968,50;2 500,00',
  '2026.09.27 06:31:44;AOPU-427;J4;M3 Görbeháza - Polgár;12,1;1 968,50;2 500,00',
  '2026.09.28 10:00:00;XYZ-999;J4;M0 ;5,0;800,00;1 016,00',
  ";;;;;;",
  "Összesen;;;;;;8 598,00",
  "rossz sor;AOPU427;J4;M3;1;1;sok",
].join("\r\n");
const hugo = parseHuGoTabla(csvSorok(csv), JARMUVEK);
eq("HU-GO: tranzakciók száma (ismétlődő kiszűrve)", hugo.tranzakciok.length, 3);
eq("HU-GO: ismétlődő", hugo.ismetlodo, 1);
eq("HU-GO: első sor bruttó (\"5 082,00\")", hugo.tranzakciok[0]?.bruttoFt, 5082);
eq("HU-GO: első sor nettó", hugo.tranzakciok[0]?.nettoFt, 4002);
eq("HU-GO: km", hugo.tranzakciok[0]?.tavKm, 24.6);
eq("HU-GO: időpont", hugo.tranzakciok[0]?.idopont, "2026-09-27 06:12:10");
eq("HU-GO: rendszám → jármű (kötőjel nélkül)", hugo.tranzakciok[0]?.jarmuKod, "AOPU-427");
eq("HU-GO: idegen rendszám → nincs jármű", hugo.tranzakciok[2]?.jarmuId, null);
eq("HU-GO: szakasz", hugo.tranzakciok[1]?.szakasz, "M3 Görbeháza - Polgár");
all("HU-GO: a hibás sor jelezve", hugo.hibak.some((h) => /10\. sor/.test(h)));
all("HU-GO: az összesítő sor nem hiba", !hugo.hibak.some((h) => /9\. sor/.test(h)));
const ujra = parseHuGoTabla(csvSorok(csv), JARMUVEK);
eq("HU-GO: újrabeolvasva ugyanaz a kulcs (idempotens)", ujra.tranzakciok.map((t) => t.kulsoAzonosito), hugo.tranzakciok.map((t) => t.kulsoAzonosito));
// XLSX-ből (exceljs): Date és szám cellák, más fejlécnevek, más oszlopsorrend.
const xlsxSorok = [
  ["Bruttó összeg", "Jármű rendszáma", "Időpont", "Távolság"],
  [5002, "NMZ492", new Date(Date.UTC(2026, 8, 29, 14, 0, 0)), 30.2],
];
const x = parseHuGoTabla(xlsxSorok, JARMUVEK);
eq("HU-GO xlsx: beolvasva", x.tranzakciok.length, 1);
eq("HU-GO xlsx: jármű", x.tranzakciok[0]?.jarmuKod, "NMZ-492");
eq("HU-GO xlsx: időpont", x.tranzakciok[0]?.idopont, "2026-09-29 14:00:00");
const nincsFej = parseHuGoTabla([["a", "b"], ["1", "2"]], JARMUVEK);
all("HU-GO: fejléc nélkül érthető hiba", nincsFej.tranzakciok.length === 0 && /fejlécsor/.test(nincsFej.hibak[0] ?? ""));
eq("CSV: vesszős elválasztó idézőjellel", csvSorok('a,b,c\n"1,5",2,3'), [["a", "b", "c"], ["1,5", "2", "3"]]);

// HU-GO ismétlődés: tranzakció-azonosítóval CSAK az azonosító a kulcs — ugyanaz a
// tranzakció két különböző formátumú exportból (más dátum- és összegalak) egyszer számít.
const exportA = parseHuGoTabla(csvSorok([
  "Tranzakció azonosító;Dátum;Rendszám;Bruttó összeg;Útszakasz",
  "HG-000123;2026.09.27 06:12:10;AOPU427;5 082,00;M3 Nyíregyháza - Görbeháza",
  "HG-000124;2026.09.27 06:31:44;AOPU427;2 500,00;M3 Görbeháza - Polgár",
].join("\n")), JARMUVEK);
const exportB = parseHuGoTabla([
  ["Transaction ID", "Időpont", "Jármű rendszáma", "Bruttó díj (Ft)", "Szakasz"],
  ["hg-000123", new Date(Date.UTC(2026, 8, 27, 6, 12, 0)), "AOPU-427", 5082.4, "M3 Nyíregyháza–Görbeháza"],
], JARMUVEK);
eq("HU-GO kulcs: azonosítóval csak az azonosító", exportA.tranzakciok[0]?.kulsoAzonosito, "hugo:id:HG-000123");
eq("HU-GO kulcs: két formátum, ugyanaz a tranzakció → ugyanaz a kulcs", exportB.tranzakciok[0]?.kulsoAzonosito, exportA.tranzakciok[0]?.kulsoAzonosito);
const egyutt = new Set([...exportA.tranzakciok, ...exportB.tranzakciok].map((t) => t.kulsoAzonosito));
eq("HU-GO kulcs: a két export együtt 2 tranzakció (nem 3)", egyutt.size, 2);
eq("HU-GO kulcs: azonosító nélkül az összetett kulcs marad", hugo.tranzakciok[0]?.kulsoAzonosito.startsWith("hugo:id:"), false);
all("HU-GO kulcs: a régi (összetett) kulcs is megvan a már importált sorok felismeréséhez", (exportA.tranzakciok[0]?.regiKulcs ?? "").includes("HG-000123|2026-09-27 06:12:10"));
const sorszamos = parseHuGoTabla(csvSorok("Sorszám;Dátum;Rendszám;Bruttó összeg\n1;2026.09.27 06:12:10;AOPU427;5 082,00"), JARMUVEK);
eq("HU-GO kulcs: a „Sorszám” nem azonosító (összetett kulcs)", sorszamos.tranzakciok[0]?.kulsoAzonosito.startsWith("hugo:id:"), false);

// --- Oplusz ------------------------------------------------------------------
const snippet = "Partner: Well-worn Pallet Kft. (4234 Szakoly) Vásárlás időpontja: 2026.09.27 17:43:41 Vásárlás tranzakciószáma: 1/R/00478709 Vásárlás összege: 5 002,00 Ft Rendszám: AOPU427 Vásárlás részletei";
const o = parseOpluszErtesites(`Értesítés bizonylat készítésről\n${snippet}`);
eq("Oplusz: időpont", o?.idopont, "2026-09-27 17:43:41");
eq("Oplusz: tranzakciószám", o?.tranzakcioSzam, "1/R/00478709");
eq("Oplusz: összeg", o?.osszegFt, 5002);
eq("Oplusz: rendszám", o?.rendszam, "AOPU427");
eq("Oplusz: liter nincs", o?.liter, null);
const ol = parseOpluszErtesites(snippet.replace("5 002,00 Ft", "87 244,31 Ft").replace("Vásárlás részletei", "Termék: Gázolaj Mennyiség: 142,35 l Egységár: 612,90 Ft/l"));
eq("Oplusz: liter, ha van", ol?.liter, 142.35);
eq("Oplusz: hihető Ft/l → nincs figyelmeztetés", ol?.figyelmeztetes, null);
// Valószínűtlen egységár (5 002 Ft / 142,35 l = 35 Ft/l): az összeg marad, a liter nem — jelölve.
const olGyanus = parseOpluszErtesites(snippet.replace("Vásárlás részletei", "Mennyiség: 142,35 l"));
eq("Oplusz: 35 Ft/l → liter nincs, összeg marad", [olGyanus?.liter, olGyanus?.osszegFt], [null, 5002]);
all("Oplusz: 35 Ft/l → figyelmeztetés", /Ft\/l/.test(olGyanus?.figyelmeztetes ?? ""));
const olDraga = parseOpluszErtesites(snippet.replace("5 002,00 Ft", "250 000,00 Ft").replace("Vásárlás részletei", "Mennyiség: 100 l"));
eq("Oplusz: 2500 Ft/l → liter nincs", olDraga?.liter, null);
// A szigorúbb liter-minta: a puszta „… l” egy termék nevében nem liter.
const olTermek = parseOpluszErtesites(snippet.replace("Vásárlás részletei", "Termék: AdBlue 5 l kiszerelés"));
eq("Oplusz: „AdBlue 5 l” nem liter", olTermek?.liter, null);
const olLiterSzo = parseOpluszErtesites(snippet.replace("5 002,00 Ft", "61 290,00 Ft").replace("Vásárlás részletei", "Tankolva 100,0 liter gázolaj"));
eq("Oplusz: „100,0 liter” elfogadva", olLiterSzo?.liter, 100);
eq("Oplusz: a pontos feladó ír", opluszFeladoPontos("Oplusz <opluszbenzinkut@gmail.com>"), true);
eq("Oplusz: hasonmás feladó nem ír", opluszFeladoPontos("opluszbenzinkut@gmail.com.example.org"), false);
eq("Oplusz: számla-értesítő nem tankolás", parseOpluszErtesites("Értesítés számlakészítésről: K/G/00040623"), null);

// --- MNB ---------------------------------------------------------------------
// Valódi válasz (GetExchangeRates, 2026-10-01..09, EUR), rövidítve.
const mnbXml = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetExchangeRatesResponse xmlns="http://www.mnb.hu/webservices/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><GetExchangeRatesResult>&lt;MNBExchangeRates&gt;&lt;Day date="2026-10-09"&gt;&lt;Rate unit="1" curr="EUR"&gt;364,82&lt;/Rate&gt;&lt;/Day&gt;&lt;Day date="2026-10-08"&gt;&lt;Rate unit="1" curr="EUR"&gt;366,45&lt;/Rate&gt;&lt;/Day&gt;&lt;Day date="2026-10-07"&gt;&lt;Rate unit="1" curr="EUR"&gt;366,76000&lt;/Rate&gt;&lt;/Day&gt;&lt;Day date="2026-10-02"&gt;&lt;Rate unit="1" curr="EUR"&gt;367,87000&lt;/Rate&gt;&lt;/Day&gt;&lt;Day date="2026-10-01"&gt;&lt;Rate unit="100" curr="JPY"&gt;245,10&lt;/Rate&gt;&lt;/Day&gt;&lt;/MNBExchangeRates&gt;</GetExchangeRatesResult></GetExchangeRatesResponse></s:Body></s:Envelope>`;
const mnb = parseMnbArfolyamok(mnbXml);
eq("MNB: sorok", mnb.length, 5);
eq("MNB: 10-09 EUR", mnb.find((r) => r.nap === "2026-10-09")?.ft, 364.82);
eq("MNB: 5 tizedes", mnb.find((r) => r.nap === "2026-10-07")?.ft, 366.76);
eq("MNB: egység (100 JPY)", mnb.find((r) => r.penznem === "JPY")?.ft, 2.451);
const eur = mnb.filter((r) => r.penznem === "EUR");
// Hétvégére a pénteki — de NEM „pontos” (az csak az aznapi), hanem jogos előző közzétett nap.
eq("MNB: hétvégére a pénteki (előző közzétett nap)", arfolyamNapra(eur, "2026-10-04"), { ft: 367.87, nap: "2026-10-02", pontos: false, tipus: "elozo" });
eq("MNB: aznapi = pontos", arfolyamNapra(eur, "2026-10-08")?.tipus, "aznapi");
// A régi hiba: hétfőre (10-05) a 4 nappal korábbi csütörtöki/pénteki sor „pontos” volt.
eq("MNB: hiányzó hétfő → régi, nem pontos", arfolyamNapra(eur, "2026-10-05", "2026-10-10", 15), { ft: 367.87, nap: "2026-10-02", pontos: false, tipus: "regi" });
eq("MNB: ha a mai már megvan, az aznapi", arfolyamNapra(eur, "2026-10-09", "2026-10-09", 9)?.tipus, "aznapi");
eq("MNB: ma (péntek) dél előtt, csütörtöki sorral → előző", arfolyamNapra(eur.filter((r) => r.nap !== "2026-10-09"), "2026-10-09", "2026-10-09", 9)?.tipus, "elozo");
eq("MNB: ma (péntek) dél után, csütörtöki sorral → régi", arfolyamNapra(eur.filter((r) => r.nap !== "2026-10-09"), "2026-10-09", "2026-10-09", 13)?.tipus, "regi");
// Hiányzó napok (ezért kérdezzük újra az MNB-t).
eq("MNB közzététel: szombat nem kell", kozzetettNapKell("2026-10-10", "2026-10-12", 9), false);
eq("MNB közzététel: múlt hétköznap kell", kozzetettNapKell("2026-10-08", "2026-10-12", 9), true);
eq("MNB közzététel: ma 11-kor még nem", kozzetettNapKell("2026-10-12", "2026-10-12", 11), false);
eq("MNB közzététel: ma 12-kor már igen", kozzetettNapKell("2026-10-12", "2026-10-12", 12), true);
eq("MNB várt nap: vasárnap → péntek", elvartArfolyamNap("2026-10-04", "2026-10-10", 9), "2026-10-02");
eq("MNB hiányzó: hétfő-kedd nincs tárolva → hiányzik (a régi 4 napos szabály meglévőnek vette)",
  hianyzoArfolyamNapok(eur, ["2026-10-05", "2026-10-06", "2026-10-08"], "2026-10-10", 9), ["2026-10-05", "2026-10-06"]);
eq("MNB hiányzó: hétvége a pénteki sorral nem hiányzik", hianyzoArfolyamNapok(eur, ["2026-10-03", "2026-10-04"], "2026-10-10", 9), []);
// Hétfő dél előtt: a pénteki (10-09) a várt nap — tárolva van, nem hiányzik.
eq("MNB hiányzó: ma dél előtt nem hiányzik", hianyzoArfolyamNapok(eur, ["2026-10-12"], "2026-10-12", 9), []);
eq("MNB hiányzó: ma dél után hiányzik", hianyzoArfolyamNapok(eur, ["2026-10-12"], "2026-10-12", 13), ["2026-10-12"]);
eq("MNB: aznapi", arfolyamNapra(eur, "2026-10-08")?.ft, 366.45);
eq("MNB: korábbi nincs → tartalék", arfolyamNapra(eur, "2026-09-30")?.pontos, false);
eq("MNB: üres", arfolyamNapra([], "2026-10-08"), null);

// --- EUR-átváltás --------------------------------------------------------------
const at = eurAtvaltas(1200, { ft: 364.82, nap: "2026-10-09" });
eq("EUR: 1200 × 364,82", at?.ft, 437784);
all("EUR: a címke tartalmazza az árfolyamot és a napot", /364,82/.test(at?.cimke ?? "") && /2026-10-09/.test(at?.cimke ?? ""));
all("EUR: előző közzétett nap a címkében", /előző közzétett nap/.test(eurAtvaltas(1, { ft: 364.82, nap: "2026-10-09", pontos: false, tipus: "elozo" })?.cimke ?? ""));
all("EUR: régi árfolyam a címkében", /régebbi/.test(eurAtvaltas(1, { ft: 364.82, nap: "2026-10-05", pontos: false, tipus: "regi" })?.cimke ?? ""));
eq("EUR: árfolyam nélkül null", eurAtvaltas(1200, null), null);

// --- km / liter felosztás ------------------------------------------------------
const utak = [
  { indulas: "2026-09-27 06:00:00", erkezes: "2026-09-27 08:00:00", km: 100, liter: 30 },
  { indulas: "2026-09-27 10:00:00", erkezes: "2026-09-27 12:00:00", km: 200, liter: 60 },
  { indulas: "2026-09-27 14:00:00", erkezes: "2026-09-27 16:00:00", km: 100, liter: 30 },
];
// A megbízás 07:00 és 12:00 között: az első út fele (50 km) + a második egésze (200 km).
const ablak = utakAblakban(utak, "2026-09-27 07:00:00", "2026-09-27 12:00:00");
eq("km: időablak, részleges út arányosan", Math.round(ablak.get("2026-09-27")?.km ?? 0), 250);
const lf = literFelosztas(ablak, napiOsszeg(utak));
// Napi 400 km, 120 l → a 250 km-re 75 l.
all(`liter: a napi liter km-arányos része (várt 75, kapott ${lf.liter})`, kozel(lf.liter, 75, 0.01));
eq("liter: mérő nélküli nap jelölve", literFelosztas(ablak, napiOsszeg(utak.map((u) => ({ ...u, liter: 0 })))).meroNelkul, true);

// --- napi fix ------------------------------------------------------------------
const nf = napiFixFelosztas([
  { id: "a", napok: ["2026-09-27"], tenyTol: null, tenyIg: null },
  { id: "b", napok: ["2026-09-27", "2026-09-28"], tenyTol: null, tenyIg: null },
], 50_000);
eq("napi fix: közös napon fele-fele, egyedül teljes", [nf.get("a"), nf.get("b")], [25_000, 75_000]);
const nfo = napiFixFelosztas([
  { id: "a", napok: ["2026-09-27"], tenyTol: "2026-09-27 06:00:00", tenyIg: "2026-09-27 09:00:00" },
  { id: "b", napok: ["2026-09-27"], tenyTol: "2026-09-27 10:00:00", tenyIg: "2026-09-27 19:00:00" },
], 50_000);
eq("napi fix: tény-órák arányában (3 h : 9 h)", [nfo.get("a"), nfo.get("b")], [12_500, 37_500]);

// --- Megbízás és kocsi eredmény --------------------------------------------------
const p: Parameterek = { napiKoltsegFt: 50_000, fogyasztasL100: 28, sajatKmDijFt: 550, gazolajAr: 600, gazolajCimke: "teszt", atlagUtdijFtKm: null };
const k: JarmuKontextus = {
  vanGps: true,
  utak,
  tankolasok: [{ idopont: "2026-09-27 05:30:00", liter: 100, osszegFt: 58_000 }],
  utdijak: [{ idopont: "2026-09-27 07:30:00", bruttoFt: 5082 }, { idopont: "2026-09-27 15:00:00", bruttoFt: 2500 }],
};
const ber: MegbizasBemenet = {
  id: "1", jelleg: "ber", nap: "2026-09-27", felrakasNap: "2026-09-27", fuvardij: 400, penznem: "EUR",
  rakottKmBecsles: 240, uresKmBecsles: 30, tenyTol: "2026-09-27 07:00:00", tenyIg: "2026-09-27 12:00:00", utdijBecslesFt: 9000, raklapDb: null,
};
const sajat: MegbizasBemenet = {
  id: "2", jelleg: "sajat", nap: "2026-09-27", felrakasNap: "2026-09-27", fuvardij: null, penznem: "Ft",
  rakottKmBecsles: 100, uresKmBecsles: 10, tenyTol: null, tenyIg: null, utdijBecslesFt: null, raklapDb: 26,
};
const eb = megbizasKoltseg(ber, k, p, 25_000, { ft: 364.82, nap: "2026-09-25" });
eq("bér: km tény", eb.km, { ertek: 250, forras: "teny" });
eq("bér: üzemanyag tény, aznapi tankolás 580 Ft/l-rel (75 l)", [eb.uzemanyag?.forras, eb.uzemanyag?.ft], ["teny", 43_500]);
eq("bér: útdíj tény (csak az ablakba eső tranzakció)", [eb.utdij?.forras, eb.utdij?.ft], ["teny", 5082]);
eq("bér: bevétel EUR → Ft", eb.bevetelFt, Math.round(400 * 364.82));
eq("bér: eredmény = bevétel − költség", eb.eredmenyFt, Math.round(400 * 364.82) - (43_500 + 5082 + 25_000));
eq("bér: belső költség nincs", eb.belsoKoltsegFt, null);
const es = megbizasKoltseg(sajat, k, p, 25_000);
eq("saját: km becslés", es.km, { ertek: 100, forras: "becsles" });
eq("saját: üzemanyag becslés 100 km × 28 l/100 × aznapi 580 Ft/l", [es.uzemanyag?.forras, es.uzemanyag?.ft], ["becsles", 16_240]);
eq("saját: útdíj nincs (nincs kalkuláció, nincs átlag)", es.utdij, null);
eq("saját: belső költség", es.belsoKoltsegFt, 16_240 + 25_000);
eq("saját: Ft/raklap", es.ftPerRaklap, Math.round((16_240 + 25_000) / 26));
eq("saját: elkerült (tájékoztató) = 100 × 550", es.elkerultKoltsegFt, 55_000);
eq("saját: eredmény nincs", es.eredmenyFt, null);
const eurNelkul = megbizasKoltseg(ber, k, p, 25_000, null);
eq("bér EUR árfolyam nélkül: bevétel és eredmény null", [eurNelkul.bevetelFt, eurNelkul.eredmenyFt], [null, null]);
const gpsNelkul = megbizasKoltseg(ber, { ...k, vanGps: false, utdijak: [] }, p, 25_000, { ft: 364.82, nap: "2026-09-25" });
const navAron = megbizasKoltseg({ ...sajat, nap: "2026-09-28" }, k, p, 0);
eq("becslés tankolás nélküli napon: NAV − kedvezmény (600)", navAron.uzemanyag?.ft, 16_800);
eq("GPS nélkül: km becslés, útdíj a tárolt kalkulációból", [gpsNelkul.km.forras, gpsNelkul.utdij?.forras, gpsNelkul.utdij?.ft], ["becsles", "becsles", 9000]);

const ossz = jarmuOsszkoltseg(k, [eb, es], p, 1);
eq("kocsi: üzemanyag tény (120 l × 580)", [ossz.uzemanyag?.forras, ossz.uzemanyag?.ft], ["teny", 69_600]);
eq("kocsi: útdíj tény (minden tranzakció)", ossz.utdij?.ft, 7582);
const je = jarmuEredmeny([eb, es], ossz);
eq("kocsi: bér eredmény", je.berEredmenyFt, eb.eredmenyFt);
eq("kocsi: saját belső költség külön", je.sajatBelsoKoltsegFt, es.belsoKoltsegFt);
eq("kocsi: nem hozzárendelt = összes − megbízásokra osztott", je.nemHozzarendeltFt, je.osszKoltsegFt - eb.koltsegFt - es.koltsegFt);
eq("kocsi: eredmény = bér eredmény − nem hozzárendelt", je.eredmenyFt, je.berEredmenyFt - je.nemHozzarendeltFt);
// A régi hiba: a saját fuvar „megtakarítása" hozzáadódott a kocsi eredményéhez.
all("kocsi: az elkerült költség NEM része az eredménynek", je.eredmenyFt !== je.berEredmenyFt - je.nemHozzarendeltFt + je.elkerultKoltsegFt && je.elkerultKoltsegFt === 55_000);
// Egyeztetés: bevétel − összes költség = kocsi eredmény − saját belső költség.
eq("kocsi: bevétel − összes költség = eredmény − saját belső költség", je.berBevetelFt - je.osszKoltsegFt, je.eredmenyFt - je.sajatBelsoKoltsegFt);
// A saját fuvar km-díja (az „elkerült költség" alapja) semmilyen eredményt nem mozdít.
const dragabb = { ...p, sajatKmDijFt: 5500 };
const es3 = megbizasKoltseg(sajat, k, dragabb, 25_000);
const je3 = jarmuEredmeny([eb, es3], jarmuOsszkoltseg(k, [eb, es3], dragabb, 1));
eq("kocsi: a km-díj tízszerese sem változtat az eredményen", je3.eredmenyFt, je.eredmenyFt);
eq("kocsi: … csak a tájékoztató elkerült költségen", je3.elkerultKoltsegFt, 550_000);

// --- Útdíj tény-ablak nélkül: a nap tranzakciói, ha az import lefedi ----------------
const ud = [
  { idopont: "2026-09-27 07:30:00", bruttoFt: 5082 }, // az "a" tény-ablakában
  { idopont: "2026-09-27 15:00:00", bruttoFt: 2500 },
  { idopont: "2026-09-27 16:00:00", bruttoFt: 1500 },
  { idopont: "2026-09-29 09:00:00", bruttoFt: 999 },
];
const unf = utdijNapiFelosztas([
  { id: "a", napok: ["2026-09-27"], tenyTol: "2026-09-27 07:00:00", tenyIg: "2026-09-27 12:00:00" },
  { id: "b", napok: ["2026-09-27"], tenyTol: null, tenyIg: null },
  { id: "c", napok: ["2026-09-27", "2026-09-28"], tenyTol: null, tenyIg: null },
  { id: "d", napok: ["2026-10-02"], tenyTol: null, tenyIg: null },
], ud);
eq("útdíj napból: az ablakon kívüli 4000 Ft fele-fele", [unf.get("b")?.ft, unf.get("c")?.ft], [2000, 2000]);
eq("útdíj napból: a tény-ablakos nem kap", unf.has("a"), false);
eq("útdíj napból: az import által nem fedett nap nem kap", unf.has("d"), false);
const lefedett = megbizasKoltseg({ ...ber, tenyTol: "2026-09-27 13:00:00", tenyIg: "2026-09-27 14:00:00" }, { ...k, utdijak: ud }, p, 0, null);
eq("útdíj: lefedett ablak tranzakció nélkül = 0 (tény)", [lefedett.utdij?.ft, lefedett.utdij?.forras], [0, "teny"]);
const napbol = megbizasKoltseg({ ...sajat, utdijNapbol: { ft: 2000, db: 2 } }, k, p, 0);
const kalkbol = megbizasKoltseg({ ...ber, id: "9", tenyTol: null, tenyIg: null }, { ...k, utdijak: [] }, p, 0, null);
const uo = jarmuOsszkoltseg({ ...k, utdijak: ud }, [eb, napbol, kalkbol], p, 1);
eq("kocsi útdíj: HU-GO összes + a nem fedett fuvar becslése", [uo.utdij?.ft, uo.utdij?.forras], [5082 + 2500 + 1500 + 999 + 9000, "becsles"]);

// --- Útdíj felosztva: tény (nem becslés), a kocsi összesítőjével egyezően --------
eq("útdíj napból: tény, felosztva", [napbol.utdij?.forras, napbol.utdij?.felosztva, napbol.utdij?.ft], ["teny", true, 2000]);
// Két tény-ablak nélküli fuvar egy napon, a nap minden tranzakciója nekik jut → az ő útdíjuk összege = a kocsié, mindkettő tény.
const ketNap = [{ idopont: "2026-10-09 08:00:00", bruttoFt: 10_285 }, { idopont: "2026-10-09 15:00:00", bruttoFt: 10_285 }];
const felos = utdijNapiFelosztas([
  { id: "x", napok: ["2026-10-09"], tenyTol: null, tenyIg: null },
  { id: "y", napok: ["2026-10-09"], tenyTol: null, tenyIg: null },
], ketNap);
const kx = megbizasKoltseg({ ...sajat, id: "x", nap: "2026-10-09", felrakasNap: "2026-10-09", utdijNapbol: felos.get("x") }, { ...k, vanGps: false, utak: [], utdijak: ketNap }, p, 0);
const ky = megbizasKoltseg({ ...sajat, id: "y", nap: "2026-10-09", felrakasNap: "2026-10-09", utdijNapbol: felos.get("y") }, { ...k, vanGps: false, utak: [], utdijak: ketNap }, p, 0);
const kxy = jarmuOsszkoltseg({ ...k, vanGps: false, utak: [], utdijak: ketNap }, [kx, ky], p, 1);
eq("útdíj: 10 285 + 10 285 a fuvaroknak, 20 570 a kocsinak — mind tény",
  [kx.utdij?.ft, kx.utdij?.forras, ky.utdij?.forras, kxy.utdij?.ft, kxy.utdij?.forras], [10_285, "teny", "teny", 20_570, "teny"]);

// --- Kézi költségsorok (fuvar_megbizas_koltseg, nem gépi) ----------------------------
// Útdíj 22 000 (tény) felülírja a számított útdíjat; a várakozási pótdíj 15 000 hozzáadódik.
const kezi = megbizasKoltseg({
  ...ber, kezi: [
    { tipus: "utdij", ft: 22_000, megjegyzes: "számla szerint", forras: "teny" },
    { tipus: "varakozasi_potdij", ft: 15_000, megjegyzes: null, forras: "teny" },
  ],
}, k, p, 25_000, { ft: 364.82, nap: "2026-09-25" });
eq("kézi: útdíj felülírja a számítottat (nem adódik hozzá)", [kezi.utdij?.ft, kezi.utdij?.forras, kezi.utdij?.kezi], [22_000, "teny", true]);
eq("kézi: várakozási pótdíj külön tétel", [kezi.keziEgyeb?.ft, kezi.keziEgyeb?.forras], [15_000, "teny"]);
eq("kézi: költség = üzemanyag + kézi útdíj + napi fix + pótdíj", kezi.koltsegFt, 43_500 + 22_000 + 25_000 + 15_000);
eq("kézi: eredmény ennyivel kevesebb", kezi.eredmenyFt, Math.round(400 * 364.82) - kezi.koltsegFt);
const keziBecsles = megbizasKoltseg({ ...ber, kezi: [{ tipus: "utdij", ft: 1, megjegyzes: null, forras: "becsles" }] }, k, p, 25_000, null);
eq("kézi becslés nem írja felül a HU-GO tényt", keziBecsles.utdij?.ft, 5082);
const keziBevetel = megbizasKoltseg({ ...ber, penznem: "Ft", fuvardij: 300_000, kezi: [{ tipus: "bevetel_potdij", ft: 20_000, megjegyzes: null, forras: "teny" }] }, k, p, 25_000, null);
eq("kézi bevétel-pótdíj a bevételhez, nem a költséghez", [keziBevetel.bevetelFt, keziBevetel.keziEgyeb], [320_000, null]);
// A kocsi összesítője: a pótdíj benne van az összes költségben, így nem tűnik el a „nem hozzárendelt”-ben.
const keziOssz = jarmuOsszkoltseg(k, [kezi, es], p, 1);
const keziJe = jarmuEredmeny([kezi, es], keziOssz);
eq("kézi: a kocsi összes költségében a pótdíj", keziOssz.keziEgyeb?.ft, 15_000);
// A kézi útdíj a HU-GO-ból számolt 5082-t írta felül: a kocsin 7582 − 5082 + 22 000, tény.
eq("kézi: a kocsi útdíja a felülírt HU-GO-rész helyett a kézi összeggel", [keziOssz.utdij?.ft, keziOssz.utdij?.forras], [7582 - 5082 + 22_000, "teny"]);
eq("kézi: a nem hozzárendelt útdíj nem torzul (= a megbízáson kívüli 2500)", (keziOssz.utdij?.ft ?? 0) - (kezi.utdij?.ft ?? 0) - (es.utdij?.ft ?? 0), 2500);
eq("kézi: a kocsi egyeztetése (bevétel − összes = eredmény − saját belső)", keziJe.berBevetelFt - keziJe.osszKoltsegFt, keziJe.eredmenyFt - keziJe.sajatBelsoKoltsegFt);
// HU-GO import nélkül a kézi útdíj a kocsi útdíjában is tény.
const keziNelkul = megbizasKoltseg({ ...ber, tenyTol: null, tenyIg: null, kezi: [{ tipus: "utdij", ft: 22_000, megjegyzes: null, forras: "teny" }] }, { ...k, utdijak: [] }, p, 0, null);
const keziNelkulOssz = jarmuOsszkoltseg({ ...k, utdijak: [] }, [keziNelkul], p, 1);
eq("kézi útdíj import nélkül: kocsi útdíj tény 22 000", [keziNelkulOssz.utdij?.ft, keziNelkulOssz.utdij?.forras], [22_000, "teny"]);

// --- Fejléc km: GPS nélkül a becslés, becslésnek jelölve ------------------------------
eq("fejléc km: nincs GPS → rakott + üres becslés", fejlecKmSzamitas([{ vanGps: false, km: 0, berKm: 600, sajatKm: 49, uresKm: 541 }]),
  { ertek: 1190, forras: "becsles", tenyKm: 0, becsultKm: 1190, becsultKocsi: 1 });
eq("fejléc km: GPS-szel tény", fejlecKmSzamitas([{ vanGps: true, km: 812, berKm: 600, sajatKm: 0, uresKm: 100 }]).forras, "teny");
eq("fejléc km: vegyes flotta → összeg, becslés", fejlecKmSzamitas([
  { vanGps: true, km: 800, berKm: 1, sajatKm: 0, uresKm: 0 }, { vanGps: false, km: 0, berKm: 300, sajatKm: 0, uresKm: 50 },
]), { ertek: 1150, forras: "becsles", tenyKm: 800, becsultKm: 350, becsultKocsi: 1 });
eq("fejléc km: GPS-es kocsi 0 km-rel, de fuvarlánccal → becslés", fejlecKmSzamitas([{ vanGps: true, km: 0, berKm: 200, sajatKm: 0, uresKm: 0 }]).forras, "becsles");

// --- XLSX-feltöltés korlátai (zip-bomba, sorszám) -------------------------------------
async function xlsxTesztek() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("HU-GO");
  ws.addRow(["Tranzakció azonosító", "Dátum", "Rendszám", "Bruttó összeg"]);
  for (let i = 0; i < 40; i++) ws.addRow([`HG-${i}`, new Date(Date.UTC(2026, 9, 1, 8, i)), "AOPU427", 1000 + i]);
  const kicsi = Buffer.from(await wb.xlsx.writeBuffer());
  const z = zipKibontottMeret(kicsi);
  all("zip: a központi könyvtár olvasható", !!z && z.bejegyzes > 3 && z.kibontott > kicsi.length && !z.zip64);
  eq("zip: kis xlsx átmegy", xlsxKorlatHiba(kicsi), null);
  const sorok = await tablazatSorai("hugo.xlsx", kicsi);
  eq("xlsx stream: fejléc + 40 sor", sorok.length, 41);
  const px = parseHuGoTabla(sorok, JARMUVEK);
  eq("xlsx stream: tranzakciók (azonosító-kulccsal)", [px.tranzakciok.length, px.tranzakciok[0]?.kulsoAzonosito, px.tranzakciok[0]?.idopont], [40, "hugo:id:HG-0", "2026-10-01 08:00:00"]);
  let hiba = "";
  try { await tablazatSorai("hugo.xlsx", kicsi, 20); } catch (e) { hiba = e instanceof Error ? e.message : String(e); }
  all(`xlsx stream: a sorkorlát tisztán megáll (${hiba})`, /túl hosszú/.test(hiba));
  hiba = "";
  try { await tablazatSorai("hugo.csv", Buffer.from("a;b\n".repeat(30)), 20); } catch (e) { hiba = e instanceof Error ? e.message : String(e); }
  all("csv: a sorkorlát tisztán megáll", /túl hosszú/.test(hiba));
  // Zip-bomba: egy kicsi, jól tömöríthető munkalap, amely kibontva a korlát fölött van.
  const bomba = new ExcelJS.Workbook();
  const bws = bomba.addWorksheet("x");
  const sor = "A".repeat(32_000);
  // Minden sor más szöveg (az exceljs a közös szövegeket egyszer tárolja).
  for (let i = 0; i < Math.ceil(HUGO_MAX_KIBONTOTT_BYTE / 32_000) + 50; i++) bws.addRow([`${i}${sor}`]);
  const bombaBuf = Buffer.from(await bomba.xlsx.writeBuffer());
  const bz = zipKibontottMeret(bombaBuf);
  all(`zip-bomba: tömörítve kicsi (${Math.round(bombaBuf.length / 1024)} KB), kibontva nagy (${Math.round((bz?.kibontott ?? 0) / 1024 / 1024)} MB)`,
    bombaBuf.length < 7 * 1024 * 1024 && (bz?.kibontott ?? 0) > HUGO_MAX_KIBONTOTT_BYTE);
  all("zip-bomba: elutasítva kibontás előtt", /kibontva túl nagy/.test(xlsxKorlatHiba(bombaBuf) ?? ""));
  hiba = "";
  try { await tablazatSorai("bomba.xlsx", bombaBuf); } catch (e) { hiba = e instanceof Error ? e.message : String(e); }
  all("zip-bomba: a beolvasó is elutasítja", /kibontva túl nagy/.test(hiba));
  all("zip: nem zip → hiba", /nem érvényes/.test(xlsxKorlatHiba(Buffer.from("PK\u0003\u0004 nem zip")) ?? ""));
}

xlsxTesztek().then(() => {
  console.log(`\nKöltség-teszt: ${ok} rendben, ${bad} hiba`);
  if (bad > 0) process.exit(1);
}, (err) => {
  console.error(err);
  process.exit(1);
});
