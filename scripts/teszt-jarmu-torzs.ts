// Jármű-törzsadat (2026-10-10): a DB-ből töltött járműlista, a rendszám- és
// sofőr-felismerés 3./4. járművel, és a sofőri irat-jog összerendelése.
//
// Futtatás:  npx tsx scripts/teszt-jarmu-torzs.ts
//
// MIÉRT VAN EZ ITT? A flotta 4 kamionos lesz, a járművek a fuvar_jarmuvek
// táblából jönnek. A sofőr ↔ kocsi összerendelés (lib/fuvarozas/sofor-jarmu.ts)
// dönti el, kinek a fuvar-iratait nyithatja meg egy sofőr (irat-jog.ts) — egy
// új, rendszám és GPS nélküli kocsi (JANI) se nyithasson rést rajta.

import {
  SAJAT_JARMUVEK,
  findJarmuByKod,
  findJarmuByPlate,
  findJarmuInSzoveg,
  jarmuLabel,
  jarmuLista,
  jarmuListaBeallitasa,
  jarmuvekSorokbol,
  resolveJarmu,
  type JarmuTorzsSor,
} from "@/lib/fuvarozas/vehicles";
import { findJarmuByEmployeeName, findJarmuForEmployee, jarmuMatch } from "@/lib/fuvarozas/sofor-jarmu";
import { lejaratAllapot, tisztitJarmu, tisztitOkmany, type JarmuBemenet } from "@/lib/jarmuvek/tipusok";
import { indulasiTelephely, SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}
function dob(nev: string, fn: () => unknown) {
  try {
    fn();
    bad++;
    console.log(`  HIBA  ${nev}: nem dobott hibát`);
  } catch {
    ok++;
  }
}

// ---------------------------------------------------------------------------
// 1. DB-sorok → SajatJarmu (a 031-es migráció utáni állapot + egy 4. kamion).
const SOROK: JarmuTorzsSor[] = [
  { id: "1", kod: "AOPU-427", cimke: "AOPU-427/AOTY-474", vontato_rendszam: "AOPU-427", potkocsi_rendszam: "AOTY-474", irasvaltozatok: [], szin: "blue", ecofleet_object_id: "1144376", sofor_id: "11", sofor_nev: "Vadon Gergő", sofor_becenev: "Gergő" },
  { id: "2", kod: "NMZ-492", cimke: "NMZ-492/XZV-926", vontato_rendszam: "NMZ-492", potkocsi_rendszam: "XZV-926", irasvaltozatok: ["NZM-492"], szin: "yellow", ecofleet_object_id: "369485", sofor_id: "12", sofor_nev: "Takács Miklós", sofor_becenev: "Micó" },
  { id: "3", kod: "JANI", cimke: "DAF XG (gyártás alatt)", vontato_rendszam: null, potkocsi_rendszam: null, irasvaltozatok: [], szin: "green", ecofleet_object_id: null, sofor_id: "13", sofor_nev: "Kiss János", sofor_becenev: "Jani" },
  { id: "4", kod: "RXT-815", cimke: "RXT-815/WKL-204", vontato_rendszam: "RXT-815", potkocsi_rendszam: "WKL-204", irasvaltozatok: null, szin: "purple", ecofleet_object_id: "777001", sofor_id: "14", sofor_nev: "Nagy István", sofor_becenev: "Pisti" },
];
const L = jarmuvekSorokbol(SOROK);
eq("4 jármű", L.length, 4);
eq("sorrend a DB szerint", L.map((j) => j.sofor), ["Gergő", "Micó", "Jani", "Pisti"]);
eq("JANI: nincs rendszám", L[2].rendszamok, []);
eq("JANI: nincs GPS", L[2].ecofleetObjectId, null);
eq("4. kamion rendszámai", L[3].rendszamok, ["RXT-815", "WKL-204"]);
eq("4. kamion színe", L[3].szin, "purple");
eq("alkalmazott-azonosító", L[3].soforAlkalmazottId, "14");
eq("bejelentkezéshez CSAK a DB-beli név", L[1].alkalmazottNevek, ["Takács Miklós"]);
eq("becenév nélkül a tartalék lista neve", jarmuvekSorokbol([{ ...SOROK[1], sofor_becenev: null }])[0].sofor, "Micó");
eq("becenév és tartalék nélkül a név utolsó szava", jarmuvekSorokbol([{ ...SOROK[3], sofor_becenev: null }])[0].sofor, "István");
eq("se becenév, se sofőr → kód", jarmuvekSorokbol([{ ...SOROK[3], sofor_becenev: null, sofor_nev: null, sofor_id: null }])[0].sofor, "RXT-815");
eq("ismeretlen szín → tartalék/kék", jarmuvekSorokbol([{ ...SOROK[3], szin: "pink" }])[0].szin, "blue");
eq("sofőr nélkül nincs bejelentkezési név", jarmuvekSorokbol([{ ...SOROK[0], sofor_id: null, sofor_nev: null }])[0].alkalmazottNevek, []);
eq("031 előtti sor (se sofőr, se becenév): a beépített összerendelés marad",
  jarmuvekSorokbol([{ ...SOROK[1], sofor_id: null, sofor_nev: null, sofor_becenev: null }])[0].alkalmazottNevek, ["Takács Micó", "Takács Miklós"]);
