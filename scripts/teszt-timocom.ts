// Timocom ajánlat-feldolgozó (fuvarszervező pult, böngésző-gomb) — teszt.
//
// Futtatás:  npx tsx scripts/teszt-timocom.ts
//
// A minták a my.timocom.com fuvarkereső részletpaneljéből valók (2026-10-11,
// magyar felület), a kapcsolattartó neve és telefonszáma kicserélve.

import {
  dekodolHash, kalkulatorMegallo, konyvjelzoKod, parseHelySzoveg, parseTimocomAjanlat, timocomKulcs,
} from "@/lib/fuvarozas2/timocom-ajanlat";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  const a = JSON.stringify(kapott);
  const b = JSON.stringify(vart);
  if (a === b) ok++;
  else { bad++; console.log(`  HIBA  ${nev} — várt ${b}, kapott ${a}`); }
}
function all(nev: string, feltetel: boolean) {
  if (feltetel) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}

// 1. Egyszerű ajánlat, beillesztett szövegként (fel/le jelölés nélkül).
const gaszler = [
  "Létrehozva 2026. 10. 09., 08:00:51", "Ajánlat mentése", "Gászler Kft", "HU, 2233 Ecser", "Nincs értékelés", "TC ID: 98943",
  "Fel- és lerakóhelyek", "215 km", "Útvonal számítás",
  "HU", ", 4200 Hajdúszoboszló", "10. 09. - 10. 12.", " ", "08:00 - 16:00", " ",
  "HU", ", 2120 Dunakeszi", "10. 09. - 10. 12.", " ", "08:00 - 16:00", " ",
  "Kapcsolatfelvétel részletei", "Minta Péter", "Beszélt nyelvek: angol, magyar", "+36301234567", "#",
  "Fuvarleírás", " 13.6 m", " 24 t", "Áru jellege", "Pallets Construction materials", "Kiegészítő információk", "-",
  "Nincs rakománytároló eszköz csere", "A járművel szembeni követelmények", "Jármű típusa", "Nyerges szerelvény",
  "Felépítménytípusok", "Ponyvás", "Tulajdonságok és tanúsítványok", "-", "Fuvardíj", "Ár", "-",
  "Fizetési határidő", "30 Nap", "Külső megjegyzések", "-",
].join("\n");
const g = parseTimocomAjanlat({ szoveg: gaszler, url: "https://my.timocom.com/app/tccargo/freights/search/view/bTK371e8SA2IgIF-XxPmkg" });
eq("megbízó, cím, TC ID", [g.megbizo, g.megbizoCim, g.tcId], ["Gászler Kft", "HU, 2233 Ecser", "98943"]);
eq("létrehozva", g.letrehozva, "2026-10-09 08:00:51");
eq("táv", g.tavKm, 215);
eq("ajánlat-azonosító az URL-ből", g.ajanlatId, "bTK371e8SA2IgIF-XxPmkg");
eq("helyek", g.helyek, [
  { tipus: "fel", orszag: "HU", irsz: "4200", varos: "Hajdúszoboszló", datumTol: "2026-10-09", datumIg: "2026-10-12", idoTol: "08:00", idoIg: "16:00" },
  { tipus: "le", orszag: "HU", irsz: "2120", varos: "Dunakeszi", datumTol: "2026-10-09", datumIg: "2026-10-12", idoTol: "08:00", idoIg: "16:00" },
]);
eq("kapcsolat", [g.kapcsolatNev, g.telefonok], ["Minta Péter", ["+36301234567"]]);
eq("méret", [g.hosszM, g.sulyT], [13.6, 24]);
eq("áru, jármű, felépítmény", [g.aru, g.jarmuTipus, g.felepitmeny, g.tulajdonsagok], ["Pallets Construction materials", "Nyerges szerelvény", "Ponyvás", null]);
eq("ár nincs, fizetési határidő", [g.ar, g.fizetesiHataridoNap], [null, 30]);
eq("figyelmeztetés: csak az ár hiánya", g.figyelmeztetesek, ["Nincs megadott ár — árajánlatot kell adni."]);
eq("kalkulátor-megállók", g.helyek.map(kalkulatorMegallo), ["4200 Hajdúszoboszló", "2120 Dunakeszi"]);
eq("kulcs = ajánlat-azonosító", timocomKulcs(g), "bTK371e8SA2IgIF-XxPmkg");

