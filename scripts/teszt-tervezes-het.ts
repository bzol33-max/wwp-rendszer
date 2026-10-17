// Tervezés · A hét: rések, ajánlat-illesztés, kiket hívj (lib/fuvarozas2/tervezes-het-alap.ts).
// Futtatás: npx tsx scripts/teszt-tervezes-het.ts

import { ajanlatFrissesseg, fuvarJel, hetEltolva, hetiReszek, napBelulFuzve, kovetkezoMunkanap, riasztandoResek, riasztasOsszerak, type Res, type RiasztasAjanlat, illeszt, kiketHivj, kiosztatlanCellak, legjobbRes, tervHetNapjai, utKm, type HetiFuvar } from "@/lib/fuvarozas2/tervezes-het-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const P = {
  szakoly: { lat: 47.77, lon: 21.93 }, nadudvar: { lat: 47.42, lon: 21.17 }, tata: { lat: 47.65, lon: 18.32 },
  tompa: { lat: 47.26, lon: 16.88 }, bp: { lat: 47.5, lon: 19.04 }, hszob: { lat: 47.44, lon: 21.39 }, debrecen: { lat: 47.53, lon: 21.63 },
  balkany: { lat: 47.77, lon: 21.86 }, teglas: { lat: 47.71, lon: 21.68 }, nyirbator: { lat: 47.84, lon: 22.13 },
};
const tel = { pont: P.szakoly, varos: "Szakoly" };
const napok = tervHetNapjai("2026-10-12");
eq("hét hétfőtől szombatig", napok, ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
eq("vasárnap → jövő hét", tervHetNapjai("2026-10-11")[0], "2026-10-12");
eq("szerda → e hét hétfő", tervHetNapjai("2026-10-14")[0], "2026-10-12");

const f = (id: string, fel: keyof typeof P, le: keyof typeof P, felNap: string, leNap = felNap, sajat = false): HetiFuvar =>
  ({ id, cim: id, felVaros: fel, leVaros: le, fel: P[fel], le: P[le], felNap, leNap, sajat });

// Gergő: Szakoly → (üres) Tata → Tompaládony, majd Tompaládony → Budapest, haza.
{
  const r = hetiReszek({ kod: "AOPU", sofor: "Gergő", elozoVeg: null, fuvarok: [f("a", "tata", "tompa", "2026-10-12"), f("b", "tompa", "bp", "2026-10-13")] }, napok, tel, 300);
  eq("rések", r.resek.map((x) => [x.nap, x.honnan, x.hova, x.haza]), [["2026-10-12", "Szakoly", "tata", false], ["2026-10-13", "bp", "Szakoly", true]]);
  eq("üres km Szakoly→Tata", r.resek[0].km, utKm(P.szakoly, P.tata));
  eq("Nádudvar 90 km: nem rés", hetiReszek({ kod: "X", sofor: "X", elozoVeg: null, fuvarok: [f("n", "nadudvar", "hszob", "2026-10-12")] }, napok, tel, 300).resek.length, 0);
  eq("Ft = km × költség", r.resek[0].ft, r.resek[0].km * 300);
  eq("szabad napok", r.cellak.map((c) => c.szabad), [false, false, true, true, true, true]);
}
// Gergő hétfő (élő eset): Szakoly → Nádudvar, (üres) Nádudvar → Tata, Tata → Tompaládony, haza —
// a Nádudvar → Tata rés a tatai fuvar ELÉ tartozik (a cella útvonal-sorrendje).
if (P.nadudvar && P.szakoly) {
  const r = hetiReszek({ kod: "AOPU", sofor: "Gergő", elozoVeg: null, fuvarok: [f("283", "szakoly", "nadudvar", "2026-10-12"), f("310", "tata", "tompa", "2026-10-12")] }, napok, tel, 300);
  const nemHaza = r.resek.filter((x) => !x.haza);
  eq("Nádudvar → Tata rés a 310 elé", nemHaza.map((x) => [x.honnan, x.hova, x.elott]), [["nadudvar", "tata", "310"]]);
  eq("haza rés utolsó, elott nélkül", r.resek.filter((x) => x.haza).map((x) => x.elott ?? null), [null]);
}
// Rövid üres (<100 km) nem rés; előző heti lerakóról indul.
{
  const r = hetiReszek({ kod: "NMZ", sofor: "Micó", elozoVeg: { pont: P.balkany, varos: "Balkány" }, fuvarok: [f("c", "teglas", "debrecen", "2026-10-14")] }, napok, tel, 300);
  eq("nincs rés közel", r.resek.length, 0);
  eq("csak a szerdai nap foglalt", r.cellak.map((c) => c.fuvarok.length), [0, 0, 1, 0, 0, 0]);
}
// Lerakó koordináta nélkül: utána nem becsülünk rést.
{
  const x = { ...f("g", "tata", "tompa", "2026-10-12"), le: null };
  const r = hetiReszek({ kod: "X", sofor: "X", elozoVeg: null, fuvarok: [x, f("h", "bp", "tata", "2026-10-14")] }, napok, tel, 300);
  eq("ismeretlen hely után nincs rés", r.resek.map((y) => y.honnan), ["Szakoly", "tata"]);
}
// Üres hét: nincs rés, minden nap szabad.
{
  const r = hetiReszek({ kod: "X", sofor: "X", elozoVeg: null, fuvarok: [] }, napok, tel, 300);
  eq("üres hét", [r.resek.length, r.cellak.every((c) => c.szabad)], [0, true]);
}
// Több napos fuvar minden érintett napon látszik; a héten kívüli nem.
{
  const r = hetiReszek({ kod: "X", sofor: "X", elozoVeg: null, fuvarok: [f("d", "teglas", "tompa", "2026-10-15", "2026-10-16"), f("e", "teglas", "debrecen", "2026-10-05")] }, napok, tel, 300);
  eq("kétnapos", r.cellak.map((c) => c.fuvarok.map((x) => x.id).join()), ["", "", "", "d", "d", ""]);
}
// Ajánlat illesztése a Szakoly → Tata résbe: Debrecen → Budapest kis kerülő.
{
  const res = hetiReszek({ kod: "AOPU", sofor: "Gergő", elozoVeg: null, fuvarok: [f("a", "tata", "tompa", "2026-10-12")] }, napok, tel, 300).resek[0];
  const p = { kmKoltseg: 300, oraFt: 6000, ftKmElozmeny: null };
  const i = illeszt(res, { varos: "Debrecen", pont: P.debrecen, nap: "2026-10-12" }, { varos: "Budapest", pont: P.bp, nap: "2026-10-12" }, p)!;
  eq("illik", !!i, true);
  eq("+km = kerülő", i.plusKm, Math.max(0, utKm(P.szakoly, P.debrecen) + utKm(P.debrecen, P.bp) + utKm(P.bp, P.tata) - res.km));
  eq("kis kerülő nem drága", i.draga, false);
  eq("+idő benne 1 óra rakodás", i.plusPerc, Math.round((i.plusKm / 60) * 60) + 60);
  eq("többlet", i.tobbletFt, Math.round(i.plusKm * 300 + (i.plusPerc / 60) * 6000));
  // Két ár (2026-10-11): fő = a TELJES önköltség létrája, kérj = +20%; alsó határ visszfuvarnál = többlet +10%.
  const ker = (x: number, l: number) => Math.ceil(Math.round(x * 100) / 100 / l) * l;
  eq("ráállás = rés eleje → felrakó", i.raallasKm, utKm(P.szakoly, P.debrecen));
  const tPerc = Math.round(((i.raallasKm + i.rakottKm) / 60) * 60) + 60;
  eq("teljes önköltség", i.teljesFt, Math.round((i.raallasKm + i.rakottKm) * 300 + (tPerc / 60) * 6000));
  eq("teljes ≥ többlet", i.teljesFt >= i.tobbletFt, true);
  eq("min = teljes +10%, 1000-re fel", i.minFt, ker(i.teljesFt * 1.1, 1000));
  eq("kérj = teljes +20%", i.kerjFt, ker(i.teljesFt * 1.2, 1000));
  eq("létra 3 foka", i.letra.fokok.map((f) => f.ft), [10, 20, 30].map((s) => ker((i.teljesFt * (100 + s)) / 100, 1000)));
  eq("alsó határ = többlet +10%", i.alsoFt, ker(i.tobbletFt * 1.1, 1000));
  eq("kérj ≥ min ≥ alsó határ", i.kerjFt >= i.minFt && i.minFt >= i.alsoFt, true);
  eq("árfolyam nélkül EUR null", [i.minEur, i.kerjEur, i.alsoEur], [null, null, null]);
  const ie = illeszt(res, { varos: "Debrecen", pont: P.debrecen, nap: "2026-10-12" }, { varos: "Budapest", pont: P.bp, nap: "2026-10-12" }, { ...p, eurArfolyam: 400 })!;
  eq("EUR 10-re felfelé", [ie.minEur! % 10, ie.kerjEur! % 10, ie.alsoEur! % 10, ie.kerjEur! >= ie.minEur!], [0, 0, 0, true]);
  eq("EUR kérj = teljes +20% / árfolyam", ie.kerjEur, ker((ie.teljesFt * 1.2) / 400, 10));
  eq("EUR alsó = többlet +10% / árfolyam", ie.alsoEur, ker((ie.tobbletFt * 1.1) / 400, 10));
  eq("rossz nap → nem illik", illeszt(res, { varos: "D", pont: P.debrecen, nap: "2026-10-16" }, { varos: "H", pont: P.hszob, nap: null }, p), null);
  eq("nagy kerülő → nem illik", illeszt(res, { varos: "B", pont: P.tompa, nap: null }, { varos: "B", pont: P.szakoly, nap: null }, p), null);
  eq("hely nélkül → nem illik", illeszt(res, { varos: "?", pont: null, nap: null }, { varos: "H", pont: P.hszob, nap: null }, p), null);
  const el = illeszt(res, { varos: "Debrecen", pont: P.debrecen, nap: null }, { varos: "Budapest", pont: P.bp, nap: null }, { ...p, ftKmElozmeny: 600 })!;
  // Az előzmény tájékoztató (külön mező), a kérést nem emeli — az árlétra az egyetlen szabály.
  eq("ár-memória külön mezőben", el.elozmenyFt, Math.ceil((600 * el.rakottKm) / 1000) * 1000);
  eq("ár-memória nem emeli a kérést", el.kerjFt, illeszt(res, { varos: "Debrecen", pont: P.debrecen, nap: null }, { varos: "Budapest", pont: P.bp, nap: null }, p)!.kerjFt);
  eq("legjobb rés", legjobbRes([res], { varos: "Debrecen", pont: P.debrecen, nap: null }, { varos: "Budapest", pont: P.bp, nap: null }, p)?.res.kulcs, res.kulcs);
  // Kiket hívj
  const mult = [
    { partner: "RBT", fel: P.teglas, felVaros: "Téglás", leVaros: "Budapest", nap: "2026-09-03", dijFt: 130000 },
    { partner: "RBT", fel: P.teglas, felVaros: "Téglás", leVaros: "Gyöngyös", nap: "2026-08-19", dijFt: 90000 },
    { partner: "Flott", fel: P.balkany, felVaros: "Nyírbátor", leVaros: "Budapest", nap: "2026-09-07", dijFt: 130000 },
    { partner: "Flott", fel: P.balkany, felVaros: "Nyírbátor", leVaros: "Budapest", nap: "2026-09-01", dijFt: 130000 },
    { partner: "Flott", fel: P.balkany, felVaros: "Nyírbátor", leVaros: "Budapest", nap: "2026-08-01", dijFt: 120000 },
    { partner: "Egyszeri", fel: P.balkany, felVaros: "B", leVaros: "C", nap: "2026-09-01", dijFt: 1 },
    { partner: "Messze", fel: P.tompa, felVaros: "T", leVaros: "C", nap: "2026-09-01", dijFt: 1 },
    { partner: "Messze", fel: P.tompa, felVaros: "T", leVaros: "C", nap: "2026-09-02", dijFt: 1 },
  ];
  const h = kiketHivj(res, mult);
  eq("kiket hívj sorrend", h.map((x) => [x.partner, x.db]), [["Flott", 3], ["RBT", 2]]);
  eq("utolsó út", [h[1].utolsoUt, h[1].utolsoNap, h[1].utolsoDijFt], ["Téglás → Budapest", "2026-09-03", 130000]);
}

{
  // Kocsira váró fuvarok a hét napjain (2026-10-12).
  const k = (id: string, felNap: string, leNap = felNap): HetiFuvar => ({ id, cim: id, felVaros: "A", leVaros: "B", fel: null, le: null, felNap, leNap, sajat: false });
  const c = kiosztatlanCellak([k("szerda", "2026-10-14"), k("multheti", "2026-10-09", "2026-10-13"), k("lerakva", "2026-10-12"), k("jovohet", "2026-10-19"), k("szombat", "2026-10-17")], napok, "2026-10-13");
  eq("kiosztatlan: a felrakás napján", c[2].map((x) => x.id), ["szerda"]);
  eq("kiosztatlan: a hét előtt indult, még tartó a hétfőn", c[0].map((x) => x.id), ["multheti"]);
  eq("kiosztatlan: a már lerakott és a jövő heti kimarad", c.flat().map((x) => x.id).sort(), ["multheti", "szerda", "szombat"]);
  eq("kiosztatlan: üres hét", kiosztatlanCellak([], napok, "2026-10-13").flat().length, 0);
}

{
  // Aktualitás (2026-10-14): szerdán a hétfői rés már nem számít, a múlt napok nem „szabadok”.
  const r = hetiReszek({ kod: "AOPU", sofor: "Gergő", elozoVeg: null, fuvarok: [f("a", "tata", "tompa", "2026-10-12"), f("b", "tompa", "bp", "2026-10-13")] }, napok, tel, 300, "2026-10-14");
  eq("múlt rés kimarad", r.resek.map((x) => x.nap), []);
  eq("múlt napok nem szabadok", r.cellak.map((c) => c.szabad), [false, false, true, true, true, true]);
  const r2 = hetiReszek({ kod: "AOPU", sofor: "Gergő", elozoVeg: null, fuvarok: [f("a", "tata", "tompa", "2026-10-12"), f("b", "tompa", "bp", "2026-10-13")] }, napok, tel, 300, "2026-10-13");
  eq("mai rés marad", r2.resek.map((x) => [x.nap, x.haza]), [["2026-10-13", true]]);
  eq("hét-lapozás", [hetEltolva("2026-10-12", 1), hetEltolva("2026-10-12", -1)], ["2026-10-19", "2026-10-05"]);
  eq("fuvar-jel", [fuvarJel("folyamatban"), fuvarJel("teljesitve"), fuvarJel("lezart"), fuvarJel("tervezett"), fuvarJel(undefined)], ["uton", "kesz", "kesz", "terv", "terv"]);
  const most = new Date("2026-10-14T10:00:00Z");
  eq("ajánlat: friss", ajanlatFrissesseg("2026-10-14T09:40:00Z", most), { orak: 0, szoveg: "most jött", regi: false });
  eq("ajánlat: órák", ajanlatFrissesseg("2026-10-14T05:00:00Z", most), { orak: 5, szoveg: "5 órája", regi: false });
  eq("ajánlat: régi", ajanlatFrissesseg("2026-10-12T08:00:00Z", most), { orak: 50, szoveg: "2 napja", regi: true });
}

// Gergő 10.19. (élő eset, 2026-10-17): ugyanaznap Budapest → Szakoly (#317, korábban rögzítve)
// és Nyírbátor → Budapest (#323). Balkányból indulva a nyírbátori jön előbb, rés nincs.
{
  const fuv = [f("317", "bp", "szakoly", "2026-10-19"), f("323", "nyirbator", "bp", "2026-10-19")];
  const het2 = tervHetNapjai("2026-10-19");
  const r = hetiReszek({ kod: "AOPU", sofor: "Gergő", elozoVeg: { pont: P.balkany, varos: "Balkány" }, fuvarok: fuv }, het2, tel, 300);
  eq("egy nap: földrajzi sorrend", r.cellak[0].fuvarok.map((x) => x.id), ["323", "317"]);
  eq("egy nap: nincs hamis rés", r.resek.length, 0);
  eq("fűzés: más nap sorrendje marad", napBelulFuzve([f("a", "bp", "szakoly", "2026-10-19"), f("b", "nyirbator", "bp", "2026-10-20")], P.balkany).map((x) => x.id), ["a", "b"]);
  const nincsKoord = { ...f("x", "bp", "bp", "2026-10-19"), fel: null };
  eq("fűzés: koordináta nélküli a végére", napBelulFuzve([nincsKoord, f("y", "nyirbator", "bp", "2026-10-19")], P.balkany).map((x) => x.id), ["y", "x"]);
  eq("fűzés: ismeretlen kezdőpont → marad", napBelulFuzve(fuv, null).map((x) => x.id), ["317", "323"]);
}

// Visszfuvar-riasztás (2. hullám #3).
{
  eq("köv. munkanap: szerda → csütörtök", kovetkezoMunkanap("2026-10-14"), "2026-10-15");
  eq("köv. munkanap: péntek → hétfő", kovetkezoMunkanap("2026-10-16"), "2026-10-19");
  eq("köv. munkanap: szombat → hétfő", kovetkezoMunkanap("2026-10-17"), "2026-10-19");
  eq("köv. munkanap: vasárnap → hétfő", kovetkezoMunkanap("2026-10-18"), "2026-10-19");
  eq("köv. munkanap: okt. 23. ünnep átugorva", kovetkezoMunkanap("2026-10-22"), "2026-10-26");
  const res = (kulcs: string, nap: string, km: number): Res => ({ kulcs, kocsi: "X", sofor: "X", nap, honnan: "a", hova: "b", a: P.bp, b: P.szakoly, km, ft: km * 300, haza: false });
  const resek = [res("1", "2026-10-15", 150), res("2", "2026-10-16", 300), res("3", "2026-10-15", 250), res("4", "2026-10-14", 400), res("5", "2026-10-19", 200)];
  eq("riasztandó: ma és holnap, időrend, hosszabb elöl", riasztandoResek(resek, "2026-10-15").map((r) => r.kulcs), ["3", "1", "2"]);
  eq("riasztandó: péntek → hétfő is", riasztandoResek(resek, "2026-10-16").map((r) => r.kulcs), ["2", "5"]);
  const illik = (tobbletFt: number) => ({ tobbletFt } as unknown as RiasztasAjanlat["illik"]);
  const a = (id: string, tobblet: number, regi = false): RiasztasAjanlat => ({ id, megbizo: id, felVaros: "f", leVaros: "l", regi, illik: illik(tobblet) });
  const hiv = [1, 2, 3, 4].map((i) => ({ partner: `P${i}`, db: 2, utolsoUt: "", utolsoNap: "", utolsoDijFt: null, tavKm: 10 }));
  const r = riasztasOsszerak(resek[0], [a("drága", 90_000), a("régi-olcsó", 10_000, true), a("olcsó", 40_000)], hiv);
  eq("összerak: friss és legkisebb többlet", r.ajanlat?.id, "olcsó");
  eq("összerak: max 3 hívandó", r.hivandok.map((h) => h.partner), ["P1", "P2", "P3"]);
  eq("összerak: csak régi → az is jó", riasztasOsszerak(resek[0], [a("régi", 5, true)], []).ajanlat?.id, "régi");
  eq("összerak: nincs jelölt → null", riasztasOsszerak(resek[0], [], []).ajanlat, null);
}

console.log(`teszt-tervezes-het: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
