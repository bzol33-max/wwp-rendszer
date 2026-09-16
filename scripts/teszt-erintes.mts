// A GPS-érintés-felismerés (lib/fuvarozas/idovonal.ts jelolMegallokat +
// ratesziKeziJeloleseket + fuvarKeszGpsSzerint) szabályainak tesztje.
//
// Futtatás:  npx tsx scripts/teszt-erintes.mts
//
// Élesben előjött esetek: az oda-vissza ingázó kocsi (a második fuvar
// felrakója az első lerakója), két azonos lerakójú fuvar egy érkezéssel,
// a már lezárt fuvar által "foglalt" megállás, és a cím közelében elhaladó
// rövid megállás (piros lámpa).

import {
  fuvarKeszGpsSzerint,
  jelolMegallokat,
  ratesziKeziJeloleseket,
  type IdovonalSzakasz,
  type TervezettMegallo,
} from "@/lib/fuvarozas/idovonal";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

const PAPA = { lat: 47.3299, lon: 17.4695 };
const DEBRECEN = { lat: 47.5316, lon: 21.6273 };
const t = (ora: number, perc = 0, nap = 16) => new Date(Date.UTC(2026, 8, nap, ora - 2, perc)); // budapesti nyári idő

function megallo(index: number, tipus: "felrako" | "lerako", hely: { lat: number; lon: number }, ablakKezdet: Date): TervezettMegallo {
  return {
    index,
    tipus,
    cim: "x",
    nyersCim: "x",
    pontossag: "pontos",
    lat: hely.lat,
    lon: hely.lon,
    idopont: ablakKezdet,
    elhagyva: false,
    eppenItt: false,
    tenylegesIdo: null,
    tenylegesTavozas: null,
    bizonytalanFelismeres: false,
    ablakKezdet,
    keszForras: null,
    keszBy: null,
  };
}

function allas(hely: { lat: number; lon: number }, kezdet: Date, percek: number): IdovonalSzakasz {
  return {
    tipus: "allas",
    kezdet,
    veg: new Date(kezdet.getTime() + percek * 60000),
    idotartamSec: percek * 60,
    cim: null,
    lat: hely.lat,
    lon: hely.lon,
    kategoria: "rakodas",
    osszevontLepesek: 0,
  };
}

function vezetes(honnan: { lat: number; lon: number }, hova: { lat: number; lon: number }, kezdet: Date, veg: Date): IdovonalSzakasz {
  return { tipus: "vezetes", kezdet, veg, tavKm: 300, idotartamSec: (veg.getTime() - kezdet.getTime()) / 1000, atlagSebesseg: 70, honnan: null, hova: null, hovaLat: hova.lat, hovaLon: hova.lon };
}

// 1) Ingázó kocsi: 09-15 Pápán felrak (#126), Debrecenben lerak, 09-16 reggel
//    Debrecenben felrak (#128), Pápán lerak. A #128 lerakója (Pápa) NEM
//    lehet kész a 09-15-i pápai állástól, mert az ablaka 09-16 06:00-kor kezdődik.
{
  const f126 = [megallo(0, "felrako", PAPA, t(0, 0, 15)), megallo(1, "lerako", DEBRECEN, t(0, 0, 16))];
  const f128 = [megallo(0, "felrako", DEBRECEN, t(0, 0, 16)), megallo(1, "lerako", PAPA, t(6, 0, 16))];
  const szakaszok: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 15), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    allas(PAPA, t(7, 0, 15), 60), // felrakás Pápán 09-15
    vezetes(PAPA, DEBRECEN, t(8, 0, 15), t(12, 0, 15)),
    allas(DEBRECEN, t(12, 0, 15), 1200), // 09-15 12:00-tól 09-16 08:00-ig Debrecenben (a lerakási ablakba, 09-16-ra is átnyúlik)
    vezetes(DEBRECEN, PAPA, t(8, 0, 16), t(12, 0, 16)),
  ];
  const [j126, j128] = jelolMegallokat([f126, f128], szakaszok);
  eq("ingázó: #126 felrakó Pápa kész", j126[0].elhagyva, true);
  eq("ingázó: #126 lerakó Debrecen kész", j126[1].elhagyva, true);
  eq("ingázó: #128 felrakó Debrecen kész — ugyanaz a megállás, mint a #126 lerakása", j128[0].elhagyva, true);
  eq("ingázó: #128 felrakó ideje a debreceni érkezés", j128[0].tenylegesIdo?.toISOString(), t(12, 0, 15).toISOString());
  eq("ingázó: #128 lerakó Pápa NEM kész az ablak előtti állástól", j128[1].elhagyva, false);
  eq("ingázó: #128 lerakó nem 'éppen itt'", j128[1].eppenItt, false);
  eq("ingázó: #126 GPS szerint kész", fuvarKeszGpsSzerint(j126), true);
  eq("ingázó: #128 GPS szerint nem kész", fuvarKeszGpsSzerint(j128), false);
}

