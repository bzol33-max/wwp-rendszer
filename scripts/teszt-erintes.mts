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
  kiegesziteloAllapottal,
  ratesziKeziJeloleseket,
  type IdovonalSzakasz,
  type TervezettMegallo,
} from "@/lib/fuvarozas/idovonal";
import { cimPontossaga, varosNev } from "@/lib/fuvarozas/varos";

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

// 2c) Egy telephelyen két állás (éjszakai várakozás a portánál, majd 1,6 km-rel
//     arrébb a rámpánál/parkolóban), köztük 3 km-nél messzebb nem járt a kocsi:
//     ez EGY látogatás. Élesben a második állást a #130 kapta, és "kész" lett,
//     miközben a kocsi Pápán állt.
{
  const BMW_KAPU = { lat: DEBRECEN.lat, lon: DEBRECEN.lon };
  const BMW_RAMPA = { lat: DEBRECEN.lat + 0.0144, lon: DEBRECEN.lon }; // ~1,6 km
  const f126 = [megallo(0, "felrako", PAPA, t(0, 0, 15)), megallo(1, "lerako", DEBRECEN, t(0, 0, 16))];
  const f128 = [megallo(0, "felrako", DEBRECEN, t(0, 0, 15)), megallo(1, "lerako", PAPA, t(6, 0, 16))];
  const f130 = [megallo(0, "felrako", PAPA, t(0, 0, 15)), megallo(1, "lerako", DEBRECEN, t(0, 0, 16))];
  const ketAllasEgyLatogatas: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 15), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    allas(PAPA, t(7, 0, 15), 60),
    vezetes(PAPA, BMW_KAPU, t(8, 0, 15), t(15, 59, 15)),
    allas(BMW_KAPU, t(15, 59, 15), 754), // 09-16 04:33-ig a portánál
    { tipus: "vezetes", kezdet: t(4, 33, 16), veg: t(4, 53, 16), tavKm: 1.6, idotartamSec: 1200, atlagSebesseg: 5, honnan: null, hova: null, hovaLat: BMW_RAMPA.lat, hovaLon: BMW_RAMPA.lon },
    allas(BMW_RAMPA, t(4, 53, 16), 142), // 07:15-ig a rámpánál
    vezetes(BMW_RAMPA, PAPA, t(7, 15, 16), t(13, 9, 16)),
    allas(PAPA, t(13, 9, 16), 300),
  ];
  const [a126, a128, a130] = jelolMegallokat([f126, f128, f130], ketAllasEgyLatogatas);
  eq("egy látogatás két állásból: #126 kész", fuvarKeszGpsSzerint(a126), true);
  eq("egy látogatás két állásból: #126 érkezés a portánál 15:59", a126[1].tenylegesIdo?.toISOString(), t(15, 59, 15).toISOString());
  eq("egy látogatás két állásból: #126 távozás 07:15", a126[1].tenylegesTavozas?.toISOString(), t(7, 15, 16).toISOString());
  eq("egy látogatás két állásból: #128 felrakó ugyanaz a látogatás", a128[0].tenylegesTavozas?.toISOString(), t(7, 15, 16).toISOString());
  eq("egy látogatás két állásból: #130 NEM kész", fuvarKeszGpsSzerint(a130), false);
  eq("egy látogatás két állásból: #130 lerakóján nincs érintés", a130[1].tenylegesIdo, null);
  eq("egy látogatás két állásból: #128 lerakó Pápán itt áll", a128[1].eppenItt, true);
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

// 3b) Csak városnév szintű cím ("Nyírjákó"): a geokódolt pont a falu közepe,
//     a rakodó 3 km-re a szélén — tágabb (4 km) körrel érintés, bizonytalan
//     jelöléssel; pontos címnél ugyanez a 3 km már nem érintés.
{
  const SZELEN_3_KM = { lat: DEBRECEN.lat + 0.027, lon: DEBRECEN.lon };
  const rakodas: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 16), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    vezetes(PAPA, SZELEN_3_KM, t(6, 0, 16), t(10, 0, 16)),
    allas(SZELEN_3_KM, t(10, 0, 16), 45),
    vezetes(SZELEN_3_KM, PAPA, t(10, 45, 16), t(14, 0, 16)),
  ];
  const csakVaros = [megallo(0, "felrako", PAPA, t(0, 0, 16)), { ...megallo(1, "lerako", DEBRECEN, t(0, 0, 16)), pontossag: "csak_varos" as const }];
  const [j] = jelolMegallokat([csakVaros], rakodas);
  eq("csak városnév, rakodás 3 km-re a központtól: érintés", j[1].elhagyva, true);
  eq("csak városnév: a felismerés bizonytalan jelölésű", j[1].bizonytalanFelismeres, true);
  const pontos = [megallo(0, "felrako", PAPA, t(0, 0, 16)), megallo(1, "lerako", DEBRECEN, t(0, 0, 16))];
  eq("pontos cím, állás 3 km-re: nem érintés", jelolMegallokat([pontos], rakodas)[0][1].elhagyva, false);
}

