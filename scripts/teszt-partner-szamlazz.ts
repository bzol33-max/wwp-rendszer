// Számlázz.hu partner-export → törzs kitöltés (lib/fuvarozas2/partner-szamlazz-alap.ts).
// Futtatás: npx tsx scripts/teszt-partner-szamlazz.ts

import { csvSorok, szamlazzPartnerek, szamlazzImportTerv, type ImportPartner } from "@/lib/fuvarozas2/partner-szamlazz-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  const a = JSON.stringify(kapott), b = JSON.stringify(vart);
  if (a === b) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${b}\n    kapott: ${a}`); }
}

const CSV = `"partner neve","partner azonosító","ország","irányítószám","település","utca és házszám","postázási név","postacím: ország","postacím: irányítószám","postacím: település","postacím: utca és házszám","adószám","csoportos adószám","közösségi adószám","email cím","számla típus (E/P/EP)","alapértelmezett fizetési mód","fizetési határidő (nap)","főkönyvi szám","partner főkönyvi azonosító","kapcsolattartó neve","kapcsolattartó telefon","kapcsolattartó fax","devizanem","adóalany","partner megjegyzés","alapértelmezett számla megjegyzés","bankszámlaszám"
"A1P Bud Kft.",,"","1085","Budapest","József körút 69. fszt.","","","","","","26702702-2-42","","","a1probud@gmail.com,","EP","átutalás","60",,,,,,"Ft","",,,
"""HAPP"" Kft.","0000124260",,"8441","Márkó","Iparos utca 10.",,,,,,"12497883-2-19","",,"finance@happ.eu, burkus.arpad@happ.eu","EP","átutalás","60",,,,,,"Ft","van magyar adószáma",,,
"Gebrüder Weiss Kft.",,"","2330","Dunaharaszti","Raktár utca 2. (7600/1 hrsz)","","","2330","Dunaharaszti","Pf. 33.","10323292-2-44","","","invoice.hungary@gw-world.com","EP","átutalás","31",,,,,,"Ft","",,,
"Bil-Transport s.r.o",,"Szlovákia","94501","Komárno","Hradná 3","","","","","","","","SK2022286860","","EP","átutalás","60",,,,,,"EUR","",,,
"FABRIKA + 2000 Kft.",,"Magyarország","9662","Tompaládony","0117/8 hrsz.","","","","","","13748670-2-18","","","akos@fabrika.hu","EP","átutalás","29",,,,,,"Ft","",,,
"SOLINWEST 2000 KFT.",,"Magyarország","2161","Csomád","Kossuth Lajos út 79.","","","","","","12103193-2-13","","","ertekesites@solinwest.hu","EP","átutalás","8",,,,,,"Ft","",,,
"SOLINWEST AGRO Kft",,"Magyarország","2161","Csomád","Kossuth Lajos út 79.","","","","","","25277362-2-13","","","info@solinwest.hu","EP","átutalás","9",,,,,,"Ft","",,,
"Kiss Imre",,"","4440","Tiszavasvári","Kárpát utca 5.","","","","","","51804644-2-35","","","","EP","készpénz","0",,,,,,"Ft","",,,
"Well-Worn Pallet Kft.",,"","4234","Szakoly","Rákóczi út 26.","","","","","","28971113-2-15","","","","EP","átutalás","0",,,,,,"Ft","",,,
`;

eq("CSV: idézőjel-escape", csvSorok('"""HAPP"" Kft.","x"')[0], ['"HAPP" Kft.', "x"]);
const lista = szamlazzPartnerek(CSV);
eq("9 partner", lista.length, 9);
eq("A1P: e-mail vessző nélkül, székhely", lista[0], { nev: "A1P Bud Kft.", adoszam: "26702702-2-42", szekhely: "1085 Budapest, József körút 69. fszt.", postazasiCim: null, email: "a1probud@gmail.com", fizetesiHataridoNap: 60, keszpenz: false, penznem: "Ft" });
eq("HAPP: név idézőjel nélkül, két e-mail", [lista[1].nev, lista[1].email], ["HAPP Kft.", "finance@happ.eu, burkus.arpad@happ.eu"]);
eq("Gebrüder Weiss: külön postacím", lista[2].postazasiCim, "2330 Dunaharaszti, Pf. 33.");
eq("Bil-Transport: közösségi adószám", lista[3].adoszam, "SK2022286860");
eq("Kiss Imre: készpénz = 0 nap", [lista[7].fizetesiHataridoNap, lista[7].keszpenz], [0, true]);

