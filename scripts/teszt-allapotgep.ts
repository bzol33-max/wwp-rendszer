// A Fuvarozás 2 állapotgép táblázat-vezérelt tesztje (átállás-ellenőrzés
// B3 / E2, a 11.1 fejezet 16 átmenete és tiltott élei).
//
// Futtatás:  npx tsx scripts/teszt-allapotgep.ts
//
// Három rész: (1) minden engedett él a megfelelő forrással és kontextussal
// átmegy; (2) minden tiltott él — és minden olyan pár, ami nincs a táblában —
// elutasítva; (3) a három teljes életút (bér fuvar, saját fuvar, „nem kér
// postát" partner) végigjárható, és sehol nem lehet lezárni feltétel nélkül.

import {
  ALLAPOTOK,
  ATMENETEK,
  ellenorizAtmenet,
  induloAllapot,
  lehetsegesCelok,
  type Allapot,
  type AtmenetForras,
  type AtmenetKontextus,
} from "@/lib/fuvarozas/allapot";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}
const enged = (nev: string, h: Allapot, c: Allapot, f: AtmenetForras, k?: AtmenetKontextus) =>
  eq(nev, ellenorizAtmenet(h, c, f, k).ok, true);
const tilt = (nev: string, h: Allapot, c: Allapot, f: AtmenetForras, k?: AtmenetKontextus) =>
  eq(nev, ellenorizAtmenet(h, c, f, k).ok, false);

// Egy „minden feltétel teljesül" kontextus a bér fuvarhoz — az élek ettől
// függetlenül csak a saját forrásukkal mehetnek.
const teljes: AtmenetKontextus = { fotoVan: true, szamlaVan: true, emailElment: true, papirBeerkezett: true, postazva: true };

// 1. Engedett élek (11.1 tábla, soronként).
eq("1. él: hiánylistával ellenőrzésre vár", induloAllapot(true), "ellenorzesre_var");
eq("2. él: teljes adattal tervezett", induloAllapot(false), "tervezett");
enged("3. jóváhagyás", "ellenorzesre_var", "tervezett", "ember");
enged("4. auto-jóváhagyás GPS-érintésre", "ellenorzesre_var", "folyamatban", "gps");
enged("4. auto-jóváhagyás sofőr-pipára", "ellenorzesre_var", "folyamatban", "sofor");
enged("5. tervezett → folyamatban (gps)", "tervezett", "folyamatban", "gps");
enged("6. folyamatban → teljesítve (sofőr Kész)", "folyamatban", "teljesitve", "sofor");
enged("7. fotó → számlázható", "teljesitve", "szamlazhato", "rendszer", { fotoVan: true });
enged("8. számla párosítva → számlázva", "szamlazhato", "szamlazva", "rendszer", { szamlaVan: true });
enged("9. e-mail elment", "szamlazva", "email_elment", "rendszer");
enged("10. postázva, papír beérkezett", "email_elment", "postazva", "ember", { papirBeerkezett: true });
enged("11. lezárás mind a négy feltétellel", "postazva", "lezart", "rendszer", teljes);
enged("12. saját fuvar rövid út", "teljesitve", "lezart", "rendszer", { sajatFuvar: true, szallitolevelParositva: true });
enged("13. partner nem kér e-mailt/postát", "szamlazva", "lezart", "rendszer", { partnerNemKerEmailt: true, partnerNemKerPostat: true });
enged("14. visszaállítás tervezettre GPS nélkül", "folyamatban", "tervezett", "ember", { gpsErintesVolt: false });
enged("15. fotó visszavonása", "szamlazhato", "teljesitve", "ember");
enged("15. számla visszavonása", "szamlazva", "teljesitve", "ember");
enged("16. lezárt visszaállítása", "lezart", "postazva", "ember");

