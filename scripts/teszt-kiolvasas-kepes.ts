// Képes kiolvasás — a gyanú-szabályok (lib/fuvarozas/kiolvasas-kepes-alap.ts).
// Futtatás: npx tsx scripts/teszt-kiolvasas-kepes.ts
import { gyanusPontok, type KepesValasz } from "@/lib/fuvarozas/kiolvasas-kepes-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const SZOVEG = `Felrakóhely: Trivium Packaking Hungary kft HU,4562 Vaja,Rohodi u.1-3
Felrakás ideje: 2026.11.16 Lerakóhely: Bonduelle Central Europe Kft HU,4432 Nyírszőlős Buji u.2.
Fuvardíj: 50.000 ft + Áfa`;

const alap = (x: Partial<KepesValasz>): KepesValasz => ({
  megrendelo: { ertek: "FERSPED Kft", idezet: "FERSPED KFT H-4563 Rohod", hol: "fejlec" },
  megrendeloAdoszam: "11246495-2-15",
  pozicioszam: { ertek: null, idezet: null, hol: "nincs" },
  fuvardij: { ertek: "50000", penznem: "Ft", idezet: "Fuvardíj: 50.000 ft + Áfa", hol: "szoveg" },
  aru: "Üres doboz",
  megallok: [
    { tipus: "felrako", ceg: "Trivium", cim: "4562 Vaja, Rohodi u. 1-3", nap: "2026-11-16", ido: null, idezet: "HU,4562 Vaja,Rohodi u.1-3" },
    { tipus: "lerako", ceg: "Bonduelle", cim: "4432 Nyírszőlős, Buji u. 2.", nap: "2026-11-16", ido: null, idezet: "HU,4432 Nyírszőlős Buji u.2." },
  ],
  ...x,
});

eq("FERSPED: képes fejlécből jött megrendelő nem gyanús, ha a szövegben nincs", gyanusPontok(alap({}), SZOVEG), []);
eq("szöveg-forrású, de a szövegben nem szereplő megrendelő → gyanús",
  gyanusPontok(alap({ megrendelo: { ertek: "Bonduelle", idezet: "Megbízó: Bonduelle Kft", hol: "szoveg" } }), SZOVEG),
  ["megrendelő: az idézet nincs az irat szövegében"]);
eq("kitalált díj-idézet → gyanús",
  gyanusPontok(alap({ fuvardij: { ertek: "60000", penznem: "Ft", idezet: "Fuvardíj: 60.000 Ft", hol: "szoveg" } }), SZOVEG),
  ["fuvardíj: az összeg nincs az irat szövegében"]);
eq("díj tizedesekkel (450,00) és tagolva (50.000) is megtalálva",
  gyanusPontok(alap({ fuvardij: { ertek: "50000.00", penznem: "Ft", idezet: null, hol: "szoveg" } }), SZOVEG), []);
eq("cím nélküli megálló → gyanús",
  gyanusPontok(alap({ megallok: [{ ...alap({}).megallok[0], cim: null }, alap({}).megallok[1]] }), SZOVEG),
  ["felrakó: nincs cím"]);
eq("a szövegben nem szereplő település → gyanús",
  gyanusPontok(alap({ megallok: [alap({}).megallok[0], { ...alap({}).megallok[1], cim: "1095 Budapest, Soroksári út 44" }] }), SZOVEG),
  ["lerakó (1095 Budapest, Soroksári út 44): a cím nincs az irat szövegében"]);
eq("hiányzó megrendelő és lerakó",
  gyanusPontok(alap({ megrendelo: { ertek: null, idezet: null, hol: "nincs" }, megallok: [alap({}).megallok[0]] }), SZOVEG),
  ["megrendelő: nem található", "nincs lerakó"]);
eq("lerakás a felrakás előtt",
  gyanusPontok(alap({ megallok: [{ ...alap({}).megallok[0], nap: "2026-11-17" }, alap({}).megallok[1]] }), SZOVEG),
  ["lerakás (2026-11-16) a felrakás (2026-11-17) előtt"]);
eq("cím a hasábos szövegben szétszórva is igazolt (irányítószám)",
  gyanusPontok(alap({ megallok: [{ ...alap({}).megallok[0], cim: "Vaja\n4562 Rohodi utca 1" }, alap({}).megallok[1]] }), SZOVEG), []);

console.log(`teszt-kiolvasas-kepes: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