const ures = { adoszam: null, szekhely: null, szamlazasi_cim: null, postazasi_cim: null, szamlazasi_email: null, fizetesi_hatarido_nap: null, posta_nem_kell: false, szamla_email_nem_kell: false };
const partnerek: ImportPartner[] = [
  { id: "1", nev: "A1P Bud kft", nevvaltozatok: [], ...ures },
  { id: "2", nev: "HAPP Kft.", nevvaltozatok: [], ...ures, adoszam: "12497883-2-19", szamlazasi_email: "finance@happ.eu", fizetesi_hatarido_nap: 60, postazasi_cim: "8441 Márkó, Iparos utca 10." },
  { id: "3", nev: "Gebrüder Weiss Kft.", nevvaltozatok: [], ...ures },
  { id: "4", nev: "BIL-TRANSPORT, s.r.o.", nevvaltozatok: ["BIL-Transport"], ...ures, szekhely: "945 01 Komárno, Hradná 3." },
  { id: "5", nev: "Fabrika 2000 Kft", nevvaltozatok: ["Fabrika"], ...ures, szekhely: "9662 Tompaládony, 0117/8 hrsz.", szamlazasi_email: "akos@fabrika.hu", fizetesi_hatarido_nap: 30 },
  { id: "6", nev: "Solinvest", nevvaltozatok: [], ...ures },
  { id: "7", nev: "Well-Worn Pallet Kft.", nevvaltozatok: [], ...ures },
  { id: "8", nev: "Ismeretlen Fuvar Kft.", nevvaltozatok: [], ...ures },
];
const t = szamlazzImportTerv(partnerek, CSV);
eq("Számlázz.hu partnerek száma", t.szamlazzDb, 9);
eq("párosítatlan: Solinvest (két Solinwest, egyik sem pontos) és az ismeretlen; a saját cég kihagyva", t.parositatlan, ["Solinvest", "Ismeretlen Fuvar Kft."]);
const terv = (id: string) => t.tervek.find((x) => x.partnerId === id)?.valtozas ?? null;
eq("A1P: minden üres mező + névváltozat", terv("1"), { adoszam: "26702702-2-42", szekhely: "1085 Budapest, József körút 69. fszt.", szamlazasi_cim: "1085 Budapest, József körút 69. fszt.", postazasi_cim: "1085 Budapest, József körút 69. fszt.", szamlazasi_email: "a1probud@gmail.com", fizetesi_hatarido_nap: 60, nevvaltozatok: ["A1P Bud Kft."] });
eq("HAPP: adószám szerint párosul, csak a hiányzó székhely/számlázási cím (a név azonos, nincs névváltozat)", terv("2"), { szekhely: "8441 Márkó, Iparos utca 10.", szamlazasi_cim: "8441 Márkó, Iparos utca 10." });
eq("Gebrüder Weiss: postacím a külön postacímből", terv("3")?.postazasi_cim, "2330 Dunaharaszti, Pf. 33.");
eq("Bil-Transport: székhely marad, közösségi adószám jön", [terv("4")?.szekhely, terv("4")?.adoszam], [undefined, "SK2022286860"]);
eq("Fabrika: meglévő határidő (30) nem íródik felül, adószám + névváltozat jön", [terv("5")?.fizetesi_hatarido_nap, terv("5")?.adoszam, terv("5")?.nevvaltozatok], [undefined, "13748670-2-18", ["Fabrika", "FABRIKA + 2000 Kft."]]);
eq("saját cég: nincs terv", terv("7"), null);

// Ha a Solinvest-nek már van névváltozata, egyértelmű.
const t2 = szamlazzImportTerv([{ id: "6", nev: "Solinvest", nevvaltozatok: ["SOLINWEST AGRO Kft"], ...ures }], CSV);
eq("Solinvest névváltozattal párosul", [t2.parositatlan, t2.tervek[0]?.valtozas.adoszam], [[], "25277362-2-13"]);

console.log(`\nteszt-partner-szamlazz: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
