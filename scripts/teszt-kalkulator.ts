// A Kalkulátor önköltség- és ajánlat-számításának tesztje (tervvászon D6).
// Futtatás: npx tsx scripts/teszt-kalkulator.ts
//
// Miért fontos: ez a szám dönti el, elvállalunk-e egy fuvart. Ha az
// önköltség alulmér (pl. kimarad az üres km vagy a napi fix), a rendszer
// veszteséges fuvart minősít nyereségesnek.

import {
  szamoljOnkoltseget, ajanlatSavok, minositsAjanlatot, napokMenetidobol, NAPI_KOLTSEG_FT, ALAP_FOGYASZTAS_L100,
} from "@/lib/fuvarozas2/kalkulator-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Vászon-példa: Nyíregyháza → Győr, 285 rakott + 112 üres km, 29,8 l/100,
// 667 Ft/l gázolaj, 41 300 Ft útdíj, 1 nap.
const p = szamoljOnkoltseget({ rakottKm: 285, uresKm: 112, fogyasztasL100: 29.8, gazolajFt: 667, utdijFt: 41300, napok: 1 });
eq("összes km = rakott + üres", p.osszesKm, 397);
eq("üzemanyag = km × l/100 × Ft/l", p.uzemanyagFt, Math.round((397 * 29.8 / 100) * 667));
eq("napi fix egy napra", p.napiFt, NAPI_KOLTSEG_FT);
eq("önköltség = üzemanyag + útdíj + napi", p.osszesenFt, p.uzemanyagFt + 41300 + NAPI_KOLTSEG_FT);
eq("önköltség rakott km-re", p.ftPerRakottKm, Math.round(p.osszesenFt / 285));

// Az üres km NEM hagyható ki: nélküle olcsóbbnak látszik a fuvar.
const uresNelkul = szamoljOnkoltseget({ rakottKm: 285, uresKm: 0, fogyasztasL100: 29.8, gazolajFt: 667, utdijFt: 41300, napok: 1 });
eq("üres km nélkül kisebb az önköltség", uresNelkul.osszesenFt < p.osszesenFt, true);

// Több napos fuvar: a napi fix napokkal szorzódik.
const haromNap = szamoljOnkoltseget({ rakottKm: 900, uresKm: 200, fogyasztasL100: 30, gazolajFt: 650, utdijFt: 90000, napok: 3 });
eq("három nap napi fixe", haromNap.napiFt, 3 * NAPI_KOLTSEG_FT);

// Nulla rakott km: nem osztunk nullával.
eq("nulla rakott km", szamoljOnkoltseget({ rakottKm: 0, uresKm: 50, fogyasztasL100: 30, gazolajFt: 650, utdijFt: 0, napok: 1 }).ftPerRakottKm, null);

// Minősítés: veszteség / határeset / ajánlott.
eq("veszteséges ajánlat", minositsAjanlatot(100000, 150000).minosites, "veszteseges");
eq("veszteség árrése negatív", minositsAjanlatot(100000, 150000).marginSzazalek, -50);
eq("határeset (0–8 % árrés)", minositsAjanlatot(160000, 150000).minosites, "hatareset");
eq("ajánlott (8 % felett)", minositsAjanlatot(200000, 150000).minosites, "ajanlott");
eq("pontosan nulla árrés = határeset", minositsAjanlatot(150000, 150000).minosites, "hatareset");

// Sávok: 500/600/700 Ft rakott km-enként.
const savok = ajanlatSavok(285, 190500);
eq("három sáv", savok.map((s) => s.ftKm), [500, 600, 700]);
eq("500 Ft/km díja", savok[0].dijFt, 142500);
eq("500 Ft/km veszteséges 190 500 önköltségnél", savok[0].minosites, "veszteseges");
eq("700 Ft/km díja", savok[2].dijFt, 199500);

// Napok a menetidőből: 9 óra vezetés naponta.
eq("4 óra = 1 nap", napokMenetidobol(240), 1);
eq("9 óra = 1 nap", napokMenetidobol(540), 1);
eq("10 óra = 2 nap", napokMenetidobol(600), 2);
eq("0 perc is 1 nap", napokMenetidobol(0), 1);

eq("alap fogyasztás értelmes", ALAP_FOGYASZTAS_L100 > 20 && ALAP_FOGYASZTAS_L100 < 45, true);

console.log(`\nKalkulátor teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
