// A bérfuvar-szerkesztő ellenőrzéseinek tesztje. Futtatás: npx tsx scripts/teszt-berfuvar.ts
import { berFuvarHiba, berSzam, uresBerFuvar, valtozottMezok } from "@/lib/fuvarozas2/berfuvar";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const jo = { ...uresBerFuvar("2026-09-30"), felrako: "Sopron", lerako: "Debrecen", fuvardij: "240 000" };
eq("jó adat", berFuvarHiba(jo), null);
eq("dátum nélkül", berFuvarHiba({ ...jo, datum: "" }), "Add meg a dátumot.");
eq("lerakó nélkül", berFuvarHiba({ ...jo, lerako: " " }), "Add meg a felrakó és a lerakó helyet.");
eq("lerakás a felrakás előtt", berFuvarHiba({ ...jo, lerakasDatum: "2026-09-29" }), "A lerakás nem lehet a felrakás előtt.");
eq("lerakás másnap", berFuvarHiba({ ...jo, lerakasDatum: "2026-10-01" }), null);
eq("hibás díj", berFuvarHiba({ ...jo, fuvardij: "sok" }), "A fuvardíj nem szám.");
eq("szám: szóközzel", berSzam("240 000"), 240000);
eq("szám: ezres ponttal", berSzam("1.250.000"), 1250000);
eq("szám: tizedesvessző", berSzam("1250,5"), 1250.5);
eq("szám: EUR tizedesponttal", berSzam("850.50"), 850.5);
eq("szám: üres", berSzam(""), null);
eq("szám: negatív", berSzam("-5"), "hibas");
eq("változott mezők", valtozottMezok(jo, { ...jo, jarmu: "Gergő", megjegyzes: "x" }), ["jarmu", "megjegyzes"]);
eq("nem változott (szóköz)", valtozottMezok(jo, { ...jo, felrako: "Sopron " }), []);

console.log(`\nBérfuvar teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
