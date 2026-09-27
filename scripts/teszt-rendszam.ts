// Rendszám-felismerés szabad szövegben (lib/fuvarozas/vehicles.ts
// findJarmuInSzoveg). A szétszórt betűs eset (2026-09-26): némelyik irat
// karakterenként, szóközökkel adja a rendszámot, és a beolvasás a sofőr
// mezőbe írja ("N M Z - 4 9 2 , X Z V - 9 2 6", EUCARGO #281) — ilyenkor a
// fuvar kocsi nélkül maradt a munkaasztalon.
//
// Futtatás: npx tsx scripts/teszt-rendszam.ts
import { findJarmuInSzoveg } from "@/lib/fuvarozas/vehicles";

const ESETEK: [string, string | null][] = [
  ["N M Z - 4 9 2 , X Z V - 9 2 6", "Micó"],
  ["A O P U - 4 2 7   A O T Y - 4 7 4", "Gergő"],
  ["NMZ492/XZV926", "Micó"],
  ["Rendszám: AOPU-427 AOTY-474", "Gergő"],
  ["Vadon Gergő", "Gergő"],
  // Két saját kocsi egy szövegben: nem tippelünk.
  ["N M Z - 4 9 2 és A O P U - 4 2 7", null],
  // Nem rendszám, csak számok — és idegen rendszám.
  ["raklap 33 db, 12 34 56", null],
  ["Kiss Péter, XYZ-123", null],
];

let hiba = 0;
for (const [szoveg, vart] of ESETEK) {
  const kapott = findJarmuInSzoveg(szoveg)?.sofor ?? null;
  if (kapott !== vart) {
    hiba++;
    console.error(`HIBA: „${szoveg}” → ${kapott ?? "nincs"} (várt: ${vart ?? "nincs"})`);
  }
}
console.log(hiba === 0 ? `rendszám-felismerés: ${ESETEK.length}/0 rendben` : `rendszám-felismerés: ${hiba} hibás eset`);
process.exit(hiba === 0 ? 0 : 1);
