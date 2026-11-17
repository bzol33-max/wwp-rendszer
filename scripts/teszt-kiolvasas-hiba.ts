// Kiolvasási hibák (Rendszer lap) — a tiszta összesítő szabályai.
// Futtatás: npx tsx scripts/teszt-kiolvasas-hiba.ts
import { kiolvasasHibaOsszesit } from "@/lib/fuvarozas2/rendszer-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const r = kiolvasasHibaOsszesit([
  { id: "1", partner: "FERSPED", torolt: false, mezok: ["megrendelo", "lerako"] },
  { id: "2", partner: "FERSPED", torolt: false, mezok: [] },
  { id: "3", partner: "HAPP", torolt: false, mezok: ["jarmu", "sofor", "megjegyzes", "koltseg"] },
  { id: "4", partner: "HAPP", torolt: false, mezok: ["fuvardij", "fuvardijPenznem"] },
  { id: "5", partner: "RBT", torolt: false, mezok: ["pozicioszam", "pozicioszamNincs", "datum"] },
  { id: "6", partner: "RBT", torolt: true, mezok: ["megrendelo"] },
]);
eq("importált = a nem törölt sorok", r.importalt, 5);
eq("törölt külön számolva", r.torolt, 1);
eq("hibás: csak kiolvasott mező számít (kocsi/sofőr/költség/megjegyzés nem)", r.hibas, 3);
eq("egy megbízás egy címkét egyszer ad (pozíciószám + nincs-jelölő = 1; díj + pénznem = 1)",
  r.mezonkent, [
    { cimke: "Dátum / időpont", db: 1 }, { cimke: "Fuvardíj", db: 1 }, { cimke: "Lerakó", db: 1 },
    { cimke: "Megrendelő", db: 1 }, { cimke: "Pozíciószám", db: 1 },
  ]);
eq("partnerenként csak a hibás partnerek, a törölt sor nélkül", r.partnerenkent.map((p) => [p.partner, p.hibas, p.importalt]),
  [["FERSPED", 1, 2], ["HAPP", 1, 2], ["RBT", 1, 1]]);
eq("üres bemenet", kiolvasasHibaOsszesit([]), { importalt: 0, hibas: 0, torolt: 0, mezonkent: [], partnerenkent: [] });

console.log(`teszt-kiolvasas-hiba: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