eq("felületen levett sofőr (becenév van) → nincs név", jarmuvekSorokbol([{ ...SOROK[1], sofor_id: null, sofor_nev: null }])[0].alkalmazottNevek, []);

// ---------------------------------------------------------------------------
// 2. Felismerés a 4 járműves listával.
eq("4. kamion rendszáma szövegben", findJarmuInSzoveg("Rendszám: RXT815 / WKL204", L)?.sofor ?? null, "Pisti");
eq("4. kamion pótkocsija egyedül", findJarmuInSzoveg("WKL-204", L)?.sofor ?? null, "Pisti");
eq("4. kamion elgépelve (1 karakter)", findJarmuInSzoveg("RXT-816", L)?.sofor ?? null, "Pisti");
eq("régi kocsi továbbra is", findJarmuInSzoveg("NMZ492/XZV926", L)?.sofor ?? null, "Micó");
eq("ismert elírás továbbra is", findJarmuInSzoveg("NZM-492", L)?.sofor ?? null, "Micó");
eq("két saját kocsi egy szövegben → nem tippel", findJarmuInSzoveg("AOPU-427 és RXT-815", L), null);
eq("JANI a sofőr nevéből", findJarmuInSzoveg("sofőr: Jani", L)?.kod ?? null, "JANI");
eq("JANI a teljes nevéből", findJarmuInSzoveg("Kiss János", L)?.kod ?? null, "JANI");
eq("JANI a kódjából (rendszám nélkül)", findJarmuByPlate("JANI", L)?.sofor ?? null, "Jani");
eq("kód szerinti keresés", findJarmuByKod("RXT-815", L)?.sofor ?? null, "Pisti");
eq("a régi, nagybetűs JANI-címke is feloldódik", resolveJarmu("Jani — DAF XG (Gyártás alatt)", L)?.kod ?? null, "JANI");
eq("az új címke is", resolveJarmu(jarmuLabel(L[3]), L)?.kod ?? null, "RXT-815");
eq("a 4. kamion a beépített listában NINCS", findJarmuInSzoveg("RXT-815", SAJAT_JARMUVEK), null);

// A betöltött lista regisztrálása: lista-paraméter nélkül is ezt látják a segédek.
jarmuListaBeallitasa(L);
eq("regisztrált lista", jarmuLista().length, 4);
eq("paraméter nélkül is felismeri a 4. kamiont", findJarmuInSzoveg("RXT-815")?.sofor ?? null, "Pisti");
jarmuListaBeallitasa([]);
eq("üres regisztráció → beépített tartalék", jarmuLista(), SAJAT_JARMUVEK);

// ---------------------------------------------------------------------------
// 3. Sofőr ↔ kocsi (irat-jog) — legalább olyan szigorú, mint eddig.
const fuvar = (jarmu: string | null, sofor: string | null = null) => ({ jarmu, sofor });
const jani = findJarmuForEmployee({ id: "13", name: "Kiss János" }, L);
eq("Jani (azonosító szerint) → JANI", jani?.kod ?? null, "JANI");
eq("Jani a saját (rendszám nélküli) kocsija fuvarját látja", jani ? jarmuMatch(jani, fuvar(jarmuLabel(L[2])), L) : null, true);
eq("Jani a régi címkés fuvart is", jani ? jarmuMatch(jani, fuvar("Jani — DAF XG (Gyártás alatt)"), L) : null, true);
eq("Jani NEM látja Gergő fuvarját", jani ? jarmuMatch(jani, fuvar("Gergő — AOPU-427/AOTY-474"), L) : null, false);
eq("Jani NEM látja a 4. kamion fuvarját", jani ? jarmuMatch(jani, fuvar("RXT-815 WKL-204"), L) : null, false);
eq("üres fuvar-mezők → nem az övé", jani ? jarmuMatch(jani, fuvar(null, null), L) : null, false);

const pisti = findJarmuForEmployee({ id: "14", name: "Nagy István" }, L);
eq("4. sofőr → 4. kamion", pisti?.kod ?? null, "RXT-815");
eq("4. sofőr a saját fuvarját látja", pisti ? jarmuMatch(pisti, fuvar("Pisti — RXT-815/WKL-204"), L) : null, true);
eq("4. sofőr Micó fuvarját NEM", pisti ? jarmuMatch(pisti, fuvar("Micó — NMZ-492/XZV-926"), L) : null, false);

