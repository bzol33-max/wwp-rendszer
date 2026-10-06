// Saját fuvar duplikátum-szűrő tesztje.
// Futtatás: npx tsx scripts/teszt-sajat-duplikatum.ts
//
// Valós minta: 2026-10-05, Fabrika 2000 Kft, Tata → Tompaládony, AOPU-427 —
// #274 (előre beírva, 10.01-én kézzel lezárva) és #295 (a tényleges út).

import { duplikatumSor, keresDuplikatumot, varosKulcs, type DuplikatumJelolt, type DuplikatumUj } from "@/lib/fuvarozas2/sajat-duplikatum";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const f274: DuplikatumJelolt = {
  id: "274", datum: "2026-10-05", jarmu: "Gergő — AOPU-427/AOTY-474",
  felrako: "2890 Tata, Ipari park 1.", lerako: "Fabrika, 9662 Tompaládony 0117/8 hrsz.",
  partner: "Fabrika 2000 Kft", allapot: "Lezárt",
};
const uj: DuplikatumUj = { datum: "2026-10-05", jarmuKod: "AOPU-427", honnan: "Tata", hova: "9662 Tompaládony" };
const idk = (l: DuplikatumJelolt[]) => l.map((j) => j.id);

eq("városkulcs: irányítószám, utca, ékezet nélkül", varosKulcs("2890 TATA, Ipari park 1."), varosKulcs("Tata"));
eq("városkulcs: a cégnév előtte", varosKulcs(f274.lerako), varosKulcs("Tompaládony"));

eq("valós eset: #295 mentésekor a #274 előjön", idk(keresDuplikatumot(uj, [f274])), ["274"]);
eq("±1 nap is", idk(keresDuplikatumot({ ...uj, datum: "2026-10-06" }, [f274])), ["274"]);
eq("2 nap már nem", idk(keresDuplikatumot({ ...uj, datum: "2026-10-07" }, [f274])), []);
eq("másik kocsi nem", idk(keresDuplikatumot({ ...uj, jarmuKod: "NMZ-492" }, [f274])), []);
eq("az új kocsi nélkül → gyanús", idk(keresDuplikatumot({ ...uj, jarmuKod: null }, [f274])), ["274"]);
eq("a meglévő kocsi nélkül → gyanús", idk(keresDuplikatumot(uj, [{ ...f274, jarmu: null }])), ["274"]);
eq("pótkocsi rendszáma is ugyanaz a kocsi", idk(keresDuplikatumot({ ...uj, jarmuKod: "AOTY-474" }, [f274])), ["274"]);
eq("másik lerakó-város nem", idk(keresDuplikatumot({ ...uj, hova: "Győr" }, [f274])), []);
eq("másik felrakó-város nem", idk(keresDuplikatumot({ ...uj, honnan: "Komárom" }, [f274])), []);
eq("fordított irány nem", idk(keresDuplikatumot({ ...uj, honnan: "Tompaládony", hova: "Tata" }, [f274])), []);
eq("dátum nélküli jelölt nem", idk(keresDuplikatumot(uj, [{ ...f274, datum: null }])), []);
eq("üres honnan → nem keres", idk(keresDuplikatumot({ ...uj, honnan: "" }, [f274])), []);
eq("hibás dátum → nem keres", idk(keresDuplikatumot({ ...uj, datum: "" }, [f274])), []);
eq("több találat mind", idk(keresDuplikatumot(uj, [f274, { ...f274, id: "295", allapot: "Előkészítés" }, { ...f274, id: "300", lerako: "Pápa" }])), ["274", "295"]);
eq("figyelmeztető sor", duplikatumSor(f274), "#274 · Fabrika 2000 Kft · 2026-10-05 · Lezárt");

console.log(`\nSaját fuvar duplikátum teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
