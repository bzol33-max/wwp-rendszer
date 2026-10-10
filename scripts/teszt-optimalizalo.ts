// Menetterv — az optimalizáló (lib/menet/optimalizalo.ts), 4. fázis.
// Futtatás: npx tsx scripts/teszt-optimalizalo.ts
//
// Amit véd: a jobb sorrendet megtalálja (kevesebb üres km); az ablak végére
// érkezés és a várakozás büntetése; a késés, a kapacitás és a vezetési idő
// KEMÉNY korlát; a 45 perces szünet beszúrása; a rögzített (elkezdett)
// előtag marad; a 30 km-es üres indulás csak figyelmeztetés; a
// hozzárendelés a legkisebb határköltségű kocsit adja (GPS nélkülit is);
// az eredmény determinisztikus; a javaslat-küszöb és az ujjlenyomat.

import { readFileSync } from "node:fs";
import { alapFuvarBeallitasok } from "@/lib/beallitasok/fuvar-alap";
import {
  TELJES_BEJARAS_MAX,
  bemenetUjjlenyomat,
  erdemesJavasolni,
  feladatSorrendJavaslatbol,
  javasolHozzarendelest,
  optParamBeallitasbol,
  optimalizalSorrendet,
  type KocsiNap,
  type OptBemenet,
  type SorrendEredmeny,
  type SzakaszFn,
} from "@/lib/menet/optimalizalo";
import type { Hely, MenetMunka, PotkocsiKapacitas, TelephelyPontAdat } from "@/lib/menet/tipusok";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
function igaz(nev: string, x: boolean) { eq(nev, x, true); }

// ------------------------------------------------------------------ geometria: egy kelet–nyugati egyenes, km-ben
const LAT = 47.5;
const LON_KM = 75.6; // 1 hosszúsági fok ~ 75,6 km ezen a szélességen
const P = (km: number) => ({ lat: LAT, lon: 21 + km / LON_KM });
const H = (km: number): Hely => ({ cim: `Pont ${km} km`, pont: P(km) });
/** Teszt-távolság: az egyenes menti km (HU-GO-ként), 60 km/h menetidő, útdíj nélkül (a flottaátlag 0). */
let hivasok = 0;
const szakasz: SzakaszFn = async (a, b) => {
  hivasok++;
  if (!a.pont || !b.pont) return null;
  const km = Math.round(Math.abs(a.pont.lon - b.pont.lon) * LON_KM * 10) / 10;
  return { km, perc: km, utdijFt: null, forras: "hugo" };
};
const becsloSzakasz: SzakaszFn = async (a, b) => {
  const s = await szakasz(a, b);
  return s ? { ...s, forras: "becsles" } : null;
};

const NAP = "2026-10-12";
/** Budapesti falióra (CEST, UTC+2) → ms. */
const T = (hhmm: string, nap = NAP) => Date.parse(`${nap}T${hhmm}:00+02:00`);
const ORA = (ms: number | null) => (ms == null ? null : new Date(ms).toLocaleTimeString("hu-HU", { timeZone: "Europe/Budapest", hour: "2-digit", minute: "2-digit" }));

function munka(id: string, felKm: number, leKm: number, x: Partial<MenetMunka> = {}): MenetMunka {
  return {
    id, jelleg: "ber", felrakasNap: NAP, lerakasNap: NAP, felrako: H(felKm), lerako: H(leKm),
    tervIdo: null, felrakasAblakIg: null, lerakasAblakTol: null, lerakasAblakIg: null, tenyIdo: null, lezart: false,
    rakottKm: null, raklapDb: 33, raklaphely: null, ...x,
  };
}

const TELEPHELYEK: TelephelyPontAdat[] = [{ id: "1", nev: "Telephely", cim: "Pont 0 km", pont: P(0) }];
const KAP: PotkocsiKapacitas = { raklaphelyNormal: 33, raklaphelyForgatott: 28, raklapDbNormal: 660, raklapDbForgatott: 812 };
const B = alapFuvarBeallitasok();
// Gázolaj 600 Ft/l, útdíj 0 Ft/km (a teszt csak a km-et és az időt nézi) → 168 Ft/km üzemanyag.
const PARAM = optParamBeallitasbol(B, { gazolajFtL: 600, utdijPerKmFt: 0 });

