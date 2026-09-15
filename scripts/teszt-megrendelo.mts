// A "saját cégünk sosem lehet megrendelő" őr tesztje.
//
// Futtatás:  npx tsx scripts/teszt-megrendelo.mts
//
// A fuvarmegbízás-sablonok a megbízó és a megbízott adatait egymás mellé
// teszik, a PDF-ből kiolvasva pedig a két címke egy sorba csúszik:
//
//   Megbízó adatai:                    Megbízott adatai:
//   ÁB Speed Szállítmányozási Kft.     Well Worn Pallett Kft
//
// A nyelvi modell ilyenkor rendszeresen a rosszat választja. Drive-ból érkező
// megbízáson viszont MI vagyunk a megbízott — azt épp nekünk adták ki.

import { sajatCegunkE } from "@/lib/fuvarozas/fuvar-constants";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (kapott === vart) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

// A saját cégünk minden előforduló írásmódja — a megbízók következetlenül írják.
for (const nev of [
  "Well Worn Pallett Kft",
  "Well-Worn Pallet Kft.",
  "Well Worn Pallet Kft.",
  "WELL-WORN PALLETT KFT",
  "well worn pallet",
  "  Well-Worn  Pallett  Kft  ",
]) {
  eq(`saját cég: "${nev}"`, sajatCegunkE(nev), true);
}

// Valódi megrendelők — ezeket soha nem szabad kiszűrni.
for (const nev of [
  "ÁB Speed Szállítmányozási Kft.",
  "Duvenbeck Logisztikai Kft.",
  "FIEGE Szállítmányozási és Logisztikai Kft.",
  "Waberer's Zrt.",
  "Well Trans Kft.",
  "Worn Pallet Trade Kft.",
]) {
  eq(`idegen cég: "${nev}"`, sajatCegunkE(nev), false);
}

eq("üres", sajatCegunkE(""), false);
eq("null", sajatCegunkE(null), false);
eq("undefined", sajatCegunkE(undefined), false);

console.log(`${ok} rendben, ${bad} hiba`);
process.exit(bad ? 1 : 0);