// 3c) Álló élő pozíció nyitott trippel: az utolsó lezárt szakasz a balkányi
//     állás (11:36-ig), a kocsi 14:50-kor 33 km-re áll (0 km/h, friss jel) —
//     a becsült érkezés (11:36 + 33×1,3/60 h ≈ 12:19) óta eltelt idő állás,
//     ezért a csak városnév szintű felrakó "éppen itt" lesz. Ha a kocsi
//     mozog, vagy a jel régi, marad az élő vezetés, nincs érintés.
{
  const BALKANY = { lat: 47.7695, lon: 21.863 };
  const NYIRJAKO = { lat: 48.0281, lon: 22.079 };
  const RAKODO = { lat: NYIRJAKO.lat + 0.02, lon: NYIRJAKO.lon };
  const lezart: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 18), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    vezetes(PAPA, BALKANY, t(6, 0, 18), t(10, 33, 18)),
    allas(BALKANY, t(10, 33, 18), 63),
  ];
  const most = t(14, 50, 18);
  const f = () => [{ ...megallo(0, "felrako", NYIRJAKO, t(0, 0, 18)), pontossag: "csak_varos" as const }, megallo(1, "lerako", PAPA, t(0, 0, 21))];
  const all = kiegesziteloAllapottal(lezart, { ...RAKODO, cim: null, mozog: false, idobelyeg: t(14, 48, 18) }, most);
  eq("álló élő pozíció: a nyomvonal vége élő állás", all[all.length - 1].tipus, "allas");
  const [j] = jelolMegallokat([f()], all);
  eq("álló élő pozíció: a felrakó éppen itt", j[0].eppenItt, true);
  eq("álló élő pozíció: nem kész (nem ment tovább)", j[0].elhagyva, false);
  const mozog = kiegesziteloAllapottal(lezart, { ...RAKODO, cim: null, mozog: true, idobelyeg: t(14, 48, 18) }, most);
  eq("mozgó élő pozíció: élő vezetés marad", mozog[mozog.length - 1].tipus, "vezetes");
  const regi = kiegesziteloAllapottal(lezart, { ...RAKODO, cim: null, mozog: false, idobelyeg: t(13, 0, 18) }, most);
  eq("régi jel: nincs képzett állás", regi[regi.length - 1].tipus, "vezetes");
  const lampa = kiegesziteloAllapottal(lezart, { ...RAKODO, cim: null, mozog: false, idobelyeg: t(12, 20, 18) }, t(12, 22, 18));
  eq("frissen érkezett (piros lámpa): még nincs állás", lampa[lampa.length - 1].tipus, "vezetes");
}

// 3d) Lezárt vezetés állás nélkül, a kocsi már mozog: 12:26-kor ért
//     Nyírjákóra (a trip lezárult, de a "stoppedAfter" még 0), 14:57-kor
//     26 km-re halad 72 km/h-val — a végpontra becsült állás kerül
//     (12:26 → kb. 14:23), a felrakó kész (elhagyva), érkezés 12:26.
{
  const BALKANY = { lat: 47.7695, lon: 21.863 };
  const NYIRJAKO = { lat: 48.0281, lon: 22.079 };
  const UTON = { lat: 47.8462, lon: 21.8511 };
  const lezart: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 18), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    vezetes(PAPA, BALKANY, t(6, 0, 18), t(10, 33, 18)),
    allas(BALKANY, t(10, 33, 18), 63),
    vezetes(BALKANY, NYIRJAKO, t(11, 36, 18), t(12, 26, 18)),
  ];
  const most = t(14, 57, 18);
  const f = [{ ...megallo(0, "felrako", NYIRJAKO, t(0, 0, 18)), pontossag: "csak_varos" as const }, megallo(1, "lerako", PAPA, t(0, 0, 21))];
  const all = kiegesziteloAllapottal(lezart, { ...UTON, cim: null, mozog: true, idobelyeg: t(14, 57, 18) }, most);
  eq("hiányzó állás pótolva: állás, majd élő vezetés", all.slice(-2).map((sz) => sz.tipus), ["allas", "vezetes"]);
  const [j] = jelolMegallokat([f], all);
  eq("hiányzó állás pótolva: a felrakó kész", j[0].elhagyva, true);
  eq("hiányzó állás pótolva: érkezés a trip lezárásakor", j[0].tenylegesIdo?.toISOString(), t(12, 26, 18).toISOString());
  const gyors = kiegesziteloAllapottal(lezart, { ...UTON, cim: null, mozog: true, idobelyeg: t(13, 5, 18) }, t(13, 5, 18));
  eq("épp csak továbbindult (39 perc, 34 perc út): nincs képzett állás", gyors[gyors.length - 1].tipus, "vezetes");
  eq("épp csak továbbindult: nincs beszúrt állás", gyors.length, lezart.length + 1);
}