// 2. Több megálló, ADR, a gombtól jövő hely-sorokkal (ikon-cím + sor szöveg,
//    a rejtett, képernyőolvasós változat is: „FelrakóhelyHU, 5300 Karcag…").
const happSzoveg = [
  "Létrehozva 2026. 10. 08., 13:13:15", "Ajánlat mentve", "Happ Kft.", "HU, 8441 Márkó", "5,0", "(173)", "TC ID: 17204",
  "Fel- és lerakóhelyek", "313 km", "Útvonal számítás",
  "HU", ", 5300 Karcag", "10. 13. - 10. 13.", "15:00 - 18:00",
  "HU", ", 2212 Csévharaszt", "10. 14. - 10. 14.", "08:00 - 14:00",
  "HU", ", 9153 Öttevény", "10. 14. - 10. 14.", "08:00 - 14:00",
  "Kapcsolatfelvétel részletei", "Minta Dóra", "Beszélt nyelvek: magyar", "+36 70 123 4567", "#",
  "Fuvarleírás", "13.6 m", "17 t", "Áru jellege", "7db +10 db raklap BIGBAG (5to ADR köteles!)", "Kiegészítő információk", "-",
  "Nincs rakománytároló eszköz csere", "A járművel szembeni követelmények", "Jármű típusa", "Nyerges szerelvény",
  "Felépítménytípusok", "Ponyvás", "Tulajdonságok és tanúsítványok", "ADR", "Fuvardíj", "Ár", "-",
  "Fizetési határidő", "Nincs kiválasztva", "Külső megjegyzések", "-",
].join("\n");
const happ = parseTimocomAjanlat({
  szoveg: happSzoveg,
  helyek: [
    { tipus: "Felrakóhely", szoveg: "HU\n, 5300 Karcag\n10. 13. - 10. 13.\n \n15:00 - 18:00\n " },
    { tipus: "Lerakóhely", szoveg: "LerakóhelyHU, 2212 CsévharasztLegkorábbi időpont - Legkésőbbi időpont10. 14. - 10. 14. Legkorábbi időpont - Legkésőbbi időpont08:00 - 14:00" },
    { tipus: "Lerakóhely", szoveg: "HU\n, 9153 Öttevény\n10. 14. - 10. 14.\n \n08:00 - 14:00\n " },
  ],
});
eq("több megálló: típusok az ikonból", happ.helyek.map((h) => `${h.tipus}:${h.varos}`), ["fel:Karcag", "le:Csévharaszt", "le:Öttevény"]);
eq("rejtett-szöveges sor is értelmezve", [happ.helyek[1].irsz, happ.helyek[1].datumTol, happ.helyek[1].idoTol, happ.helyek[1].idoIg], ["2212", "2026-10-14", "08:00", "14:00"]);
eq("megbízó az „Ajánlat mentve” sor után", happ.megbizo, "Happ Kft.");
eq("telefon szóközökkel", happ.telefonok, ["+36701234567"]);
eq("„Nincs kiválasztva” fizetési határidő", happ.fizetesiHataridoNap, null);
all("ADR figyelmeztetés", happ.figyelmeztetesek.some((f) => /ADR/.test(f)));
all("több megálló figyelmeztetés", happ.figyelmeztetesek.some((f) => /3 megálló \(1 fel, 2 le\)/.test(f)));
// Szövegből (gomb nélkül) is kijön mindhárom hely: első fel, utolsó le, középső ismeretlen.
const happSzovegbol = parseTimocomAjanlat({ szoveg: happSzoveg });
eq("szövegből: három hely", happSzovegbol.helyek.map((h) => `${h.tipus}:${h.varos}`), ["fel:Karcag", "null:Csévharaszt", "le:Öttevény"]);

// 3. Áras, külföldi, dobozos, hulladék — és év-forduló.
const aras = parseTimocomAjanlat({
  szoveg: [
    "Létrehozva 2026. 12. 30., 10:00:00", "Ajánlat mentése", "Minta Spedition GmbH", "AT, 4020 Linz", "TC ID: 12345",
    "Fel- és lerakóhelyek", "520 km", "Útvonal számítás",
    "AT", ", 4020 Linz", "12. 31. - 12. 31.", "06:00 - 10:00",
    "HU", ", 4400 Nyíregyháza", "01. 02. - 01. 02.", "08:00 - 12:00",
    "Kapcsolatfelvétel részletei", "Max Muster", "+43 660 1234567",
    "Fuvarleírás", "15.0 m", "25 t", "Áru jellege", "Gemischte Abfälle", "Kiegészítő információk", "Hulladékszállítási engedély szükséges!",
    "A járművel szembeni követelmények", "Jármű típusa", "Nyerges szerelvény", "Felépítménytípusok", "Dobozos",
    "Tulajdonságok és tanúsítványok", "-", "Fuvardíj", "Ár", "1.250,00 EUR", "Fizetési határidő", "45 Nap", "Külső megjegyzések", "Rampe 3",
  ].join("\n"),
});
eq("ár EUR-ban", aras.ar, { osszeg: 1250, penznem: "EUR" });
eq("év-forduló: januári lerakás a következő év", [aras.helyek[0].datumTol, aras.helyek[1].datumTol], ["2026-12-31", "2027-01-02"]);
eq("külföldi megálló a kalkulátornak", kalkulatorMegallo(aras.helyek[0]), "4020 Linz, AT");
eq("megjegyzés", aras.megjegyzes, "Rampe 3");
const fig = aras.figyelmeztetesek.join(" | ");
all("hulladék", /Hulladék/.test(fig));
all("felépítmény nem ponyvás", /Felépítmény: Dobozos/.test(fig));
all("hossz és súly", /15 m/.test(fig) && /25 t/.test(fig));
all("külföld", /Külföldi/.test(fig));
all("áras ajánlatnál nincs „nincs ár” figyelmeztetés", !/Nincs megadott ár/.test(fig));
eq("kulcs azonosító nélkül: TC ID + útvonal + nap", timocomKulcs(aras), "tc|12345|4020linz2026-12-31|4400nyíregyháza2027-01-02");