eq("járműhöz nem rendelt dolgozó → nincs kocsi", findJarmuForEmployee({ id: "99", name: "Szabó Éva" }, L), null);
// Egy másik dolgozó, akinek a keresztneve egy becenévvel egyezik, de a kocsi
// a törzsadat szerint MÁSÉ: a névegyezés nem írja felül a hozzárendelést.
eq("névegyezés nem győz a hozzárendelés felett", findJarmuForEmployee({ id: "98", name: "Tóth Jani" }, L), null);
eq("azonosító nélkül (régi út) a név dönt", findJarmuForEmployee({ id: null, name: "Vadon Gergő" }, L)?.kod ?? null, "AOPU-427");
const ketszer = jarmuvekSorokbol([SOROK[0], { ...SOROK[3], sofor_id: "11" }]);
eq("két kocsihoz rendelt dolgozó → nem választunk", findJarmuForEmployee({ id: "11", name: "Vadon Gergő" }, ketszer), null);

// A beépített lista viselkedése nem változott (tartalék út).
eq("tartalék: Vadon Gergő → Gergő", findJarmuByEmployeeName("Vadon Gergő", SAJAT_JARMUVEK)?.sofor ?? null, "Gergő");
eq("tartalék: Takács Miklós → Micó", findJarmuByEmployeeName("Takács Miklós", SAJAT_JARMUVEK)?.sofor ?? null, "Micó");
eq("tartalék: Gergőkúti Béla → senki", findJarmuByEmployeeName("Gergőkúti Béla", SAJAT_JARMUVEK), null);

// ---------------------------------------------------------------------------
// 4. Telephely, lejárat, űrlap-ellenőrzés.
eq("indulási pont a tartalék listán: Szakoly", indulasiTelephely(SAJAT_TELEPHELYEK).cim, "Szakoly, Rákóczi utca 26");
eq("indulási pont: a megjelölt", indulasiTelephely([{ nev: "A", cim: "a" }, { nev: "B", cim: "b", indulasiPont: true }]).nev, "B");
eq("parkoló típus a tartalékon", SAJAT_TELEPHELYEK.find((t) => t.nev === "Szakoly (parkoló)")?.tipus, "parkolo");

eq("lejárt", lejaratAllapot("2026-10-09", "2026-10-10"), "lejart");
eq("ma jár le = még nem lejárt", lejaratAllapot("2026-10-10", "2026-10-10"), "hamarosan");
eq("30 napon belül", lejaratAllapot("2026-11-09", "2026-10-10"), "hamarosan");
eq("31 nap múlva rendben", lejaratAllapot("2026-11-10", "2026-10-10"), "rendben");
eq("nincs dátum", lejaratAllapot(null, "2026-10-10"), null);

const alap: JarmuBemenet = {
  kod: "", cimke: "", soforBecenev: "Pisti", vontatoRendszam: "rxt 815", potkocsiId: "", irasvaltozatok: "rxt-81S; ",
  szin: "purple", ecofleetObjectId: "", soforId: "14", fogyasztasL100: "28", euroOsztaly: "EURO6", hugoKategoria: "J5",
  ossztomegT: "40", alapTelephelyPontId: "1", megjegyzes: "", aktiv: true,
};
const t = tisztitJarmu(alap);
eq("kód a vontató rendszámából", t.kod, "RXT815");
eq("GPS nélkül: null", t.ecofleetObjectId, null);
eq("írásváltozatok", t.irasvaltozatok, ["RXT-81S"]);
eq("rendszám nélküli jármű kóddal", tisztitJarmu({ ...alap, kod: "jani", vontatoRendszam: "" }).kod, "JANI");
dob("kód és rendszám nélkül hiba", () => tisztitJarmu({ ...alap, vontatoRendszam: "" }));
dob("becenév nélkül hiba", () => tisztitJarmu({ ...alap, soforBecenev: " " }));
dob("rossz szín", () => tisztitJarmu({ ...alap, szin: "pink" }));
dob("nem szám Ecofleet", () => tisztitJarmu({ ...alap, ecofleetObjectId: "abc" }));
dob("SQL-szerű azonosító", () => tisztitJarmu({ ...alap, soforId: "1; drop" }));
dob("értelmetlen fogyasztás", () => tisztitJarmu({ ...alap, fogyasztasL100: "300" }));
eq("okmány járműhöz", tisztitOkmany({ targy: "jarmu:3", tipus: "kgfb", szam: "", partner: "", lejarat: "2027-01-31", megjegyzes: "" }).jarmuId, "3");
dob("okmány tárgy nélkül", () => tisztitOkmany({ targy: "", tipus: "kgfb", szam: "", partner: "", lejarat: "", megjegyzes: "" }));
dob("okmány rossz típussal", () => tisztitOkmany({ targy: "potkocsi:1", tipus: "x", szam: "", partner: "", lejarat: "", megjegyzes: "" }));
dob("okmány rossz dátummal", () => tisztitOkmany({ targy: "potkocsi:1", tipus: "casco", szam: "", partner: "", lejarat: "31.01.2027", megjegyzes: "" }));

console.log(`\nJármű-törzsadat teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