// 2. Tiltott élek — a 11.1 felsorolás + a feltételek hiánya + rossz forrás.
tilt("tervezett → teljesítve (megálló nélkül)", "tervezett", "teljesitve", "ember", teljes);
tilt("teljesítve → számlázva (fotó/számlázható nélkül)", "teljesitve", "szamlazva", "ember", teljes);
tilt("ellenőrzésre vár → számlázható", "ellenorzesre_var", "szamlazhato", "rendszer", teljes);
tilt("lezárt → ellenőrzésre vár", "lezart", "ellenorzesre_var", "ember", teljes);
tilt("törölt soron semmi", "tervezett", "folyamatban", "gps", { torolt: true });
tilt("ugyanaz az állapot", "tervezett", "tervezett", "ember");
tilt("7. fotó nélkül nem számlázható", "teljesitve", "szamlazhato", "rendszer", {});
tilt("7. saját fuvar nem számlázható", "teljesitve", "szamlazhato", "rendszer", { sajatFuvar: true, fotoVan: true });
tilt("8. számla nélkül nem számlázva", "szamlazhato", "szamlazva", "rendszer", {});
tilt("10. papír nélkül nem postázható", "email_elment", "postazva", "ember", {});
tilt("11. e-mail nélkül nincs lezárás", "postazva", "lezart", "rendszer", { ...teljes, emailElment: false });
tilt("11. papír nélkül nincs lezárás", "postazva", "lezart", "rendszer", { ...teljes, papirBeerkezett: false });
tilt("12. bér fuvarnak nincs rövid út", "teljesitve", "lezart", "rendszer", { szallitolevelParositva: true });
tilt("12. saját fuvar szállítólevél nélkül nem zárható", "teljesitve", "lezart", "rendszer", { sajatFuvar: true });
tilt("13. ha csak az e-mailt nem kéri", "szamlazva", "lezart", "rendszer", { partnerNemKerEmailt: true });
tilt("14. GPS-érintés után nincs visszaállítás", "folyamatban", "tervezett", "ember", { gpsErintesVolt: true });
tilt("3. jóváhagyást a GPS nem adhat", "ellenorzesre_var", "tervezett", "gps");
tilt("10. postázást a rendszer nem jelölhet", "email_elment", "postazva", "rendszer", { papirBeerkezett: true });
tilt("14. visszaállítást csak ember", "folyamatban", "tervezett", "gps", { gpsErintesVolt: false });
tilt("16. lezárt visszaállítását csak ember", "lezart", "postazva", "rendszer");

// Minden olyan (honnan, hova) pár, ami nincs a táblában, tiltott — teljes
// kontextussal és minden forrással sem mehet.
const tablaban = new Set(ATMENETEK.map((a) => `${a.honnan}>${a.hova}`));
let parok = 0;
for (const h of ALLAPOTOK)
  for (const c of ALLAPOTOK) {
    if (h === c || tablaban.has(`${h}>${c}`)) continue;
    for (const f of ["rendszer", "ember", "gps", "sofor", "migracio"] as const) {
      parok++;
      if (ellenorizAtmenet(h, c, f, { ...teljes, sajatFuvar: true, szallitolevelParositva: true, partnerNemKerEmailt: true, partnerNemKerPostat: true }).ok) {
        bad++;
        console.log(`  HIBA  táblán kívüli él átment: ${h} → ${c} (${f})`);
      }
    }
  }
ok++;
console.log(`  (táblán kívüli párok ellenőrizve: ${parok})`);

// 3. Teljes életutak.
function utvonal(nev: string, lepesek: [Allapot, AtmenetForras, AtmenetKontextus][], indulo: Allapot) {
  let a = indulo;
  for (const [cel, f, k] of lepesek) {
    const e = ellenorizAtmenet(a, cel, f, k);
    if (!e.ok) {
      bad++;
      console.log(`  HIBA  ${nev}: ${a} → ${cel} (${f}): ${e.hiba}`);
      return;
    }
    a = cel;
  }
  eq(`${nev}: végállapot`, a, "lezart");
}
utvonal("bér fuvar teljes út", [
  ["tervezett", "ember", {}],
  ["folyamatban", "gps", {}],
  ["teljesitve", "gps", {}],
  ["szamlazhato", "rendszer", { fotoVan: true }],
  ["szamlazva", "rendszer", { szamlaVan: true }],
  ["email_elment", "rendszer", {}],
  ["postazva", "ember", { papirBeerkezett: true }],
  ["lezart", "rendszer", teljes],
], "ellenorzesre_var");
utvonal("saját fuvar rövid út", [
  ["folyamatban", "sofor", {}],
  ["teljesitve", "sofor", {}],
  ["lezart", "rendszer", { sajatFuvar: true, szallitolevelParositva: true }],
], "tervezett");
utvonal("partner nem kér e-mailt/postát", [
  ["folyamatban", "gps", {}],
  ["teljesitve", "gps", {}],
  ["szamlazhato", "ember", { fotoVan: true }],
  ["szamlazva", "ember", { szamlaVan: true }],
  ["lezart", "rendszer", { partnerNemKerEmailt: true, partnerNemKerPostat: true }],
], "tervezett");

// lehetsegesCelok az UI-hoz: a sofőr a teljesített fuvaron nem lát gombot.
eq("sofőr céljai teljesítve-n", lehetsegesCelok("teljesitve", "sofor", teljes), []);
eq("ember céljai számlázva-n (teljes ctx)", lehetsegesCelok("szamlazva", "ember", { ...teljes, partnerNemKerEmailt: true, partnerNemKerPostat: true }).sort(), ["email_elment", "lezart", "teljesitve"]);

console.log(`\nÁllapotgép teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
