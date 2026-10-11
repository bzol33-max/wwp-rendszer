// Számlázási segéd — tiszta rész. Futtatás: npx tsx scripts/teszt-szamlazasi-seged.ts
// A minták a valódi kimenő számlák (WLLWR-2026-284 … 348) alakját követik.

import {
  cimBontas, ellenorzesek, fuvarMegnevezes, huDatum, mindSzovegkent, napHozzaad, napKulonbseg, osszegek, penznemKod,
  szamSzoveg, valasztRendelesszam, vevoXmlbol, type RendelesszamBemenet,
} from "@/lib/fuvarozas2/szamlazasi-seged-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Vevő a Számlázz.hu-XML-ből.
eq("blokkos cím + adószám", vevoXmlbol("<szamla><vevo><nev>DUVENBECK Logisztikai Kft.</nev><cim><orszag>Magyarország</orszag><irsz>8445</irsz><telepules>Csehbánya</telepules><cim>&#218;jtelep utca 41.</cim></cim><email>cee-hegy-abrechnung@duvenbeck.de</email><adoszam>13500287-2-19</adoszam></vevo></szamla>"),
  { nev: "DUVENBECK Logisztikai Kft.", irsz: "8445", telepules: "Csehbánya", cim: "Újtelep utca 41.", adoszam: "13500287-2-19", euAdoszam: null, email: "cee-hegy-abrechnung@duvenbeck.de" });
eq("lapos alak", vevoXmlbol("<szamla><vevo><nev>X</nev><irsz>4000</irsz><telepules>Debrecen</telepules><cim>Fő u. 1.</cim></vevo></szamla>").cim, "Fő u. 1.");
eq("postázási cím nem keveredik", vevoXmlbol("<szamla><vevo><nev>X</nev><cim><irsz>4000</irsz><telepules>Debrecen</telepules><cim>Fő u. 1.</cim></cim><postazasicim><irsz>1106</irsz><telepules>Budapest</telepules><cim>Jászberényi út 45.</cim></postazasicim></vevo></szamla>").telepules, "Debrecen");
eq("üres XML", vevoXmlbol(null).nev, null);
eq("entitás a névben", vevoXmlbol("<szamla><vevo><nev>&quot;HAPP&quot; Kft.</nev></vevo></szamla>").nev, '"HAPP" Kft.');

// Cím bontása a partner-törzsből.
eq("vesszős cím", cimBontas("8445 Csehbánya, Újtelep utca 41."), { irsz: "8445", telepules: "Csehbánya", cim: "Újtelep utca 41." });
eq("vessző nélkül", cimBontas("1222 Budapest Pannónia utca 9."), { irsz: "1222", telepules: "Budapest", cim: "Pannónia utca 9." });
eq("HU- előtag", cimBontas("HU-4031 Debrecen, Határ út 1"), { irsz: "4031", telepules: "Debrecen", cim: "Határ út 1" });
eq("bonthatatlan", cimBontas("Hrsz. 1073/4"), { irsz: null, telepules: null, cim: "Hrsz. 1073/4" });
eq("üres", cimBontas(null), { irsz: null, telepules: null, cim: null });

// Dátumok.
eq("számla-dátum", huDatum("2026-10-09"), "2026.10.09.");
eq("időbélyegből is", huDatum("2026-10-09T14:00:00Z"), "2026.10.09.");
eq("+30 nap", napHozzaad("2026-10-11", 30), "2026-11-10");
eq("hónapváltás", napHozzaad("2026-09-29", 44), "2026-11-12");
eq("Lösung: 44 nap", napKulonbseg("2026-10-06", "2026-11-19"), 44);
eq("Duvenbeck: 30 nap", napKulonbseg("2026-09-09", "2026-10-09"), 30);

