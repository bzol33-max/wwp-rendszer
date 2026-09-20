// A levél-osztályozó tesztje (Fuvarozás 2, E9 „Levelek").
//
// Futtatás:  npx tsx scripts/teszt-level-osztalyozo.ts
//
// A minták a VALÓDI postafiók alakjait követik (tárgysor-formátum, ki mit
// ír), de KITALÁLT nevekkel, címekkel és számokkal — igazi megbízás adata
// nem kerül a repóba (ugyanaz a szabály, mint a scripts/teszt-minta/-nál).

import { osztalyozLevelet, type LevelBemenet, type LevelOsztaly } from "@/lib/fuvarozas2/level-osztalyozo";

let ok = 0;
let bad = 0;
function eset(nev: string, b: LevelBemenet, vartOsztaly: LevelOsztaly, minBizalom = 0, vartCsatolmanyKell?: boolean) {
  const e = osztalyozLevelet(b);
  const hibak: string[] = [];
  if (e.osztaly !== vartOsztaly) hibak.push(`osztály: várt ${vartOsztaly}, kapott ${e.osztaly}`);
  if (e.bizalom < minBizalom) hibak.push(`bizalom: várt ≥${minBizalom}, kapott ${e.bizalom}`);
  if (vartCsatolmanyKell !== undefined && e.csatolmanyKell !== vartCsatolmanyKell) hibak.push(`csatolmányKell: várt ${vartCsatolmanyKell}, kapott ${e.csatolmanyKell}`);
  if (hibak.length === 0) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    ${hibak.join("\n    ")}\n    indoklás: ${e.indoklas.join(" · ")}`); }
  return e;
}

const PDF = ["megbizas.pdf"];

// --- Megbízások, ahogy a visszatérő megbízók küldik -------------------------
eset("ÁB Speed tárgysor-formátum", {
  felado: "transport@abspeed.hu", targy: "MEGBIZ 09.14 AOPU-427 26/3663", snippet: "Kis Károly www.abspeed.hu +36 20 000 0000", csatolmanyNevek: PDF, szalElso: true,
}, "megbizas", 80, true);

eset("Duvenbeck Transport Order", {
  felado: "vminta@duvenbeck.de", targy: "Duvenbeck Transportauftrag/Transport Order, Reise/Trip-ID: 23283034.",
  snippet: "Tisztelt Hölgyem vagy Uram! a fent említett szállítást a mellékelt megrendelés szerint szíveskedjenek elvégezni.", csatolmanyNevek: ["TA1982867_V1.pdf", "FRALI1996844_V1.pdf"], szalElso: true,
}, "megbizas", 85, true);

eset("Duvenbeck rövid tárgy (csak rendszám és szám)", {
  felado: "mminta@duvenbeck.de", targy: "NZM492 : 23288892.", snippet: "Tisztelt Hölgyem vagy Uram! a fent említett szállítást a mellékelt megrendelés szerint szíveskedjenek elvégezni.", csatolmanyNevek: PDF, szalElso: true,
}, "megbizas", 70, true);

eset("RBT pozíciószámmal", {
  felado: "minta.dora@rbteurope.com", targy: "Fuvarmegbízás (poz: 3003)", snippet: "Tisztelt Partnerünk! Hivatkozva előzetes telefonbeszélgetésünkre, mellékelten küldöm fuvarmegbízásunkat! Kérlek, igazold vissza a fuvart!", csatolmanyNevek: PDF, szalElso: true,
}, "megbizas", 85, true);

eset("Flott-Trans alvállalkozói megbízás", {
  felado: "belfold@flott.hu", targy: "Alvállalkozói megbízás AOPU427 MINTAVÁROS- BPEST", snippet: "", csatolmanyNevek: PDF, szalElso: true,
}, "megbizas", 80, true);

eset("Ghibli — a tárgy csak viszonylat-kód", {
  felado: "minta.maria@ghibli.hu", targy: "2622824 /hu32-hu 40 /", snippet: "Küldöm a holnapi rakodást Köszönöm Ria", csatolmanyNevek: PDF, szalElso: true,
}, "megbizas", 70, true);

eset("Új, ismeretlen megbízó megbízása", {
  felado: "diszpecser@ismeretlen-sped.hu", targy: "Fuvarmegbízás", snippet: "Szia! Csatolva küldöm a megbízást.", csatolmanyNevek: PDF, szalElso: true,
}, "megbizas", 70, true);

eset("Megbízás csatolmány nélkül — kézi ellenőrzés", {
  felado: "diszpecser@ismeretlen-sped.hu", targy: "Fuvarmegbízás holnapra", snippet: "Szia, a részleteket telefonon egyeztettük.", csatolmanyNevek: [], szalElso: true,
}, "megbizas", 60, false);

// --- Nem megbízás -----------------------------------------------------------
eset("Okmánysürgetés", {
  felado: "minta.dora@trans-sped.hu", targy: "SOS OKMÁNY", snippet: "Tisztelt Partnerünk! Az alábbi viszonylathoz szükségünk lenne az okmányokra elektronikus, illetve postai úton is!", szalElso: true,
}, "okmanykeres", 85);

eset("Hiányzó okmány + számla", {
  felado: "minta@sgtransportkft.hu", targy: "hiányzó augusztusi okmányok", snippet: "Szia, Az alábbi szállításnak nem kaptam meg az okmányait és a számlát. Kérlek küld át scennelve is.", szalElso: true,
}, "okmanykeres", 75);

eset("Módosítás a szálban (kiállási díj)", {
  felado: "minta.erika@ghibli.hu", targy: "Re: 2622824 /hu32-hu 40 /", snippet: "Szia, a mai lerakó nem sikerült, a sofőr pedig elment. Holnap reggel 06:00-kor szednek le, melynek plusz kiállási díja 250 €. Kérlek reggel menjetek vissza!", szalElso: false,
}, "modositas", 75);

eset("Kérdés a szálban", {
  felado: "minta.erika@ghibli.hu", targy: "Re: 2622824 /hu32-hu 40 /", snippet: "Szia, Leszedték ma reggel az árut? Üdv Erika", szalElso: false,
}, "adatkeres", 70);

eset("Papírok érkeztek", {
  felado: "minta.maria@ghibli.hu", targy: "FW: Papírok", snippet: "Továbbítom a papírokat.", csatolmanyNevek: ["cmr.pdf"], szalElso: true,
}, "papirok", 70, true);

eset("Szállítólevél-szám a szálban", {
  felado: "fuvar@bblogistic.eu", targy: "RE: Mintaváros-Példafalu 02215-2026", snippet: "szia, itt csak a palettaszámot küldöm és a szállítólevél számot neked!", szalElso: false,
}, "papirok", 70);

eset("Számlázz.hu értesítő", {
  felado: "well.worn@szamlazz.hu", targy: "Értesítő: Számla érkezett – Well-worn Pallet Kft.", snippet: "Tisztelt Partner! Ezúton küldjük aktuális számláját.", szalElso: true,
}, "szamla_ertesito", 95);

eset("Könyvelve visszajelzés", {
  felado: "minta@duvenbeck.de", targy: "RE: Értesítő: Számla érkezett – Well-worn Pallet Kft.", snippet: "Kedves Partnerünk! Számlája könyvelésre került.", szalElso: false,
}, "fizetes", 80);

eset("Timocom chat", {
  felado: "0e33e77f8b73476f8f1a9375ce4262c6-4yz6mu0trn@chat.timocom.com", targy: "HU 42 Mintaváros➔HU 33 Példafalu - Minta Kft. - New message", snippet: "Tisztelt Zoltán Budaházi, TIMOCOM ID: 000000", szalElso: true,
}, "timocom", 90);

eset("Hírlevél", {
  felado: "info@news.pelda-gyarto.eu", targy: "New products and innovations at IAA TRANSPORTATION 2026", snippet: "Visit us in Pavilion 33 and discover our highlights.", szalElso: true,
}, "reklam", 70);

eset("Állásportál reklám", {
  felado: "business@pelda-allas.hu", targy: "Villámakció az őszi toborzáshoz: 3 választott csomag", snippet: "Kedves Budaházi Zoltán! Az ősz beköszöntésével felpörög a toborzás.", szalElso: true,
}, "reklam", 70);

eset("Magánlevél — nem sorolható be, nem megy sehova", {
  felado: "ismeros@example.com", targy: "Szia", snippet: "Jövő héten ráérsz?", szalElso: true,
}, "egyeb", 0, false);

// --- Kinyert mezők ----------------------------------------------------------
const d = osztalyozLevelet({ felado: "mminta@duvenbeck.de", targy: "NZM492 : 23288892.", snippet: "a fent említett szállítást a mellékelt megrendelés szerint", csatolmanyNevek: PDF, szalElso: true });
if (d.hivatkozas === "23288892") ok++; else { bad++; console.log(`  HIBA  hivatkozás: várt 23288892, kapott ${d.hivatkozas}`); }
if (d.rendszam === "NMZ-492") ok++; else { bad++; console.log(`  HIBA  rendszám (elírt NZM492 → NMZ-492): kapott ${d.rendszam}`); }
const a = osztalyozLevelet({ felado: "transport@abspeed.hu", targy: "MEGBIZ 09.14 AOPU-427 26/3663", snippet: "", csatolmanyNevek: PDF, szalElso: true });
if (a.hivatkozas === "26/3663") ok++; else { bad++; console.log(`  HIBA  hivatkozás: várt 26/3663, kapott ${a.hivatkozas}`); }
if (a.partnerNev) ok++; else { bad++; console.log("  HIBA  ÁB Speed partner nem ismerhető fel a feladóból"); }
const r = osztalyozLevelet({ felado: "minta.dora@rbteurope.com", targy: "Fuvarmegbízás (poz: 3003)", snippet: "", csatolmanyNevek: PDF, szalElso: true });
if (r.hivatkozas === "3003") ok++; else { bad++; console.log(`  HIBA  hivatkozás: várt 3003, kapott ${r.hivatkozas}`); }

console.log(`\nLevél-osztályozó teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