// 2) Két azonos lerakójú fuvar (#126, #130), egyetlen debreceni érkezés:
//    csak az egyik (az első) lehet kész; a másodikhoz második érkezés kell.
{
  const f126 = [megallo(0, "felrako", PAPA, t(0, 0, 15)), megallo(1, "lerako", DEBRECEN, t(0, 0, 16))];
  const f130 = [megallo(0, "felrako", PAPA, t(0, 0, 15)), megallo(1, "lerako", DEBRECEN, t(0, 0, 16))];
  const egyErkezes: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 15), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    allas(PAPA, t(7, 0, 15), 60),
    vezetes(PAPA, DEBRECEN, t(8, 0, 15), t(23, 0, 15)),
    allas(DEBRECEN, t(23, 0, 15), 180), // 09-16 02:00-ig — a lerakási ablakon (09-16 00:00-tól) belül ér véget
    vezetes(DEBRECEN, PAPA, t(2, 0, 16), t(6, 0, 16)),
  ];
  const [a126, a130] = jelolMegallokat([f126, f130], egyErkezes);
  eq("egy érkezés: #126 kész", fuvarKeszGpsSzerint(a126), true);
  eq("egy érkezés: #130 NEM kész", fuvarKeszGpsSzerint(a130), false);

  // Következő kör: a #126 már Teljesítve (kézzel vagy GPS-ből), de a párosításban részt vesz — a #130 továbbra sem kész.
  const [, b130] = jelolMegallokat([ratesziKeziJeloleseket(f126, true, new Map()), f130], egyErkezes);
  eq("következő kör: a lezárt #126 foglalja az érkezést, #130 NEM kész", fuvarKeszGpsSzerint(b130), false);

  const ketErkezes: IdovonalSzakasz[] = [
    ...egyErkezes,
    allas(PAPA, t(6, 0, 16), 60),
    vezetes(PAPA, DEBRECEN, t(7, 0, 16), t(11, 0, 16)),
    allas(DEBRECEN, t(11, 0, 16), 60),
    vezetes(DEBRECEN, PAPA, t(12, 0, 16), t(16, 0, 16)),
  ];
  const [c126, c130] = jelolMegallokat([f126, f130], ketErkezes);
  eq("két érkezés: #126 kész", fuvarKeszGpsSzerint(c126), true);
  eq("két érkezés: #130 kész", fuvarKeszGpsSzerint(c130), true);
}

// 2b) Ugyanaz a BMW-cím két írásmóddal pár tíz méterrel eltérő koordinátára
//     geokódolódik: az egyetlen megállást a KORÁBBI fuvar (#126) kapja, nem
//     a méterekkel közelebbi (#130). Élesben a #130 emiatt zárult le tévesen,
//     miközben a kocsi Pápán állt.
{
  const BMW_A = { lat: DEBRECEN.lat + 0.0004, lon: DEBRECEN.lon }; // ~45 m-re a megállástól
  const BMW_B = { lat: DEBRECEN.lat + 0.0001, lon: DEBRECEN.lon }; // ~10 m-re a megállástól
  const f126 = [megallo(0, "felrako", PAPA, t(0, 0, 15)), megallo(1, "lerako", BMW_A, t(0, 0, 16))];
  const f130 = [megallo(0, "felrako", PAPA, t(0, 0, 15)), megallo(1, "lerako", BMW_B, t(0, 0, 16))];
  const egyMegallas: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 15), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    allas(PAPA, t(7, 0, 15), 60), // a #126 felrakása 09-15-én
    vezetes(PAPA, DEBRECEN, t(20, 0, 15), t(4, 53, 16)),
    allas(DEBRECEN, t(4, 53, 16), 142),
    vezetes(DEBRECEN, PAPA, t(7, 15, 16), t(13, 9, 16)),
    allas(PAPA, t(13, 9, 16), 300),
  ];
  const [a126, a130] = jelolMegallokat([f126, f130], egyMegallas);
  eq("eltérő geokód: a korábbi #126 kapja a megállást", fuvarKeszGpsSzerint(a126), true);
  eq("eltérő geokód: a #130 NEM kész (a kocsi Pápán áll)", fuvarKeszGpsSzerint(a130), false);
  eq("eltérő geokód: a #130 felrakója Pápán 'itt áll'", a130[0].eppenItt, true);
}

