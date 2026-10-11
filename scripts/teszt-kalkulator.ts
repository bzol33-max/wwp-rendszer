// A Kalkulátor önköltség- és ajánlat-számításának tesztje (tervvászon D6).
// Futtatás: npx tsx scripts/teszt-kalkulator.ts
//
// Miért fontos: ez a szám dönti el, elvállalunk-e egy fuvart. Ha az
// önköltség alulmér (pl. kimarad az üres km vagy a napi fix), a rendszer
// veszteséges fuvart minősít nyereségesnek.

import {
  szamoljOnkoltseget, minositsAjanlatot, napokMenetidobol, valasszFogyasztast, ervenyesUzemanyagMeres, ervenyesNapokOsszege,
  NAPI_KOLTSEG_FT, ALAP_FOGYASZTAS_L100, MERES_MIN_KM, SAJAT_FUVAR_KM_DIJ_FT,
} from "@/lib/fuvarozas2/kalkulator-alap";
import { FUVAR_BEALLITAS_ALAP, fuvarBeallitasokSorokbol } from "@/lib/beallitasok/fuvar-alap";

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

// Minősítés (2026-10-11, árlétra): 0 alatt veszteséges, az önköltség +10%-a
// alatt határeset, fölötte ajánlott. A százalék az ÖNKÖLTSÉGRE vetített felár
// (régen a díjhoz mért 8% volt a küszöb, és voltak 500/600/700 Ft/km sávok).
eq("veszteséges ajánlat", minositsAjanlatot(100000, 150000).minosites, "veszteseges");
eq("veszteség felára negatív (önköltséghez)", minositsAjanlatot(100000, 150000).marginSzazalek, -33);
eq("határeset (0–10 % felár)", minositsAjanlatot(160000, 150000).minosites, "hatareset");
eq("határeset: 9,9 %", minositsAjanlatot(164850, 150000).minosites, "hatareset");
eq("pontosan +10 % = ajánlott", minositsAjanlatot(165000, 150000).minosites, "ajanlott");
eq("ajánlott (10 % felett)", minositsAjanlatot(200000, 150000).minosites, "ajanlott");
eq("ajánlott felára", minositsAjanlatot(200000, 150000).marginSzazalek, 33);
eq("pontosan nulla árrés = határeset", minositsAjanlatot(150000, 150000).minosites, "hatareset");
eq("0 önköltség, van díj = ajánlott", minositsAjanlatot(50000, 0).minosites, "ajanlott");

// Napok a menetidőből: 9 óra vezetés naponta.
eq("4 óra = 1 nap", napokMenetidobol(240), 1);
eq("9 óra = 1 nap", napokMenetidobol(540), 1);
eq("10 óra = 2 nap", napokMenetidobol(600), 2);
eq("0 perc is 1 nap", napokMenetidobol(0), 1);

eq("alap fogyasztás értelmes", ALAP_FOGYASZTAS_L100 > 20 && ALAP_FOGYASZTAS_L100 < 45, true);

// Tulajdonosi döntés (2026-10-10): alap 28 l/100 km, a mért érték csak 300 mért km FÖLÖTT számít.
eq("alap fogyasztás 28 l/100", ALAP_FOGYASZTAS_L100, 28);
eq("mérési küszöb 300 km", MERES_MIN_KM, 300);
eq("napi költség alap 50 000", NAPI_KOLTSEG_FT, 50000);
eq("saját fuvar km-díj alap 550", SAJAT_FUVAR_KM_DIJ_FT, 550);
eq("299 mért km → alapérték", valasszFogyasztast({ mertKm: 299, mertLiter: 100 }), { l100: 28, mert: false });
eq("pontosan 300 km → még alapérték", valasszFogyasztast({ mertKm: 300, mertLiter: 100 }), { l100: 28, mert: false });
eq("301 km → mért", valasszFogyasztast({ mertKm: 301, mertLiter: 90.3 }), { l100: 30, mert: true });
eq("0 liter (nem mér a szonda) → alapérték", valasszFogyasztast({ mertKm: 5000, mertLiter: 0 }), { l100: 28, mert: false });
eq("jármű saját alapértéke", valasszFogyasztast({ mertKm: 50, mertLiter: 20, alapL100: 31 }), { l100: 31, mert: false });
eq("beállított küszöb", valasszFogyasztast({ mertKm: 150, mertLiter: 45, minKm: 100 }), { l100: 30, mert: true });
// Ecofleet 2026.09: az AOPU-427 09.22-ig 0 litert adott — ezek a napok nem húzhatják le az átlagot.
eq("érvényes mérés: 0 liter nem mérés", ervenyesUzemanyagMeres(400, 0), false);
eq("érvényes mérés: 30 l/100 igen", ervenyesUzemanyagMeres(400, 120), true);
eq("érvényes mérés: 92 l/100 nem (tankszint-ugrás)", ervenyesUzemanyagMeres(124, 114.7), false);
eq("érvényes mérés: 5 l/100 nem", ervenyesUzemanyagMeres(500, 25), false);
const napokMert = ervenyesNapokOsszege([{ km: 4000, liter: 0 }, { km: 600, liter: 125 }, { km: 700, liter: 140 }, { km: 0, liter: 0 }]);
eq("csak az érvényes napok összege", napokMert, { km: 1300, liter: 265, kihagyottNap: 1 });
eq("szűrt mérés → 20,4 l/100 (régen 4,6 lett volna)", valasszFogyasztast({ mertKm: napokMert.km, mertLiter: napokMert.liter }), { l100: 20.4, mert: true });

// A napi költség és a vezetési keret paraméterként (beállításból) is jöhet.
eq("napi költség paraméterből", szamoljOnkoltseget({ rakottKm: 100, uresKm: 0, fogyasztasL100: 28, gazolajFt: 600, utdijFt: 0, napok: 2, napiKoltsegFt: 60000 }).napiFt, 120000);
eq("10 óra 10 órás kerettel = 1 nap", napokMenetidobol(600, 600), 1);

// Beállítás-sorok összefésülése: hiányzó/hibás érték → alapérték.
const b = fuvarBeallitasokSorokbol([
  { kulcs: "napi_koltseg_ft", ertek: 55000 },
  { kulcs: "fogyasztas_alap_l_100km", ertek: "29.5" },
  { kulcs: "meres_min_km", ertek: { ertek: 400 } },
  { kulcs: "sajat_fuvar_km_dij_ft", ertek: "abc" },
  { kulcs: "tankolasi_kedvezmeny_ft_l", ertek: -5 },
  { kulcs: "ismeretlen_kulcs", ertek: 1 },
]);
eq("beállítás: szám", b.napi_koltseg_ft, 55000);
eq("beállítás: szöveges szám", b.fogyasztas_alap_l_100km, 29.5);
eq("beállítás: {ertek} alak", b.meres_min_km, 400);
eq("beállítás: nem szám → alap", b.sajat_fuvar_km_dij_ft, 550);
eq("beállítás: negatív → alap", b.tankolasi_kedvezmeny_ft_l, 50);
eq("beállítás: hiányzó → alap", b.lerakas_rahagyas_perc, 45);
eq("beállítás: ismeretlen kulcs nem kerül be", "ismeretlen_kulcs" in b, false);
eq("üres sorlista = alapértékek", fuvarBeallitasokSorokbol([]), { ...FUVAR_BEALLITAS_ALAP });

console.log(`\nKalkulátor teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