// 3f) A kocsi hazaért és ÁLL (Szakoly), az utolsó lezárt szakasz a
//     Nyírjákóra érkező vezetés (12:26): a nyírjákói állás megmarad (a lezárt
//     trip a bizonyíték), a szakolyi állás csak a megfigyelésekből nő.
{
  const BALKANY = { lat: 47.7695, lon: 21.863 };
  const NYIRJAKO = { lat: 48.0281, lon: 22.079 };
  const SZAKOLY = { lat: 47.7575, lon: 21.9006 };
  const lezart: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(6, 0, 18), cim: null, lat: PAPA.lat, lon: PAPA.lon },
    vezetes(PAPA, BALKANY, t(6, 0, 18), t(10, 33, 18)),
    allas(BALKANY, t(10, 33, 18), 63),
    vezetes(BALKANY, NYIRJAKO, t(11, 36, 18), t(12, 26, 18)),
  ];
  const most = t(15, 22, 18);
  const f = () => [{ ...megallo(0, "felrako", NYIRJAKO, t(0, 0, 18)), pontossag: "csak_varos" as const }, megallo(1, "lerako", PAPA, t(0, 0, 21))];
  const elo = { ...SZAKOLY, cim: null, mozog: false, idobelyeg: t(15, 22, 18) };
  // Megfigyelés nélkül: a nyírjákói állás a becsült menetidővel visszaszámolva, Szakolyban nincs állás.
  const nelkul = kiegesziteloAllapottal(lezart, elo, most);
  eq("hazaért, áll, előzmény nélkül: nyírjákói állás + élő vezetés", nelkul.slice(-2).map((sz) => sz.tipus), ["allas", "vezetes"]);
  eq("hazaért, áll, előzmény nélkül: a felrakó kész", jelolMegallokat([f()], nelkul)[0][0].elhagyva, true);
  // Előzménnyel: 14:20-kor még Nyírjákón állt, 14:45-kor félúton mozgott,
  // 15:05 óta Szakolyban áll → nyírjákói távozás 14:20 (a szűkebb korlát),
  // szakolyi állás 15:05-től.
  const elozmeny = [
    { ...NYIRJAKO, mozog: false, idobelyeg: t(14, 20, 18) },
    { lat: 47.8462, lon: 21.8511, mozog: true, idobelyeg: t(14, 45, 18) },
    { ...SZAKOLY, mozog: false, idobelyeg: t(15, 5, 18) },
  ];
  const vele = kiegesziteloAllapottal(lezart, elo, most, [], elozmeny);
  eq("előzménnyel: nyírjákói állás, vezetés, szakolyi állás", vele.slice(-3).map((sz) => sz.tipus), ["allas", "vezetes", "allas"]);
  const nyirjako = vele[vele.length - 3];
  eq("előzménnyel: Nyírjákó elhagyása 14:20", nyirjako.tipus === "allas" ? nyirjako.veg.toISOString() : null, t(14, 20, 18).toISOString());
  const szakoly = vele[vele.length - 1];
  // Az érkezés a becsült menetidő (14:20 + kb. 43 perc ≈ 15:03) és az első szakolyi megfigyelés (15:05) közül a korábbi.
  const szakolyKezdet = szakoly.tipus === "allas" ? szakoly.kezdet.getTime() : 0;
  eq("előzménnyel: Szakolyban 15:00 és 15:05 közt kezdődött az állás", szakolyKezdet >= t(15, 0, 18).getTime() && szakolyKezdet <= t(15, 5, 18).getTime(), true);
  eq("előzménnyel: a felrakó kész", jelolMegallokat([f()], vele)[0][0].elhagyva, true);
}