// 3) Rövid megállás a cím közelében (1,5 km, 3 perc — piros lámpa) nem érintés; 200 m-re 3 perc viszont igen.
{
  const KOZEL_1_5_KM = { lat: DEBRECEN.lat + 0.0135, lon: DEBRECEN.lon };
  const KOZEL_200_M = { lat: DEBRECEN.lat + 0.0018, lon: DEBRECEN.lon };
  const f = () => [megallo(0, "felrako", PAPA, t(0, 0, 16)), megallo(1, "lerako", DEBRECEN, t(0, 0, 16))];
  const lampa: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 16), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    vezetes(PAPA, KOZEL_1_5_KM, t(6, 0, 16), t(10, 0, 16)),
    allas(KOZEL_1_5_KM, t(10, 0, 16), 3),
    vezetes(KOZEL_1_5_KM, PAPA, t(10, 3, 16), t(14, 0, 16)),
  ];
  eq("piros lámpa 1,5 km-re: nem érintés", jelolMegallokat([f()], lampa)[0][1].elhagyva, false);
  const kapu: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 16), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    vezetes(PAPA, KOZEL_200_M, t(6, 0, 16), t(10, 0, 16)),
    allas(KOZEL_200_M, t(10, 0, 16), 3),
    vezetes(KOZEL_200_M, PAPA, t(10, 3, 16), t(14, 0, 16)),
  ];
  eq("rövid állás a kapunál (200 m): érintés", jelolMegallokat([f()], kapu)[0][1].elhagyva, true);
}

// 4) Kézi jelölés: a sofőr megerősítése készre teszi a megállót és felülírja az "éppen itt"-et; a fuvar Teljesítve mindent készre tesz.
{
  const f = [megallo(0, "felrako", PAPA, t(0, 0, 16)), megallo(1, "lerako", DEBRECEN, t(0, 0, 16))];
  const ottAll: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 16), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    allas(PAPA, t(7, 0, 16), 60),
    vezetes(PAPA, DEBRECEN, t(8, 0, 16), t(12, 0, 16)),
    allas(DEBRECEN, t(12, 0, 16), 30),
  ];
  const [gps] = jelolMegallokat([f], ottAll);
  eq("éppen itt (GPS)", gps[1].eppenItt, true);
  const sofor = ratesziKeziJeloleseket(gps, false, new Map([[1, { kesz: true, keszBy: "Micó" }]]));
  eq("sofőr jelölése: kész", sofor[1].elhagyva, true);
  eq("sofőr jelölése: forrás kézi", sofor[1].keszForras, "kezi");
  eq("sofőr jelölése: már nem 'éppen itt'", sofor[1].eppenItt, false);
  eq("sofőr jelölése: a GPS-érkezés ideje megmarad", sofor[1].tenylegesIdo?.toISOString(), t(12, 0, 16).toISOString());
  eq("sofőr jelölése nem GPS-kész (automata nem erre alapoz)", fuvarKeszGpsSzerint(sofor), false);
  const teljesitve = ratesziKeziJeloleseket(f, true, new Map());
  eq("fuvar Teljesítve: minden megálló kész", teljesitve.every((m) => m.elhagyva && m.keszForras === "kezi"), true);
}

console.log(`\n${ok} rendben, ${bad} hiba`);
process.exit(bad ? 1 : 0);
