// A bankkivonat-partner ↔ számla-vevő névegyezés tesztje (audit BIZ-9).
//
// Futtatás:  npx tsx scripts/teszt-kontokivonat-nev.ts

import { nevEgyezik } from "@/lib/szamlak/kontokivonat-parositas";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (kapott === vart) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}: várt ${vart}, kapott ${kapott}`);
  }
}

eq("azonos név, cégforma eltér", nevEgyezik("RBT EUROPE KFT", "RBT EUROPE Kft."), true);
eq("bank összevonja a szóközt", nevEgyezik("ABSPEED SZALLITMANYOZASI KFT", "ÁB SPEED Szállítmányozási Kft."), true);
eq("ékezet és pont", nevEgyezik("HAJDUSPEDICIO KFT.", "Hajdúspedíció Kft."), true);
eq("bank levágja a végét", nevEgyezik("FLOTT-TRANS KFT", "FLOTT-TRANS Kereskedelmi és Szolgáltató Kft."), true);
eq("csak az általános első szó egyezik", nevEgyezik("EURO CARGO KFT", "EURO PALLET KFT"), false);
eq("csak TRANS egyezik", nevEgyezik("TRANS SPED KFT", "TRANS LOG KFT"), false);
eq("teljesen más", nevEgyezik("DS SMITH PACKAGING", "KUEHNE NAGEL"), false);
eq("rövid, de megkülönböztető", nevEgyezik("BHS TRANS KFT", "BHS Trans Kft."), true);

console.log(`\nKontókivonat-névegyezés teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
