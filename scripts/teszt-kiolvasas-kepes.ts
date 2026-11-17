// Képes kiolvasás — a gyanú-szabályok (lib/fuvarozas/kiolvasas-kepes-alap.ts).
// Futtatás: npx tsx scripts/teszt-kiolvasas-kepes.ts
import { datumASzovegben, gyanusPontok, importGyanu, kiolvasottIgazolas, megalloCimPotlas, type KepesValasz } from "@/lib/fuvarozas/kiolvasas-kepes-alap";

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

eq("cím a cégnévből: HU,irsz előtag", megalloCimPotlas({ ceg: "Trivium Packaking Hungary kft HU,4562 Vaja,Rohodi u.1-3", cim: null }),
  { ceg: "Trivium Packaking Hungary kft", cim: "HU,4562 Vaja,Rohodi u.1-3" });
eq("cím a cégnévből: előtag nélkül", megalloCimPotlas({ ceg: "Metál Sheet Kft, 4000 Debrecen, Apafa", cim: null }),
  { ceg: "Metál Sheet Kft", cim: "4000 Debrecen, Apafa" });
eq("meglévő címet nem bánt", megalloCimPotlas({ ceg: "X Kft 1234", cim: "Győr" }), { ceg: "X Kft 1234", cim: "Győr" });
eq("irányítószám nélkül nem talál ki címet", megalloCimPotlas({ ceg: "Coca-Cola HBC", cim: null }), { ceg: "Coca-Cola HBC", cim: null });
// napi import forrás-ellenőrzése
eq("import: jó fel-/lerakó és díj → nincs gyanú", importGyanu({ felrako: "4562 Vaja, Rohodi u. 1-3", lerako: "Nyírszőlős", fuvardij: 50000 }, SZOVEG), []);
eq("import: az iratban nem szereplő felrakó (A1P-féle kitalált megálló) gyanús",
  importGyanu({ felrako: "1095 Budapest, Soroksári út 44", lerako: null, fuvardij: null }, SZOVEG),
  ["a felrakó („1095 Budapest, Soroksári út 44”) nem található az iratban"]);
eq("import: rossz díj", importGyanu({ fuvardij: 60000 }, SZOVEG), ["a fuvardíj (60000) nem található az iratban"]);
eq("import: EUR tizedessel", importGyanu({ fuvardij: "450.00" }, "Fuvardij / Freight price 450,00 EUR"), []);
// dátum az iratban (Duvenbeck, FERSPED, FLOTT írásmódok)
eq("dátum: 16.11.2026", datumASzovegben("2026-11-16", "PV: 16.11.2026 00:00 Unloading"), true);
eq("dátum: 2026 11.16.", datumASzovegben("2026-11-16", "Lerakás ideje: 2026 11.16."), true);
eq("dátum: 2026.11.16", datumASzovegben("2026-11-16", "Felrakás ideje: 2026.11.16"), true);
eq("dátum: hiányzik", datumASzovegben("2026-11-13", "PV: 16.11.2026 00:00"), false);
eq("igazolás: #373 felrakás igazolt, kézi lerakás (11.13.) nem",
  kiolvasottIgazolas({ datum: "2026-11-13", lerakasDatum: "2026-11-16" }, "PV: 13.11.2026 14:00 Loading PV: 16.11.2026 00:00 Unloading"),
  { datum: true, lerakasDatum: true });
console.log(`teszt-kiolvasas-kepes: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
