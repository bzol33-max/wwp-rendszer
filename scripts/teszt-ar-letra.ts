// Az egységes árlétra tesztje (lib/fuvarozas2/ar-letra.ts).
// Futtatás: npx tsx scripts/teszt-ar-letra.ts
//
// Tulajdonosi szabály (2026-10-11): önköltség látszik; minimum = önköltség
// +10%, aztán +20% és +30%; minden ár felfelé 1 000 Ft-ra, EUR-ban 10 €-ra.
import { arLetra, eurFelfele, felfeleKerekit, LETRA_SZAZALEKOK, MIN_ARRES_SZAZALEK } from "@/lib/fuvarozas2/ar-letra";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Sorrend és fokok.
eq("három fok, 10/20/30", LETRA_SZAZALEKOK, [10, 20, 30]);
eq("a minimum a +10%", MIN_ARRES_SZAZALEK, 10);

// 190 500 Ft önköltség, 400 Ft/EUR.
{
  const l = arLetra(190500, 400);
  eq("önköltség marad", l.onkoltsegFt, 190500);
  eq("önköltség EUR", l.onkoltsegEur, 477); // 476,25 → 477
  eq("Ft fokok (1 000-re fel)", l.fokok.map((f) => f.ft), [210000, 229000, 248000]); // 209 550 / 228 600 / 247 650
  eq("EUR fokok (10-re fel)", l.fokok.map((f) => f.eur), [530, 580, 620]); // 523,9 / 571,5 / 619,1
  eq("százalékok", l.fokok.map((f) => f.szazalek), [10, 20, 30]);
  eq("szigorúan növekvő", l.fokok.every((f, i) => i === 0 || f.ft >= l.fokok[i - 1].ft), true);
  eq("minden fok ≥ önköltség × (1+p)", l.fokok.every((f) => f.ft >= (190500 * (100 + f.szazalek)) / 100), true);
}

// Pontos többszörös: nem ugrik a következő lépcsőre (lebegőpontos zaj).
eq("100 000 × 1,1 = 110 000 pontosan", arLetra(100000, null).fokok[0].ft, 110000);
eq("1 Ft-tal fölötte → következő ezer", arLetra(100001, null).fokok[0].ft, 111000); // 110 001,1
eq("100 000 × 1,3 = 130 000 pontosan", arLetra(100000, null).fokok[2].ft, 130000);
eq("EUR pontos többszörös", eurFelfele(40000, 400), 100);
eq("EUR 1 centtel fölötte → következő 10", eurFelfele(40004, 400), 110); // 100,01 €
eq("EUR centen aluli zaj nem lép", eurFelfele(40001, 400), 100); // 100,0025 €

// EUR árfolyam nélkül.
{
  const l = arLetra(190500, null);
  eq("nincs árfolyam: EUR null", l.fokok.map((f) => f.eur), [null, null, null]);
  eq("nincs árfolyam: önköltség EUR null", l.onkoltsegEur, null);
  eq("nincs árfolyam: Ft megvan", l.fokok[0].ft, 210000);
  eq("0 árfolyam = nincs", arLetra(190500, 0).eurArfolyam, null);
}

// 0 önköltség (és hibás bemenet).
eq("0 önköltség: minden 0", arLetra(0, 400).fokok.map((f) => [f.ft, f.eur]), [[0, 0], [0, 0], [0, 0]]);
eq("negatív önköltség = 0", arLetra(-5000, 400).onkoltsegFt, 0);
eq("NaN önköltség = 0", arLetra(Number.NaN, null).fokok[0].ft, 0);

// Kerekítő.
eq("felfelé 1 000-re", felfeleKerekit(1, 1000), 1000);
eq("felfelé 10-re", felfeleKerekit(531, 10), 540);
eq("0 → 0", felfeleKerekit(0, 5000), 0);

console.log(`teszt-ar-letra: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
