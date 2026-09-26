// A Megbízások munkaasztal szakaszainak és keresőjének tesztje.
// Futtatás: npx tsx scripts/teszt-munkaasztal.ts

import { szakaszSorbol, keresEgyezik, honapKeresoszo, javaslatok, keresSzoveg, keresNapok, type KeresettSor, type KeresoIndex } from "@/lib/fuvarozas2/munkaasztal";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Szakaszok
eq("ellenőrzésre vár → beérkezett", szakaszSorbol({ jelleg: "ber", allapot: "ellenorzesre_var" }), "beerkezett");
eq("tervezett → folyamatban", szakaszSorbol({ jelleg: "ber", allapot: "tervezett" }), "folyamatban");
eq("bér teljesítve → számlázásra", szakaszSorbol({ jelleg: "ber", allapot: "teljesitve" }), "szamlazasra");
eq("saját teljesítve → archív", szakaszSorbol({ jelleg: "sajat", allapot: "teljesitve" }), "archiv");
eq("számlázva → postára", szakaszSorbol({ jelleg: "ber", allapot: "szamlazva" }), "postara");
eq("régi e-mail elment → postára", szakaszSorbol({ jelleg: "ber", allapot: "email_elment" }), "postara");
eq("postázva → archív", szakaszSorbol({ jelleg: "ber", allapot: "postazva" }), "archiv");
eq("előkészítés az állapottól függetlenül", szakaszSorbol({ jelleg: "sajat", allapot: "folyamatban", elokeszites: true }), "elokeszites");
eq("kocsira adott saját → folyamatban", szakaszSorbol({ jelleg: "sajat", allapot: "tervezett", elokeszites: false }), "folyamatban");

// Hónapnevek
eq("szept", honapKeresoszo("szept"), 9);
eq("Okt.", honapKeresoszo("Okt."), 10);
eq("márc ékezettel", honapKeresoszo("márc"), 3);
eq("rövid szó nem hónap", honapKeresoszo("ma"), null);
eq("nem hónap", honapKeresoszo("micó"), null);

// Kereső
const sor: KeresettSor = {
  partner_nev: "ÁB Speed Szállítmányozási Kft.", hivatkozas: "26/3814",
  felrako: "Huncargo Raktár 9400 Sopron,Szappanfőző krt14", lerako: "Coop 4030 Debrecen,Diószegi u . 22 /C",
  jarmu_kod: "NMZ-492", jarmu_cimke: "NMZ-492/XZV-926", sofor: "Takács Micó", szamla_szam: "WLLWR-2026-320",
  aru: "állateledel", felrakas_nap: "2026-09-23", lerakas_nap: "2026-09-24",
};
eq("üres keresés", keresEgyezik(sor, ""), true);
eq("cégnév ékezet nélkül", keresEgyezik(sor, "ab speed"), true);
eq("város", keresEgyezik(sor, "debrecen"), true);
eq("sofőr + város + hónap", keresEgyezik(sor, "micó debrecen szept"), true);
eq("rendszám írásjel nélkül", keresEgyezik(sor, "nmz492"), true);
eq("számlaszám", keresEgyezik(sor, "WLLWR-2026-320"), true);
eq("hivatkozás", keresEgyezik(sor, "3814"), true);
eq("évszám", keresEgyezik(sor, "2026"), true);
eq("rossz hónap", keresEgyezik(sor, "debrecen okt"), false);
eq("kitől (saját fuvar)", keresEgyezik({ ...sor, kitol: "MTS Kft." }, "mts"), true);
eq("más város", keresEgyezik(sor, "győr"), false);
eq("minden szónak illeszkednie kell", keresEgyezik(sor, "micó győr"), false);

// Javaslatok gépelés közben
const index: KeresoIndex = {
  fuvarok: [
    { id: "234", cim: "ÁB Speed Szállítmányozási Kft.", ut: "Sopron → Debrecen", nap: "2026-09-23", szakasz: "postara", szoveg: keresSzoveg(sor), napok: keresNapok(sor) },
    { id: "135", cim: "Ghibli Szállítmányozás", ut: "Gyöngyöshalász → Debrecen", nap: "2026-09-18", szakasz: "archiv",
      szoveg: keresSzoveg({ ...sor, partner_nev: "Ghibli Szállítmányozás", hivatkozas: "N26/22824", felrako: "Gyöngyöshalász", szamla_szam: "WLLWR-2026-310", kieg_szamla_szamok: ["WLLWR-2026-316"], sofor: "Vadon Gergő", jarmu_kod: "AOPU-427", jarmu_cimke: "AOPU-427" }),
      napok: ["2026-09-18"] },
  ],
  cegek: ["ÁB Speed Szállítmányozási Kft.", "Ghibli Szállítmányozás", "Duvenbeck Logisztikai Kft."],
  varosok: ["Sopron", "Debrecen", "Gyöngyöshalász"],
  kocsik: [{ kod: "NMZ-492", cimke: "Micó · NMZ-492" }, { kod: "AOPU-427", cimke: "Gergő · AOPU-427" }],
  szamok: ["WLLWR-2026-320", "WLLWR-2026-310", "WLLWR-2026-316", "26/3814", "N26/22824"],
};
const cimek = (q: string) => javaslatok(index, q).csoportok.map((c) => `${c.cim}:${c.elemek.map((e) => e.cimke).join("|")}`);
eq("1 betű: semmi", javaslatok(index, "d").fuvarok.length + javaslatok(index, "d").csoportok.length, 0);
eq("debr → város + 2 fuvar", [cimek("debr"), javaslatok(index, "debr").fuvarok.map((f) => f.id)], [["Város:Debrecen"], ["234", "135"]]);
eq("ékezet nélkül: gyongy", cimek("gyongy"), ["Város:Gyöngyöshalász"]);
eq("mic → kocsi", cimek("mic"), ["Kocsi:Micó · NMZ-492"]);
eq("316 → kieg. számla + fuvar", [cimek("316"), javaslatok(index, "316").fuvarok.map((f) => f.id)], [["Szám:WLLWR-2026-316"], ["135"]]);
eq("cég elöl a kezdődő", cimek("duv"), ["Cég:Duvenbeck Logisztikai Kft."]);
eq("hónap: debrecen szept", javaslatok(index, "debrecen szept").csoportok.find((c) => c.cim === "Hónap")?.elemek[0], { cimke: "szeptember", q: "debrecen szep" });
eq("gergő → Ghibli-fuvar", javaslatok(index, "gergő").fuvarok.map((f) => f.id), ["135"]);

console.log(`\nMunkaasztal teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