// 3b. Részrakomány, rejtett telefonszám, Tautliner, megjegyzés idézőjelben
//     (valódi panel-szöveg 2026-10-11, név kicserélve).
const gvm = parseTimocomAjanlat({
  szoveg: [
    "Létrehozva 2026. 10. 08., 14:11:12", "Ajánlat mentése", "Minta Europe Kft.", "HU, 5100 Jászberény", "5,0", "(16)", "TC ID: 207359",
    "Fel- és lerakóhelyek", "313 km", "Útvonal számítás",
    "HU", ", 5300 Karcag", "10. 13. - 10. 13.", "\u00a0", "15:00 - 18:00", "\u00a0",
    "HU", ", 9153 Öttevény", "10. 14. - 10. 14.", "\u00a0", "08:00 - 14:00", "\u00a0",
    "Kapcsolatfelvétel részletei", "Minta Attila", "Beszélt nyelvek: angol, magyar, német", "Elrejtve", "Elrejtve",
    "Fuvarleírás", " 4 m", " 5 t", "Áru jellege", "Pallets", "Kiegészítő információk", "Részrakomány, Körfuvar",
    "Nincs rakománytároló eszköz csere", "A járművel szembeni követelmények", "Jármű típusa", "Tgk 7,5 t-ig, Tgk 12 t-ig, Nyerges szerelvény",
    "Felépítménytípusok", "Tautliner, Ponyvás", "Tulajdonságok és tanúsítványok", "-", "Fuvardíj", "Ár", "-",
    "Fizetési határidő", "Nincs kiválasztva", "Külső megjegyzések", '"ADR"',
  ].join("\n").replace(/\\u00a0/g, "\u00a0"),
});
eq("rejtett telefon: név megvan, telefon nincs", [gvm.kapcsolatNev, gvm.telefonok], ["Minta Attila", []]);
eq("részrakomány a kiegészítőben", [gvm.kiegeszito, gvm.hosszM, gvm.sulyT], ["Részrakomány, Körfuvar", 4, 5]);
eq("helyek nem-törő szóközzel", gvm.helyek.map((h) => `${h.tipus}:${h.varos}:${h.idoTol}`), ["fel:Karcag:15:00", "le:Öttevény:08:00"]);
all("ADR a megjegyzésből", gvm.figyelmeztetesek.some((f) => /ADR/.test(f)));
all("Tautliner/ponyvás nem felépítmény-figyelmeztetés", !gvm.figyelmeztetesek.some((f) => /Felépítmény/.test(f)));

// 4. Hely-sor önmagában.
eq("hely-sor", parseHelySzoveg("HU, 1106 Budapest 10. 12. - 10. 13. 07:00 - 15:00", 2026, 10), {
  orszag: "HU", irsz: "1106", varos: "Budapest", datumTol: "2026-10-12", datumIg: "2026-10-13", idoTol: "07:00", idoIg: "15:00",
});
eq("hely-sor irányítószám nélkül", parseHelySzoveg("DE, München 10. 12. - 10. 12.", 2026, 10)?.varos, "München");

// 5. Üres / szemét bemenet nem dob hibát.
const ures = parseTimocomAjanlat({ szoveg: "valami teljesen más" });
eq("szemét: nincs hely, nincs megbízó-cím", [ures.helyek.length, ures.megbizoCim, ures.tcId], [0, null, null]);
eq("szemét: nincs kulcs", timocomKulcs(ures), null);

// 6. A # rész kódolása-dekódolása (ékezetek is) és a gomb kódja.
const adat = { szoveg: gaszler, cim: "HU Hajdúszoboszló > HU Dunakeszi", url: "https://my.timocom.com/x/view/abcdefghijkl", helyek: [{ tipus: "Felrakóhely", szoveg: "HU, 4200 Hajdúszoboszló" }] };
const b64 = Buffer.from(JSON.stringify(adat), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
eq("hash dekódolás", dekodolHash(`#d=${b64}`), adat);
eq("hibás hash → null", dekodolHash("#d=%%%"), null);
eq("hash nélkül → null", dekodolHash("#valami"), null);
const kod = konyvjelzoKod("https://web-production-91051.up.railway.app/");
all("gomb: javascript: URL, a WWP lapra mutat", kod.startsWith("javascript:") && decodeURIComponent(kod).includes('"https://web-production-91051.up.railway.app/fuvarozas2/timocom"'));
all("gomb: nem tartalmaz sortörést", !decodeURIComponent(kod).includes("\n"));
// A gomb kódja szintaktikailag érvényes JS.
try { new Function(decodeURIComponent(kod).slice("javascript:".length)); ok++; } catch (e) { bad++; console.log("  HIBA  gomb kód szintaxis:", e); }

console.log(`\nTimocom teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