// 3g) Lezárt állás után is a helyszínen látott kocsi: Gergő lezárt
//     gyöngyöshalászi állása 13:40-ig tart, 15:05-kor még ott állt, 15:22-kor
//     már úton volt — az állás a megfigyelt elhagyásig (15:05 után) tart.
{
  const GYONGYOSHALASZ = { lat: 47.7239, lon: 19.9619 };
  const lezart: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(9, 18, 18), cim: null, lat: DEBRECEN.lat, lon: DEBRECEN.lon },
    vezetes(DEBRECEN, GYONGYOSHALASZ, t(9, 18, 18), t(11, 1, 18)),
    allas(GYONGYOSHALASZ, t(11, 1, 18), 159),
  ];
  const elozmeny = [
    { ...GYONGYOSHALASZ, mozog: false, idobelyeg: t(14, 50, 18) },
    { ...GYONGYOSHALASZ, mozog: false, idobelyeg: t(15, 5, 18) },
  ];
  const uton = { lat: 47.72, lon: 20.1, cim: null, mozog: true, idobelyeg: t(15, 22, 18) };
  const all = kiegesziteloAllapottal(lezart, uton, t(15, 22, 18), [], elozmeny);
  const utolsoAllas = all.filter((sz) => sz.tipus === "allas").pop();
  const veg = utolsoAllas?.tipus === "allas" ? utolsoAllas.veg.getTime() : 0;
  eq("lezárt állás a megfigyelt ottlétig hosszabbítva (≥ 15:05)", veg >= t(15, 5, 18).getTime() && veg <= t(15, 22, 18).getTime(), true);
  eq("utána élő vezetés", all[all.length - 1].tipus, "vezetes");
  const f = [megallo(0, "felrako", GYONGYOSHALASZ, t(0, 0, 18)), megallo(1, "lerako", DEBRECEN, t(0, 0, 18))];
  eq("a felrakó kész, a távozás a meghosszabbított vég", jelolMegallokat([f], all)[0][0].tenylegesTavozas?.getTime(), veg);
}

// 3e) Lezárt fuvar nem kaphat a lezárása utáni látogatást: a tegnapi #134
//     (Gyöngyöshalász→Debrecen, ma 09:25-kor Teljesítve) felrakója és a mai
//     #135 felrakója ugyanaz a cím; a mai 11:01-es érkezés a #135-é.
{
  const GYONGYOSHALASZ = { lat: 47.7239, lon: 19.9619 };
  const lezaras = t(9, 25, 18);
  const f134 = [
    { ...megallo(0, "felrako", GYONGYOSHALASZ, t(0, 0, 17)), fuvarLezarva: lezaras },
    { ...megallo(1, "lerako", DEBRECEN, t(0, 0, 17)), fuvarLezarva: lezaras },
  ];
  const f135 = [megallo(0, "felrako", GYONGYOSHALASZ, t(0, 0, 18)), megallo(1, "lerako", DEBRECEN, t(0, 0, 18))];
  const ma: IdovonalSzakasz[] = [
    { tipus: "indulas", idopont: t(7, 0, 18), cim: null, lat: DEBRECEN.lat, lon: DEBRECEN.lon },
    allas(DEBRECEN, t(7, 57, 18), 81),
    vezetes(DEBRECEN, GYONGYOSHALASZ, t(9, 18, 18), t(11, 1, 18)),
    allas(GYONGYOSHALASZ, t(11, 1, 18), 240),
  ];
  const [j134, j135] = jelolMegallokat([f134, f135], ma);
  eq("lezárt fuvar lerakója a lezárás előtti látogatást megkapja", j134[1].elhagyva, true);
  eq("lezárt fuvar felrakója a lezárás utáni látogatást nem kapja", j134[0].tenylegesIdo, null);
  eq("a mai fuvar felrakója éppen itt", j135[0].eppenItt, true);
  eq("a mai fuvar felrakója 11:01-kor érkezett", j135[0].tenylegesIdo?.toISOString(), t(11, 1, 18).toISOString());
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

// 5) Címfelismerés — az RBT "[H-4243] TÉGLÁS" formátuma (szögletes zárójeles
//    országkód+irányítószám): város és pontosság, hogy a GPS-felismerés ne
//    hagyja ki a megállót.
{
  eq("RBT cím: város", varosNev("HAJDU HAJDUSÁGI ZRT [H-4243] TÉGLÁS, Hrsz. 0135/9"), "TÉGLÁS");
  eq("RBT cím: pontosság", cimPontossaga("HAJDU HAJDUSÁGI ZRT [H-4243] TÉGLÁS, Hrsz. 0135/9"), "pontos");
  eq("RBT cím 2: város", varosNev("BEZZEGH KFT [H-3200] GYÖNGYÖS, Szurdokpart u. 6-8."), "GYÖNGYÖS");
  eq("Duvenbeck cím továbbra is jó", varosNev("Yanfeng International Automotive, Juhar utca 17, HU 8500 Papa"), "Papa");
  eq("zárójeles irsz továbbra is jó", varosNev("Nyíregyháza (4400 Móricz Zsigmond u. 24.)"), "Nyíregyháza");
}

console.log(`\n${ok} rendben, ${bad} hiba`);
process.exit(bad ? 1 : 0);