function bemenet(munkak: MenetMunka[], sorrend: string[] | null, x: Partial<OptBemenet> = {}): OptBemenet {
  return { nap: NAP, munkak, jelenlegiSorrend: sorrend, indulas: H(0), haza: H(0), telephelyek: TELEPHELYEK, kapacitas: KAP, param: PARAM, szakasz, ...x };
}

(async () => {
  // ---------------------------------------------------------------- 0. paraméterek
  eq("param: 28 l/100 km alap", PARAM.fogyasztasL100, 28);
  eq("param: mért fogyasztás felülírja", optParamBeallitasbol(B, { gazolajFtL: 600, utdijPerKmFt: 0, fogyasztasL100: 31.5 }).fogyasztasL100, 31.5);
  eq("param: várakozás Ft/perc = napi / 600", PARAM.wVarakozasFtPerc, 83);
  eq("param: hazaút Ft/km = üzemanyag + útdíj km-enként", PARAM.wHazautFtKm, 168);
  eq("param: vezetési keret és szünet a beállításból", [PARAM.vezetesMaxPerc, PARAM.szunetUtanPerc, PARAM.szunetPerc], [540, 270, 45]);

  // ---------------------------------------------------------------- 1. a naiv sorrendnél kevesebb üres km
  {
    const A = munka("A", 100, 150), Bm = munka("B", 10, 60), C = munka("C", 160, 200);
    const e = await optimalizalSorrendet(bemenet([A, Bm, C], ["A", "B", "C"]));
    eq("3 munka: teljes bejárás", e.modszer, "teljes_bejaras");
    eq("3 munka: 3! + a mostani kiértékelve", e.vizsgalt, 7);
    eq("3 munka: a jobb sorrend B, A, C", e.legjobb?.sorrend, ["B", "A", "C"]);
    eq("3 munka: a mostani üres km (0→100, 150→10, 60→160)", e.jelenlegi.uresKm, 340);
    eq("3 munka: a javasolt üres km (0→10, 60→100, 150→160)", e.legjobb?.uresKm, 60);
    eq("3 munka: a rakott km nem változik", [e.jelenlegi.rakottKm, e.legjobb?.rakottKm], [140, 140]);
    eq("3 munka: megtakarítás km", e.megtakaritasKm, 280);
    eq("3 munka: megtakarítás Ft = 280 km × 168 Ft", e.megtakaritasFt, e.jelenlegi.celfuggveny.osszesen - e.legjobb!.celfuggveny.osszesen);
    igaz("3 munka: megtakarítás > 40 000 Ft", e.megtakaritasFt > 40_000);
    igaz("3 munka: érdemes javasolni", erdemesJavasolni(e));
    const cf = e.legjobb!.celfuggveny;
    eq("J = a tagok összege", cf.osszesen, cf.uzemanyag + cf.utdij + cf.napi + cf.keses_buntetes + cf.varakozas_buntetes + cf.hazaut + cf.sajat_ertek);
    eq("J: napi költség egy napra", cf.napi, 50_000);
    eq("J: hazaút 200 km × 168", cf.hazaut, 200 * 168);
    eq("J: üzemanyag (60 + 140) km × 0,28 l × 600", cf.uzemanyag, 200 * 168);
    eq("J: bérfuvar → nincs saját érték", cf.sajat_ertek, 0);
    // A lerakó mindig a saját felrakója után (szerkezeti korlát, a szimuláció ellenőrzi).
    const megallok = e.legjobb!.megallok;
    igaz("lerakó a felrakó után", ["A", "B", "C"].every((id) => megallok.findIndex((m) => m.munkaId === id && m.tipus === "fel") < megallok.findIndex((m) => m.munkaId === id && m.tipus === "le")));
    eq("vezetési idő becslés-megjegyzés", e.megjegyzesek.some((m) => m.includes("nem tachográf")), true);
    // Ha már a jó sorrendben van: nincs javaslat.
    const e2 = await optimalizalSorrendet(bemenet([A, Bm, C], ["B", "A", "C"]));
    eq("jó sorrend: a legjobb a mostani", e2.legjobb?.sorrend, ["B", "A", "C"]);
    eq("jó sorrend: nincs megtakarítás", e2.megtakaritasFt, 0);
    eq("jó sorrend: nem érdemes javasolni", erdemesJavasolni(e2), false);
  }

  // ---------------------------------------------------------------- 2. saját áru értéke (p)
  {
    const S = munka("S", 10, 60, { jelleg: "sajat" });
    const e = await optimalizalSorrendet(bemenet([S], null));
    eq("saját: −p × 50 km × 550 Ft", e.jelenlegi.celfuggveny.sajat_ertek, -50 * 550);
    const p2 = optParamBeallitasbol({ ...B, prioritas_sajat_vs_ber: 2 }, { gazolajFtL: 600, utdijPerKmFt: 0 });
    const e2 = await optimalizalSorrendet(bemenet([S], null, { param: p2 }));
    eq("saját: p = 2 kétszeres súly", e2.jelenlegi.celfuggveny.sajat_ertek, -2 * 50 * 550);
    eq("egy munka: nincs mit mozgatni", e.modszer, "nincs_mozgathato");
  }

  // ---------------------------------------------------------------- 3. érkezés az ablak végére, várakozás büntetése
  {
    const egy = munka("E", 20, 30, { tervIdo: T("08:00"), felrakasAblakIg: T("12:00") });
    const e = await optimalizalSorrendet(bemenet([egy], null));
    eq("ablak vége: az első felrakóra 12:00-ra ér (nem 8-ra)", ORA(e.jelenlegi.megallok[0].erkezes), "12:00");
    eq("ablak vége: horgony", e.jelenlegi.horgony, "ablak_vege");
    eq("ablak vége: nincs várakozás", e.jelenlegi.varakozasPerc, 0);

    // A 08:00–08:30, B 13:00–14:00, C ablak nélkül. A, B, C: kevesebb km, de
    // 175 perc állás B előtt; A, C, B: több km, de C kitölti a rést.
    const A = munka("A", 20, 30, { tervIdo: T("08:00"), felrakasAblakIg: T("08:30") });
    const Bm = munka("B", 40, 50, { tervIdo: T("13:00"), felrakasAblakIg: T("14:00") });
    const C = munka("C", 35, 25);
    const e2 = await optimalizalSorrendet(bemenet([A, Bm, C], ["A", "B", "C"]));
    eq("várakozás: a mostani A, B, C 175 percet áll", e2.jelenlegi.varakozasPerc, 175);
    eq("várakozás: a javaslat A, C, B", e2.legjobb?.sorrend, ["A", "C", "B"]);
    igaz("várakozás: a javaslat több km-t megy…", e2.legjobb!.uresKm + e2.legjobb!.hazaKm > e2.jelenlegi.uresKm + e2.jelenlegi.hazaKm);
    igaz("…de kevesebbet vár", e2.legjobb!.varakozasPerc < e2.jelenlegi.varakozasPerc);
    eq("várakozás: büntetés = perc × 83", e2.jelenlegi.celfuggveny.varakozas_buntetes, 175 * 83);
    igaz("várakozás: kisebb J", e2.legjobb!.celfuggveny.osszesen < e2.jelenlegi.celfuggveny.osszesen);
    eq("várakozás: A-ra az ablak végén ér", ORA(e2.legjobb!.megallok[0].erkezes), "08:30");

    // Ha az ablak végére érkezés miatt később késne: az ablak elejére.
    const X = munka("X", 20, 30, { tervIdo: T("08:00"), felrakasAblakIg: T("12:00") });
    const Y = munka("Y", 40, 50, { tervIdo: T("09:00"), felrakasAblakIg: T("10:00") });
    const e3 = await optimalizalSorrendet(bemenet([X, Y], ["X", "Y"]));
    eq("ablak eleje tartalék: X, Y megengedett 8:00-ás érkezéssel", [e3.jelenlegi.megengedett, e3.jelenlegi.horgony, ORA(e3.jelenlegi.megallok[0].erkezes)], [true, "ablak_eleje", "08:00"]);
  }

  // ---------------------------------------------------------------- 4. késés = elutasítva
  {
    // K: 08:00–08:30 (100 km-re); L: 08:00–09:00 (10 km-re). L, K sorrendben K késik.
    const K = munka("K", 100, 110, { tervIdo: T("08:00"), felrakasAblakIg: T("08:30") });
    const L = munka("L", 10, 20, { tervIdo: T("12:00"), felrakasAblakIg: T("13:00") });
    const e = await optimalizalSorrendet(bemenet([K, L], ["L", "K"]));
    eq("késés: a mostani (L, K) nem megengedett", e.jelenlegi.megengedett, false);
    igaz("késés: a sérülés szövege", e.jelenlegi.serulesek.some((s) => s.startsWith("Késés")));
    igaz("késés: büntetés a kiírásban", e.jelenlegi.celfuggveny.keses_buntetes > 0);
    eq("késés: a javaslat K, L", e.legjobb?.sorrend, ["K", "L"]);
    eq("késés: a javaslat megengedett", e.legjobb?.megengedett, true);
    igaz("késés: a mostani sérti a korlátot → érdemes javasolni", erdemesJavasolni(e));
    // Lerakási ablak vége is kemény.
    const M = munka("M", 10, 300, { tervIdo: T("08:00"), lerakasAblakIg: T("10:00") });
    const e2 = await optimalizalSorrendet(bemenet([M], null));
    eq("lerakási ablak: késés → nincs megengedett", e2.legjobb, null);
    igaz("lerakási ablak: megjegyzés", e2.megjegyzesek.some((m) => m.startsWith("Nincs megengedett sorrend")));
    eq("nincs megengedett → nem javasol", erdemesJavasolni(e2), false);
  }

  // ---------------------------------------------------------------- 5. kapacitás = elutasítva
  {
    const N = munka("N", 10, 20, { raklapDb: 900 });
    const e = await optimalizalSorrendet(bemenet([N, munka("O", 30, 40)], ["N", "O"]));
    eq("kapacitás: 900 db > 812 → nincs megengedett", e.legjobb, null);
    igaz("kapacitás: a sérülés szövege", e.jelenlegi.serulesek.some((s) => s.startsWith("Kapacitás: 900 raklap")));
    const e2 = await optimalizalSorrendet(bemenet([munka("Q", 10, 20, { raklapDb: 812 })], null));
    eq("kapacitás: 812 db forgatva még elfér", e2.legjobb?.megengedett, true);
    const e3 = await optimalizalSorrendet(bemenet([munka("R", 10, 20, { raklapDb: null, raklaphely: 34 })], null));
    eq("kapacitás: 34 raklaphely > 33", e3.legjobb, null);
    const e4 = await optimalizalSorrendet(bemenet([N], null, { kapacitas: null }));
    eq("kapacitás: ismeretlen pótkocsinál nincs korlát", e4.legjobb?.megengedett, true);
  }

  // ---------------------------------------------------------------- 6. a rögzített (elkezdett) előtag marad
  {
    // S messze van és már elkezdődött (tény) — hiába lenne jobb A-val kezdeni.
    const S = munka("S", 150, 160, { tenyIdo: T("07:10") });
    const A = munka("A", 10, 20), Bm = munka("B", 30, 40);
    const e = await optimalizalSorrendet(bemenet([S, A, Bm], ["S", "B", "A"]));
    eq("rögzített: S az első marad", e.legjobb?.sorrend[0], "S");
    eq("rögzített: a többi optimalizálva (S után B, aztán A a hazaút miatt)", e.legjobb?.sorrend, ["S", "B", "A"]);
    igaz("rögzített: megjegyzés", e.megjegyzesek.some((m) => m.startsWith("Rögzítve") && m.includes("S")));
    eq("rögzített: a tény az érkezés", ORA(e.legjobb!.megallok[0].erkezes), "07:10");
    // A lezárt menet-feladat is rögzít, és a helyén marad (az előtte állók is).
    const e2 = await optimalizalSorrendet(bemenet([A, Bm, S], ["B", "A", "S"], { rogzitett: ["A"] }));
    eq("lezárt feladat: B, A előtag, csak S mozdulhatna", e2.legjobb?.sorrend.slice(0, 2), ["B", "A"]);
    // Korábbi napról hozott rakomány: a kocsin van — amíg le nem rakja, a
    // kapacitásba számít (700 + 200 > 812), ezért előbb le kell rakni.
    const Hz = munka("H", 300, 50, { felrakasNap: "2026-10-11", raklapDb: 700 });
    const A2 = munka("A", 10, 20, { raklapDb: 200 });
    const e3 = await optimalizalSorrendet(bemenet([A2, Hz], ["A", "H"]));
    eq("hozott rakomány: a mostani (A, H) túllépi a kapacitást", [e3.jelenlegi.megengedett, e3.jelenlegi.serulesek.some((s) => s.includes("900 raklap"))], [false, true]);
    eq("hozott rakomány: előbb lerakja", e3.legjobb?.sorrend, ["H", "A"]);
    const e3b = await optimalizalSorrendet(bemenet([A, { ...Hz, raklapDb: 33 }], ["H", "A"]));
    eq("hozott rakomány: ha elfér, mozgatható (A, H rövidebb)", e3b.legjobb?.sorrend, ["A", "H"]);
    // Későbbi napra átnyúló munka a végén marad.
    const At = munka("T", 5, 300, { lerakasNap: "2026-10-13" });
    const e4 = await optimalizalSorrendet(bemenet([At, A, Bm], ["T", "A", "B"]));
    eq("átnyúló: a végén", e4.legjobb?.sorrend.at(-1), "T");
  }

  // ---------------------------------------------------------------- 7. vezetési idő
  {
    // 600 km rakott út = 600 perc vezetés > 540.
    const V = munka("V", 10, 610);
    const e = await optimalizalSorrendet(bemenet([V], null, { haza: null }));
    eq("vezetési idő: 610 perc > 540 → nincs megengedett", e.legjobb, null);
    igaz("vezetési idő: sérülés (becslés)", e.jelenlegi.serulesek.some((s) => s.startsWith("Vezetési idő") && s.includes("becslés")));
    // 300 perc vezetés: 270 után 45 perc szünet → 08:00 + 30 + 300 + 45.
    const W = munka("W", 0, 300, { tervIdo: T("08:00"), felrakasAblakIg: T("08:00") });
    const e2 = await optimalizalSorrendet(bemenet([W], null, { haza: null }));
    eq("szünet: egy 45 perces szünet", e2.jelenlegi.szunetDb, 1);
    eq("szünet: érkezés a lerakóra 14:15", ORA(e2.jelenlegi.megallok[1].erkezes), "14:15");
    eq("szünet: megengedett (300 ≤ 540)", e2.jelenlegi.megengedett, true);
    // A szünet miatt késik a lerakási ablakról → elutasítva.
    const W2 = munka("W2", 0, 300, { tervIdo: T("08:00"), felrakasAblakIg: T("08:00"), lerakasAblakIg: T("14:00") });
    const e3 = await optimalizalSorrendet(bemenet([W2], null, { haza: null }));
    eq("szünet → késés: elutasítva", e3.legjobb, null);
    // Két munka együtt túl sok: egyenként elfér, a kettő nem.
    const e4 = await optimalizalSorrendet(bemenet([munka("V1", 0, 280), munka("V2", 280, 560)], ["V1", "V2"], { haza: null }));
    eq("vezetési idő: a nap összesen számít", e4.jelenlegi.megengedett, false);
  }

  // ---------------------------------------------------------------- 8. 30 km-es üres indulás: figyelmeztetés, nem blokkol
  {
    const F = munka("F", 50, 60);
    const e = await optimalizalSorrendet(bemenet([F], null));
    igaz("üres indulás: figyelmeztetés", e.jelenlegi.figyelmeztetesek.some((s) => s.startsWith("Üres indulás 50 km")));
    eq("üres indulás: megengedett", e.jelenlegi.megengedett, true);
    const e2 = await optimalizalSorrendet(bemenet([munka("G", 20, 60)], null));
    eq("üres indulás: 20 km alatt nincs", e2.jelenlegi.figyelmeztetesek.length, 0);
    const e3 = await optimalizalSorrendet(bemenet([F], null, { indulas: H(-40), telephelyek: [...TELEPHELYEK, { id: "2", nev: "Kinti", cim: "Pont 45 km", pont: P(45) }] }));
    eq("üres indulás: közeli telephely mellett nincs", e3.jelenlegi.figyelmeztetesek.length, 0);
  }

  // ---------------------------------------------------------------- 9. becslés jelölés
  {
    const e = await optimalizalSorrendet(bemenet([munka("A", 10, 20)], null, { szakasz: becsloSzakasz }));
    eq("légvonal × 1,3 szakasz → becslés", e.jelenlegi.becsles, true);
    const e2 = await optimalizalSorrendet(bemenet([munka("A", 10, 20)], null));
    eq("HU-GO szakasz → nem becslés", e2.jelenlegi.becsles, false);
    const e3 = await optimalizalSorrendet(bemenet([munka("A", 10, 20, { felrako: { cim: null, pont: null } })], null));
    eq("hiányzó cím → nem helyezhető el", e3.legjobb, null);
  }

  // ---------------------------------------------------------------- 10. heurisztika (> 7 munka) és determinizmus
  {
    // 9 munka egy egyenesen, összekeverve: a legjobb az út menti sorrend.
    const helyek = [70, 10, 50, 90, 30, 20, 80, 40, 60];
    const munkak = helyek.map((k, i) => munka(`M${i}`, k, k + 5));
    const kevert = munkak.map((m) => m.id);
    const e = await optimalizalSorrendet(bemenet(munkak, kevert));
    eq("9 munka: beszúrás + 2-opt", e.modszer, "beszuras_2opt");
    igaz(`9 munka: több mint ${TELJES_BEJARAS_MAX} → heurisztika`, munkak.length > TELJES_BEJARAS_MAX);
    const varSorrend = [...munkak].sort((a, b) => helyek[Number(a.id.slice(1))] - helyek[Number(b.id.slice(1))]).map((m) => m.id);
    eq("9 munka: az út menti sorrend", e.legjobb?.sorrend, varSorrend);
    eq("9 munka: üres km = 10 + 8 × 5", e.legjobb?.uresKm, 50);

    // Determinizmus: ugyanaz az eredmény újra és más bemeneti sorrendben.
    const egyszer = await optimalizalSorrendet(bemenet(munkak, kevert));
    const forditva = await optimalizalSorrendet(bemenet([...munkak].reverse(), kevert));
    eq("determinisztikus: kétszer ugyanaz", JSON.stringify(egyszer), JSON.stringify(e));
    eq("determinisztikus: a bemeneti tömb sorrendje nem számít", JSON.stringify(forditva), JSON.stringify(e));
    const A = munka("A", 100, 150), Bm = munka("B", 10, 60), C = munka("C", 160, 200);
    const r1: SorrendEredmeny = await optimalizalSorrendet(bemenet([A, Bm, C], ["C", "A", "B"]));
    const r2: SorrendEredmeny = await optimalizalSorrendet(bemenet([C, Bm, A], ["C", "A", "B"]));
    eq("determinisztikus: teljes bejárás", JSON.stringify(r1.legjobb), JSON.stringify(r2.legjobb));
    // Döntetlennél a mostani sorrend marad: két munka ugyanott.
    const D1 = munka("D1", 10, 20), D2 = munka("D2", 10, 20);
    eq("döntetlen: a mostani marad (D2, D1)", (await optimalizalSorrendet(bemenet([D1, D2], ["D2", "D1"]))).legjobb?.sorrend, ["D2", "D1"]);
    eq("döntetlen: a mostani marad (D1, D2)", (await optimalizalSorrendet(bemenet([D1, D2], ["D1", "D2"]))).legjobb?.sorrend, ["D1", "D2"]);
    // A távolság-hívások száma: n² + 2n körül, nem permutációnként.
    hivasok = 0;
    await optimalizalSorrendet(bemenet([A, Bm, C], ["A", "B", "C"]));
    igaz(`távolság-hívások: ${hivasok} ≤ 3² + 3 × 3`, hivasok <= 18);
  }

  // ---------------------------------------------------------------- 11. hozzárendelés a 4 kocsi közül
  {
    const uj = munka("UJ", 100, 120, { tervIdo: T("10:00"), felrakasAblakIg: T("12:00") });
    const kocsi = (kod: string, x: Partial<KocsiNap>): KocsiNap => ({
      jarmuId: kod, kod, sofor: kod, vanGps: true, munkak: [], jelenlegiSorrend: null, indulas: H(0), haza: H(0), kapacitas: KAP, param: PARAM, ...x,
    });
    const kocsik: KocsiNap[] = [
      // Szakolyban áll, üres napja van — 100 km üres indulás.
      kocsi("AOPU-427", {}),
      // Már megy egy fuvart a közelbe (90 → 95): utána 5 km üres a felrakóig.
      kocsi("NMZ-492", { munkak: [munka("X1", 80, 95)], jelenlegiSorrend: ["X1"], indulas: H(80), haza: H(0) }),
      // GPS nélkül, de pont a felrakó mellett áll (98 km-nél), szabad.
      // (a saját telephelye a lerakó mellett van — 120 km-nél).
      kocsi("JANI", { vanGps: false, indulas: H(98), haza: H(120) }),
      // Ütközik: egész délelőtt máshol (késne).
      kocsi("ABC-123", { munkak: [munka("Y1", -200, -150, { tervIdo: T("09:00"), felrakasAblakIg: T("09:30") })], jelenlegiSorrend: ["Y1"] }),
    ];
    const h = await javasolHozzarendelest(uj, NAP, kocsik, szakasz, TELEPHELYEK);
    eq("hozzárendelés: 4 kocsi értékelve", h.kocsik.length, 4);
    eq("hozzárendelés: a GPS nélküli JANI a legjobb", h.legjobb?.kod, "JANI");
    eq("hozzárendelés: JANI vanGps = false", h.legjobb?.vanGps, false);
    const hatar = Object.fromEntries(h.kocsik.map((k) => [k.kod, k.hatarFt]));
    igaz("hozzárendelés: a legkisebb határköltség", h.kocsik.filter((k) => k.megengedett).every((k) => k.hatarFt! >= h.legjobb!.hatarFt!));
    eq("hozzárendelés: az ütköző kocsi nem megengedett", h.kocsik.find((k) => k.kod === "ABC-123")?.megengedett, false);
    igaz("hozzárendelés: NMZ olcsóbb, mint az üres AOPU", hatar["NMZ-492"]! < hatar["AOPU-427"]!);
    eq("hozzárendelés: NMZ-nél X1 után (pozíció 1)", h.kocsik.find((k) => k.kod === "NMZ-492")?.pozicio, 1);
    eq("hozzárendelés: NMZ új sorrendje", h.kocsik.find((k) => k.kod === "NMZ-492")?.sorrend, ["X1", "UJ"]);
    eq("hozzárendelés: a napi költség fix (üres kocsinál sem határköltség)", h.kocsik.find((k) => k.kod === "AOPU-427")!.vele!.napi - h.kocsik.find((k) => k.kod === "AOPU-427")!.nelkule.napi, 0);
    eq("hozzárendelés: JANI határköltsége (2 üres + 20 rakott) km × 168 Ft", h.legjobb?.hatarFt, 22 * 168);
    // Determinisztikus és a kocsik sorrendjétől független.
    const h2 = await javasolHozzarendelest(uj, NAP, [...kocsik].reverse(), szakasz, TELEPHELYEK);
    eq("hozzárendelés: determinisztikus", h2.legjobb?.kod, "JANI");
    // Ha senkinek nem fér bele: null.
    const tul = munka("TUL", 10, 20, { raklapDb: 2000 });
    eq("hozzárendelés: kapacitás miatt senki", (await javasolHozzarendelest(tul, NAP, kocsik, szakasz, TELEPHELYEK)).legjobb, null);
  }

  // ---------------------------------------------------------------- 12. ujjlenyomat és küszöb
  {
    const A = munka("A", 10, 20, { tervIdo: T("08:00") }), Bm = munka("B", 30, 40);
    const alap = { nap: NAP, munkak: [A, Bm], jelenlegiSorrend: ["A", "B"], indulas: H(0), kapacitas: KAP, menetVerzio: 3 };
    const u = bemenetUjjlenyomat(alap);
    eq("ujjlenyomat: 16 hex", /^[0-9a-f]{16}$/.test(u), true);
    eq("ujjlenyomat: a munkák tömb-sorrendje nem számít", bemenetUjjlenyomat({ ...alap, munkak: [Bm, A] }), u);
    igaz("ujjlenyomat: ablak-változás", bemenetUjjlenyomat({ ...alap, munkak: [{ ...A, tervIdo: T("09:00") }, Bm] }) !== u);
    igaz("ujjlenyomat: menet-verzió", bemenetUjjlenyomat({ ...alap, menetVerzio: 4 }) !== u);
    igaz("ujjlenyomat: sorrend", bemenetUjjlenyomat({ ...alap, jelenlegiSorrend: ["B", "A"] }) !== u);
    igaz("ujjlenyomat: tény", bemenetUjjlenyomat({ ...alap, munkak: [{ ...A, tenyIdo: T("08:05") }, Bm] }) !== u);

    const minta = (ft: number, km: number, megengedett = true): SorrendEredmeny => ({
      jelenlegi: { sorrend: ["A", "B"], megengedett } as SorrendEredmeny["jelenlegi"],
      legjobb: { sorrend: ["B", "A"], megengedett: true } as SorrendEredmeny["jelenlegi"],
      modszer: "teljes_bejaras", vizsgalt: 3, megtakaritasFt: ft, megtakaritasKm: km, megjegyzesek: [], legkevesbeRosszSerulesek: [],
    });
    eq("küszöb: 999 Ft, 4 km → nem", erdemesJavasolni(minta(999, 4)), false);
    eq("küszöb: 1 000 Ft → igen", erdemesJavasolni(minta(1000, 0)), true);
    eq("küszöb: 5 km és pozitív Ft → igen", erdemesJavasolni(minta(500, 5)), true);
    eq("küszöb: a mostani nem megengedett → igen", erdemesJavasolni(minta(-2000, -3, false)), true);
  }

  // ---------------------------------------------------------------- 13. elfogadás: feladat-sorrend az átrendezéshez
  {
    const f = (id: string, sorszam: number, megbizasId: string | null, lezarvaAt: string | null = null) => ({ id, sorszam, megbizasId, lezarvaAt });
    // 1 üres → 2 A(lezárt) · 3 üres → 4 B · 5 C · 6 üres → 7 D
    const feladatok = [f("1", 1, null, "x"), f("2", 2, "A", "x"), f("3", 3, null), f("4", 4, "B"), f("5", 5, "C"), f("6", 6, null), f("7", 7, "D")];
    eq("feladat-sorrend: a lezárt előtag marad, az üres pozicionálás a munkájával mozog", feladatSorrendJavaslatbol(feladatok, ["A", "D", "B", "C"]), ["1", "2", "6", "7", "3", "4", "5"]);
    eq("feladat-sorrend: az előtag munkája nélkül is megy", feladatSorrendJavaslatbol(feladatok, ["C", "B", "D"]), ["1", "2", "5", "3", "4", "6", "7"]);
    eq("feladat-sorrend: eltérő munkák → null", feladatSorrendJavaslatbol(feladatok, ["B", "C"]), null);
    eq("feladat-sorrend: ismeretlen munka → null", feladatSorrendJavaslatbol(feladatok, ["B", "C", "X"]), null);
  }

  // ---------------------------------------------------------------- 14. a szerver-kör szabályai (forrás-ellenőrzés)
  {
    const szerver = readFileSync("lib/menet/optimalizalo-szerver.ts", "utf8");
    igaz("szerver: az elfogadás a meglévő átrendezés-úton megy", /atrendezMenet\(/.test(szerver));
    igaz("szerver: indok „optimalizáló javaslat #id”", szerver.includes("optimalizáló javaslat #"));
    igaz("szerver: javaslat-állapotú menetnél újragenerálás a sorrendben", /frissitMenetJavaslatot\(menet\.jarmuId, menet\.nap, ki, szerverTav\(\), sorrend\)/.test(szerver));
    igaz("szerver: az elavult jelölés", szerver.includes("'elavult'"));
    const akciok = readFileSync("lib/menet/optimalizalo-akciok.ts", "utf8");
    igaz("akciók: írás szerkesztési joggal", (akciok.match(/requireEditPermission\("fuvarozas"\)/g) ?? []).length >= 3);
    const utem = readFileSync("lib/fuvarozas2/modell-szinkron-scheduler.ts", "utf8");
    igaz("ütemező: az optimalizáló a saját try/catch blokkjában", /try \{\s*const op = await futtatRendszerkent\("optimalizalo"/.test(utem));
    const migr = readFileSync("db/migrations/033_optimalizalo_javaslat.sql", "utf8");
    igaz("migráció: nincs begin/commit", !/^\s*(begin|commit)\s*;/im.test(migr));
    igaz("migráció: állapot-check", migr.includes("'nyitott', 'elfogadva', 'elutasitva', 'elavult'"));
  }

  console.log(`\nOptimalizáló: ${ok} rendben, ${bad} hibás`);
  if (bad > 0) process.exit(1);
})();