// Megnevezés.
eq("két megálló", fuvarMegnevezes([
  { tipus: "felrako", telepules: "Nyírjákó", cim_nyers: "4541 Nyírjákó, Fermentáló üzem" },
  { tipus: "lerako", telepules: "Ikrény", cim_nyers: "9141 Ikrény" },
]), { megnevezes: "Közúti árufuvarozás Nyírjákó-Ikrény", reszlet: null });
eq("település nélkül a címből", fuvarMegnevezes([
  { tipus: "felrako", telepules: null, cim_nyers: "RESRG Automotive HU kft., Werk 2367 Újhartyán" },
  { tipus: "lerako", telepules: null, cim_nyers: "BMW HU Plant Debrecen, BMW Körút 1, 4002 Debrecen" },
]).megnevezes, "Közúti árufuvarozás Újhartyán-Debrecen");
eq("cégnév-maradék: az utolsó szó a város", fuvarMegnevezes([
  { tipus: "felrako", telepules: null, cim_nyers: "RESRG Automotive HU kft., Werk Ujhartyan" },
  { tipus: "lerako", telepules: null, cim_nyers: "BMW HU Plant Debrecen" },
]).megnevezes, "Közúti árufuvarozás Ujhartyan-Debrecen");
eq("csupa nagybetű", fuvarMegnevezes([
  { tipus: "felrako", telepules: null, cim_nyers: "HAJDU HAJDUSÁGI ZRT [H-4243] TÉGLÁS, Hrsz. 0135/9" },
  { tipus: "lerako", telepules: "Gyöngyös", cim_nyers: "Gyöngyös" },
]).megnevezes, "Közúti árufuvarozás Téglás-Gyöngyös");
eq("egyszavas címrész a város", fuvarMegnevezes([
  { tipus: "felrako", telepules: null, cim_nyers: "Sárvár, Rába utca 1" },
  { tipus: "lerako", telepules: null, cim_nyers: "Debrecen, BMW Group Plant, Mezőségi út 1" },
]).megnevezes, "Közúti árufuvarozás Sárvár-Debrecen");
eq("több megálló: második sor", fuvarMegnevezes([
  { tipus: "felrako", telepules: "Balkány", cim_nyers: "Balkány" },
  { tipus: "felrako", telepules: "Hajdúnánás", cim_nyers: "Hajdúnánás" },
  { tipus: "lerako", telepules: "Jászberény", cim_nyers: "Jászberény" },
  { tipus: "lerako", telepules: "Mezőlak", cim_nyers: "Mezőlak" },
]), { megnevezes: "Közúti árufuvarozás Balkány-Mezőlak", reszlet: "Balkány (fel)-Hajdúnánás (fel)-Jászberény (le)-Mezőlak (le)" });
eq("megálló nélkül a megbízás címeiből", fuvarMegnevezes([], { felrako: "Sárvár, Ipari park", lerako: "Debrecen" }).megnevezes, "Közúti árufuvarozás Sárvár-Debrecen");

// Összegek — a számlák szerint.
eq("forint (WLLWR-2026-346)", osszegek(320000, "HUF"), { netto: 320000, afa: 86400, brutto: 406400 });
eq("euró (WLLWR-2026-316)", osszegek(250, "EUR"), { netto: 250, afa: 67.5, brutto: 317.5 });
eq("euró (WLLWR-2026-292)", osszegek(730, "EUR"), { netto: 730, afa: 197.1, brutto: 927.1 });
eq("ezres tagolás", szamSzoveg(406400, "HUF"), "406 400");
eq("euró két tizedes", szamSzoveg(67.5, "EUR"), "67,50");
eq("pénznem Ft→HUF", [penznemKod("Ft"), penznemKod("EUR"), penznemKod(null)], ["HUF", "EUR", "HUF"]);

// Rendelésszám.
const alap: RendelesszamBemenet = {
  hivatkozasKanonikus: null, pozicioszam: null, reiseId: null, hivatkozasMasodlagos: null, hivatkozasNincs: false,
  szamlanKertSzam: "pozicioszam", formatum: null, levelbol: null, elozoSzamlanVolt: false, kotelezoSablon: false,
};
eq("Duvenbeck: Reise-ID a megbízásból", valasztRendelesszam({ ...alap, reiseId: "23427161", szamlanKertSzam: "reise_id", kotelezoSablon: true, formatum: "^\\d{8}$" }),
  { ertek: "23427161", forras: "a megbízás Reise-ID-je", kotelezo: true, hiba: null });
