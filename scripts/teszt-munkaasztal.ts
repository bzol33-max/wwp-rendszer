// A Megbízások munkaasztal szakaszainak és keresőjének tesztje.
// Futtatás: npx tsx scripts/teszt-munkaasztal.ts

import { szakaszSorbol, keresEgyezik, honapKeresoszo, type KeresettSor } from "@/lib/fuvarozas2/munkaasztal";

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
eq("más város", keresEgyezik(sor, "győr"), false);
eq("minden szónak illeszkednie kell", keresEgyezik(sor, "micó győr"), false);

console.log(`\nMunkaasztal teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