eq("hivatkozás, ha a kért szám nincs", valasztRendelesszam({ ...alap, hivatkozasKanonikus: "2026/TO02172", elozoSzamlanVolt: true }).ertek, "2026/TO02172");
eq("levél tárgyából, ha a megbízáson semmi", valasztRendelesszam({ ...alap, levelbol: "23427161", kotelezoSablon: true }),
  { ertek: "23427161", forras: "a megbízó levelének tárgya", kotelezo: true, hiba: null });
eq("kötelező és hiányzik", valasztRendelesszam({ ...alap, kotelezoSablon: true }).hiba, "Hiányzik — enélkül ennél a megbízónál a számla nem párosítható.");
eq("nem kötelező (Hajdúspedíció): nincs hiba", valasztRendelesszam(alap), { ertek: null, forras: null, kotelezo: false, hiba: null });
eq("jelölve, hogy nincs: nem kötelező", valasztRendelesszam({ ...alap, hivatkozasNincs: true, kotelezoSablon: true }).kotelezo, false);
eq("formátum-hiba", valasztRendelesszam({ ...alap, reiseId: "9990843", szamlanKertSzam: "reise_id", formatum: "^\\d{8}$" }).hiba, "A szám formátuma nem a megszokott (9990843).");
eq("hibás regex nem akaszt", valasztRendelesszam({ ...alap, pozicioszam: "X1", formatum: "[" }).hiba, null);

// Ellenőrzések.
const rOk = valasztRendelesszam({ ...alap, reiseId: "23427161", szamlanKertSzam: "reise_id", kotelezoSablon: true });
const e1 = ellenorzesek({ cmrDb: 2, papirMegvan: true, fuvardij: 480, teljesites: "2026-10-09", kiallitas: "2026-10-11", vanSzamla: false, rendelesszam: rOk, vevoAdoszam: "13500287-2-19" });
eq("minden rendben", e1.every((e) => e.ok), true);
eq("nem blokkol", e1.some((e) => e.blokkol), false);
const e2 = ellenorzesek({ cmrDb: 0, papirMegvan: false, fuvardij: 500000, teljesites: "2026-10-27", kiallitas: "2026-10-01", vanSzamla: false, rendelesszam: valasztRendelesszam(alap), vevoAdoszam: "14539097-2-42" });
eq("WLLWR-2026-334 hibája: teljesítés a kiállítás után", e2.find((e) => e.szoveg.includes("UTÁN"))?.blokkol, true);
eq("CMR nélkül figyelmeztet, nem blokkol", e2[0], { ok: false, szoveg: "Nincs fuvarlevél-fotó — a megbízók a CMR nélkül nem könyvelik", blokkol: false });
eq("papír nélkül figyelmeztet, nem blokkol", e2[1], { ok: false, szoveg: "Az eredeti papír még nem érkezett meg — számlázható, de tartsd számon", blokkol: false });
eq("papír nélkül is kiállítható (csak a dátum-hiba blokkol)", e2.filter((e) => e.blokkol).length, 1);
eq("nyugtázott papír: zöld", e1[1], { ok: true, szoveg: "Az eredeti papír megérkezett (nyugtázva)", blokkol: false });
eq("nem kötelező rendelésszám: nincs sor róla", e2.some((e) => e.szoveg.startsWith("Rendelésszám")), false);
const e3 = ellenorzesek({ cmrDb: 1, papirMegvan: false, fuvardij: 480, teljesites: "2026-10-09", kiallitas: "2026-10-11", vanSzamla: true, rendelesszam: valasztRendelesszam({ ...alap, kotelezoSablon: true }), vevoAdoszam: null });
eq("blokkoló tételek", e3.filter((e) => e.blokkol).map((e) => e.szoveg.slice(0, 20)), ["Erre a fuvarra már v", "Hiányzik a vevő adós", "Rendelésszám: Hiányz"]);

eq("mind szövegként", mindSzovegkent([{ kulcs: "a", cimke: "Név", ertek: "X Kft." }, { kulcs: "b", cimke: "Üres", ertek: null }, { kulcs: "c", cimke: "Adószám", ertek: "1-2-3" }]), "Név: X Kft.\nAdószám: 1-2-3");

console.log(`számlázási segéd: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
