// Hét rács 2.0 · becslő motor: utemterv() (lib/fuvarozas2/heti-utemterv-alap.ts).
// Spec: docs/het-racs-2-terv.md („Becslő motor”, szabályok 1–10, „Tesztek”).
// Futtatás: npx tsx scripts/teszt-het-utemterv.ts
//
// Minden idő helyi Budapest "YYYY-MM-DDTHH:MM". A várt értékek kézzel számolva (lásd kommentek),
// a vezetési szabály a lib/fuvarozas/eta-lanc.ts vezetSzaballyal + megalloTavozas logikája:
//   - min(maradék, 270 − folyamatos, 540 − napi) vezetés; ha a napi keret fogy el ELŐBB VAGY
//     EGYSZERRE (keretig <= szunetig) → 660 p napi pihenő (mindkét számláló nullázódik),
//     különben 45 p szünet (folyamatos nullázódik). A rakodás nem szünet.
//   - megállóban: várakozás az ablakTol-ig; ≥ 45 p → szünet; ≥ 660 p → napi pihenő is.
//
// Választott értelmezések, ahol a spec nyitott (a jelentésben is):
//   (a) A fuvar ELSŐ megállója előtti tétlen rés (előző távozás → napKezdes / indulás) ugyanúgy
//       számít, mint egy megállóbeli várakozás: ≥ 45 p szünet, ≥ 660 p napi pihenő.
//   (b) NapMerleg.vezetesPerc a kezdő napon tartalmazza a kezdes.napiPerc-et (a tachó szerint
//       ma már levezetett időt), hogy a delutanSzabad maradéka valós legyen.
//   (c) km/perc kettévágásnál (napi pihenő / kamionstop) a km arányos a vezetett percekkel; a
//       teszt Math.round-dal hasonlít (a kerekítés módja szabad).
//   (d) A szakasz-km „rakott”, a ráállás-km „üres” — saját fuvarnál is.
//   (e) NapMerleg.kamionstop azon a napon, amikor a lánc a tilalmi ablakba ütközik (megáll).
//   (f) A `vegez` mezőt csak ott ellenőrizzük, ahol a lánc aznap megállóban ér véget; napi
//       pihenővel/kamionstoppal útközben végződő napon NEM (nyitott kérdés).
// A teszt a mezőket kiválogatva hasonlítja (az eredmény kaphat plusz mezőket).

import { utemterv, type UtemFuvar, type UtemKezdes, type UtemMegallo, type UtemParam } from "@/lib/fuvarozas2/heti-utemterv-alap";
import { tilalmiAblakok } from "@/lib/fuvarozas2/kamionstop";

let ok = 0, bad = 0;
function rendez(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(rendez);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, rendez((x as Record<string, unknown>)[k])]));
  return x;
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(rendez(kapott)) === JSON.stringify(rendez(vart))) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const P: UtemParam = {
  napKezdes: "06:00", szunetUtanPerc: 270, szunetPerc: 45, napiMaxPerc: 540, napiPihenoPerc: 660,
  tilalmak: tilalmiAblakok("2026-10-12", "2026-10-31"),
};
const K = (ido: string, folyamatosPerc = 0, napiPerc = 0): UtemKezdes => ({ ido, folyamatosPerc, napiPerc });
/** Megálló; az ablak "HH:MM" (a megálló napján) vagy teljes "YYYY-MM-DDTHH:MM". */
const M = (tipus: "felrako" | "lerako", varos: string, nap: string, tol: string | null, ig: string | null, rakodasPerc: number): UtemMegallo => {
  const t = (s: string | null) => (s == null ? null : s.length === 5 ? `${nap}T${s}` : s);
  return { tipus, varos, nap, ablakTol: t(tol), ablakIg: t(ig), rakodasPerc };
};
const F = (id: string, jelleg: "ber" | "sajat", dijFt: number | null, megallok: UtemMegallo[], szakaszok: [number, number][], raallas: [number, number], becsles = false): UtemFuvar => ({
  id, cim: id, jelleg, dijFt, megallok,
  szakaszok: szakaszok.map(([perc, km], i) => ({ perc, km, becsles: becsles && i === 0 })),
  raallas: { perc: raallas[0], km: raallas[1], becsles: false },
});
type R = ReturnType<typeof utemterv>;
// [tipus, varos, erkezes, kezdes, tavozas, varakozasPerc, tartalekPerc]
const megT = (r: R, fi: number) => r.fuvarok[fi].megallok.map((m) => [m.tipus, m.varos, m.erkezes, m.kezdes, m.tavozas, m.varakozasPerc, m.tartalekPerc]);
const fuvT = (r: R, fi: number) => {
  const f = r.fuvarok[fi];
  return { id: f.id, rakottKm: f.rakottKm, uresKmElotte: f.uresKmElotte, dijFt: f.dijFt, ftKm: f.ftKm, legszukebbTartalek: f.legszukebbTartalek, becsles: f.becsles };
};
const nap = (r: R, n: string) => {
  const x = r.napok.find((y) => y.nap === n);
  if (!x) return null;
  return {
    nap: x.nap, rakottKm: Math.round(x.rakottKm), uresKm: Math.round(x.uresKm), berFt: Math.round(x.berFt),
    vezetesPerc: Math.round(x.vezetesPerc), napiPihenoTol: x.napiPihenoTol, kamionstop: x.kamionstop, delutanSzabad: x.delutanSzabad,
  };
};
const URES = (n: string) => ({ nap: n, rakottKm: 0, uresKm: 0, berFt: 0, vezetesPerc: 0, napiPihenoTol: null, kamionstop: null, delutanSzabad: null });

// ---------------------------------------------------------------------------
// 1. Gergő hétfő 2026-10-19: Nyírbátor → Budapest BILK (bér), majd saját fuvar Budapest → Szakoly.
//    (Szabályok 1, 2, 4, 5, 6, 7, 9.) A megadott számokkal a nap 35+300+285 = 620 p vezetés lenne,
//    ez > 540, ezért a hazaúton napi pihenő jön (a spec „8:50 vezetés” címkéje ezekkel nem áll elő).
// ---------------------------------------------------------------------------
const gergoH = (): UtemFuvar[] => [
  F("A", "ber", 135000, [
    M("felrako", "Nyírbátor", "2026-10-19", "06:00", "08:00", 60),
    M("lerako", "Budapest", "2026-10-19", null, "14:00", 60),
  ], [[300, 265]], [35, 35]),
  F("B", "sajat", null, [
    M("felrako", "Budapest", "2026-10-19", null, null, 45),
    M("lerako", "Szakoly", "2026-10-19", null, null, 45),
  ], [[285, 255]], [0, 0]),
];
{
  const napok = ["2026-10-19", "2026-10-20", "2026-10-21"];
  const r = utemterv(gergoH(), K("2026-10-19T06:00"), P, napok);
  eq("1 fuvar-sorrend", r.fuvarok.map((f) => f.id), ["A", "B"]);
  // indulás max(06:00, napKezdes 06:00) = 06:00; ráállás 35 → 06:35 (f35 n35); ablak 06:00 már nyitva → nincs várakozás;
  // rakodás 60 → 07:35. tartalék 08:00 − 06:35 = 85.
  // menet 300: szünetig 270−35 = 235 → 07:35+235 = 11:30 (f270 n270), 45 p szünet → 12:15, maradék 65 → 13:20 (f65 n335).
  // Budapest: tartalék 14:00 − 13:20 = 40; rakodás 60 → 14:20.
  eq("1 A megállók", megT(r, 0), [
    ["felrako", "Nyírbátor", "2026-10-19T06:35", "2026-10-19T06:35", "2026-10-19T07:35", 0, 85],
    ["lerako", "Budapest", "2026-10-19T13:20", "2026-10-19T13:20", "2026-10-19T14:20", 0, 40],
  ]);
  // díj/km: 135000 / 265 = 509,43 → 509.
  eq("1 A összesítő", fuvT(r, 0), { id: "A", rakottKm: 265, uresKmElotte: 35, dijFt: 135000, ftKm: 509, legszukebbTartalek: 40, becsles: false });
  // B: indulás max(14:20, 06:00) = 14:20, ráállás 0 → 14:20, rakodás 45 → 15:05.
  // menet 285 (f65 n335): szünetig 205, keretig 205 → egyszerre fogy (vezetSzaballyal: keretig <= szunetig → napi pihenő):
  // 15:05+205 = 18:30 (n540), 660 p pihenő → kedd 05:30, maradék 80 → 06:50; rakodás 45 → 07:35.
  eq("1 B megállók", megT(r, 1), [
    ["felrako", "Budapest", "2026-10-19T14:20", "2026-10-19T14:20", "2026-10-19T15:05", 0, null],
    ["lerako", "Szakoly", "2026-10-20T06:50", "2026-10-20T06:50", "2026-10-20T07:35", 0, null],
  ]);
  eq("1 B összesítő", fuvT(r, 1), { id: "B", rakottKm: 255, uresKmElotte: 0, dijFt: null, ftKm: null, legszukebbTartalek: null, becsles: false });
  // Hétfő: vezetés 35+300+205 = 540; rakott 265 + 255·205/285 (= 183,42) = 448,42 → 448; üres 35; bér 135000 (egy napos).
  // napi pihenő 18:30-tól. delutanSzabad: nincs (maradék 0, és a nap nem ér véget 15:00 előtt).
  eq("1 hétfő mérleg", nap(r, "2026-10-19"), {
    nap: "2026-10-19", rakottKm: 448, uresKm: 35, berFt: 135000, vezetesPerc: 540, napiPihenoTol: "2026-10-19T18:30", kamionstop: null, delutanSzabad: null,
  });
  // Kedd: vezetés 80; rakott 255·80/285 = 71,58 → 72; végez 07:35 Szakoly; 540 − 80 = 460 ≥ 180 → délután szabad.
  eq("1 kedd mérleg", nap(r, "2026-10-20"), {
    nap: "2026-10-20", rakottKm: 72, uresKm: 0, berFt: 0, vezetesPerc: 80, napiPihenoTol: null, kamionstop: null,
    delutanSzabad: { tol: "2026-10-20T07:35", maradekVezetesPerc: 460 },
  });
  eq("1 kedd végez", r.napok.find((n) => n.nap === "2026-10-20")?.vegez, { ido: "2026-10-20T07:35", varos: "Szakoly" });
  // Szabály 9: csak a kért napok, sorrendben; az üres szerda nullás, vegez null.
  eq("1 napok listája", r.napok.map((n) => n.nap), napok);
  eq("1 szerda üres", nap(r, "2026-10-21"), URES("2026-10-21"));
  eq("1 szerda végez", r.napok.find((n) => n.nap === "2026-10-21")?.vegez, null);

  // Szabály 2: korábbi kezdés (04:30) → az első megállóhoz a napKezdes (06:00) az indulás.
  const r2 = utemterv(gergoH(), K("2026-10-19T04:30"), P, napok);
  eq("2 napKezdes: 06:00 indulás", r2.fuvarok[0].megallok[0].erkezes, "2026-10-19T06:35");

  // Szabály 10: tiszta függvény — ugyanaz az eredmény, a bemenet (és a kezdes állapot) nem változik.
  const fuvarok = gergoH();
  const kezdes = K("2026-10-19T06:00");
  const elotte = JSON.stringify([fuvarok, kezdes, P, napok]);
  const x1 = utemterv(fuvarok, kezdes, P, napok);
  const x2 = utemterv(fuvarok, kezdes, P, napok);
  eq("10 determinisztikus", JSON.stringify(x1) === JSON.stringify(x2), true);
  eq("10 bemenet változatlan", JSON.stringify([fuvarok, kezdes, P, napok]) === elotte, true);
}

// ---------------------------------------------------------------------------
// 2. Gergő kedd 2026-10-20: Kisvárda → Debrecen (bér), délután szabad; csütörtökön újra.
//    (Szabályok 2, 8, és az (a) értelmezés: a kedd 11:00 → csüt 06:00 tétlen rés napi pihenő.)
// ---------------------------------------------------------------------------
const kisvarda = (id: string, n: string, rakLe = 45): UtemFuvar =>
  F(id, "ber", 60000, [
    M("felrako", "Kisvárda", n, "07:00", "09:00", 60),
    M("lerako", "Debrecen", n, null, "13:00", rakLe),
  ], [[120, 110]], [75, 70]);
{
  const napok = ["2026-10-20", "2026-10-21", "2026-10-22"];
  const r = utemterv([kisvarda("K1", "2026-10-20"), kisvarda("K2", "2026-10-22")], K("2026-10-20T06:00"), P, napok);
  // 06:00 + 75 → 07:15 (f75), ablak 07:00 nyitva, rakodás 60 → 08:15; tartalék 09:00 − 07:15 = 105.
  // menet 120 (f75 → 195 < 270) → 10:15; tartalék 13:00 − 10:15 = 165; rakodás 45 → 11:00.
  const vart = (n: string) => [
    ["felrako", "Kisvárda", `${n}T07:15`, `${n}T07:15`, `${n}T08:15`, 0, 105],
    ["lerako", "Debrecen", `${n}T10:15`, `${n}T10:15`, `${n}T11:00`, 0, 165],
  ];
  eq("2 K1 megállók", megT(r, 0), vart("2026-10-20"));
  // 60000 / 110 = 545,45 → 545.
  eq("2 K1 összesítő", fuvT(r, 0), { id: "K1", rakottKm: 110, uresKmElotte: 70, dijFt: 60000, ftKm: 545, legszukebbTartalek: 105, becsles: false });
  // K2: első megálló napja csütörtök → indulás max(kedd 11:00, csüt 06:00) = csüt 06:00. A rés ≥ 660 p → napi pihenő,
  // a számlálók nullázódnak, így ugyanazok az idők (nullázás nélkül f195+75 = 270 → Kisvárda után azonnal 45 p szünet lenne).
  eq("2 K2 megállók (csütörtök)", megT(r, 1), vart("2026-10-22"));
  // Kedd: vezetés 75+120 = 195; végez 11:00 Debrecen < 15:00; 540 − 195 = 345 ≥ 180; kedden nincs több fuvar.
  eq("2 kedd mérleg", nap(r, "2026-10-20"), {
    nap: "2026-10-20", rakottKm: 110, uresKm: 70, berFt: 60000, vezetesPerc: 195, napiPihenoTol: null, kamionstop: null,
    delutanSzabad: { tol: "2026-10-20T11:00", maradekVezetesPerc: 345 },
  });
  eq("2 kedd végez", r.napok.find((n) => n.nap === "2026-10-20")?.vegez, { ido: "2026-10-20T11:00", varos: "Debrecen" });
  eq("2 szerda üres", nap(r, "2026-10-21"), URES("2026-10-21"));
  eq("2 csütörtök vezetés (nem halmozódik)", nap(r, "2026-10-22")?.vezetesPerc, 195);

  // 15:00-s határ: Debrecen rakodás 285 → távozás 10:15 + 285 = 15:00, ami NEM < 15:00 → nincs délután szabad.
  const r3 = utemterv([kisvarda("K3", "2026-10-20", 285)], K("2026-10-20T06:00"), P, ["2026-10-20"]);
  eq("8 15:00-kor végez: nincs délután szabad", r3.napok[0].delutanSzabad, null);
  eq("8 15:00-kor végez: végez", r3.napok[0].vegez, { ido: "2026-10-20T15:00", varos: "Debrecen" });
}

// ---------------------------------------------------------------------------
// 3. Délután szabad, 180 p maradék-határ; a tachó szerinti mai vezetés beszámít ((b) értelmezés).
//    Kezdés kedd 09:30, ma már 165 p vezetett, utána ≥ 45 p állt (folyamatos 0).
// ---------------------------------------------------------------------------
{
  const f = () => [F("D", "ber", 60000, [
    M("felrako", "Kisvárda", "2026-10-20", "09:00", "12:00", 60),
    M("lerako", "Debrecen", "2026-10-20", null, null, 45),
  ], [[120, 110]], [75, 70])];
  // 09:30 + 75 → 10:45 (f75 n240); tartalék 12:00 − 10:45 = 75; 11:45; menet 120 (f195 n360) → 13:45; rakodás 45 → 14:30.
  const r = utemterv(f(), K("2026-10-20T09:30", 0, 165), P, ["2026-10-20"]);
  eq("3 megállók", megT(r, 0), [
    ["felrako", "Kisvárda", "2026-10-20T10:45", "2026-10-20T10:45", "2026-10-20T11:45", 0, 75],
    ["lerako", "Debrecen", "2026-10-20T13:45", "2026-10-20T13:45", "2026-10-20T14:30", 0, null],
  ]);
  // vezetés 165 + 195 = 360; 540 − 360 = 180 ≥ 180 → van.
  eq("8 pont 180 p maradék", r.napok[0].delutanSzabad, { tol: "2026-10-20T14:30", maradekVezetesPerc: 180 });
  eq("3 vezetés a tachóval", r.napok[0].vezetesPerc, 360);
  // 166 p korábbi vezetés → 179 p maradék → nincs.
  const r2 = utemterv(f(), K("2026-10-20T09:30", 0, 166), P, ["2026-10-20"]);
  eq("8 179 p maradék: nincs", r2.napok[0].delutanSzabad, null);
}

// ---------------------------------------------------------------------------
// 4. Micó hétfő → kedd: Tompaládony, Sárvár felrakás → Debrecen kedd 10:00. Napi pihenő útközben,
//    ablak miatti ≥ 45 p várakozás szünet, több napos díj km-arányosan. (Szabályok 3, 4, 5, 6, 7.)
// ---------------------------------------------------------------------------
{
  const fuvarok = [F("MICO", "ber", 450000, [
    M("felrako", "Tompaládony", "2026-10-19", "08:00", "12:00", 60),
    M("felrako", "Sárvár", "2026-10-19", "11:45", "14:00", 45),
    M("lerako", "Debrecen", "2026-10-20", "10:00", "12:00", 60),
  ], [[25, 18], [360, 432]], [210, 220])];
  const r = utemterv(fuvarok, K("2026-10-19T06:00"), P, ["2026-10-19", "2026-10-20"]);
  // ráállás 210 → 09:30 (f210 n210); tartalék 12:00 − 09:30 = 150; rakodás 60 → 10:30.
  // menet 25 → 10:55 (f235 n235); Sárvár ablak 11:45 → 50 p várakozás ≥ 45 → szünet (f0); tartalék 14:00 − 10:55 = 185;
  //   rakodás 45 → 12:30.
  // menet 360: szünetig 270, keretig 305 → 270 → 17:00 (f270 n505); szünet 45 → 17:45; keretig 35 → 18:20 (n540);
  //   napi pihenő 660 → kedd 05:20; maradék 55 → 06:15. Debrecen ablak 10:00 → 225 p várakozás; tartalék 12:00 − 06:15 = 345;
  //   rakodás 60 → 11:00.
  eq("4 megállók", megT(r, 0), [
    ["felrako", "Tompaládony", "2026-10-19T09:30", "2026-10-19T09:30", "2026-10-19T10:30", 0, 150],
    ["felrako", "Sárvár", "2026-10-19T10:55", "2026-10-19T11:45", "2026-10-19T12:30", 50, 185],
    ["lerako", "Debrecen", "2026-10-20T06:15", "2026-10-20T10:00", "2026-10-20T11:00", 225, 345],
  ]);
  // rakott 18 + 432 = 450; 450000 / 450 = 1000 Ft/km; legszűkebb min(150, 185, 345) = 150.
  eq("4 összesítő", fuvT(r, 0), { id: "MICO", rakottKm: 450, uresKmElotte: 220, dijFt: 450000, ftKm: 1000, legszukebbTartalek: 150, becsles: false });
  // Hétfő: vezetés 210+25+270+35 = 540; a 360 p-es szakaszból 305 p hétfőn → 432·305/360 = 366 km; rakott 18+366 = 384;
  //   bér 450000·384/450 = 384000. Kedd: 55 p, 432·55/360 = 66 km, bér 66000.
  eq("4 hétfő mérleg", nap(r, "2026-10-19"), {
    nap: "2026-10-19", rakottKm: 384, uresKm: 220, berFt: 384000, vezetesPerc: 540, napiPihenoTol: "2026-10-19T18:20", kamionstop: null, delutanSzabad: null,
  });
  eq("4 kedd mérleg", nap(r, "2026-10-20"), {
    nap: "2026-10-20", rakottKm: 66, uresKm: 0, berFt: 66000, vezetesPerc: 55, napiPihenoTol: null, kamionstop: null,
    delutanSzabad: { tol: "2026-10-20T11:00", maradekVezetesPerc: 485 },
  });
  eq("4 kedd végez", r.napok.find((n) => n.nap === "2026-10-20")?.vegez, { ido: "2026-10-20T11:00", varos: "Debrecen" });
  eq("7 bér összesen = díj", r.napok.reduce((s, n) => s + n.berFt, 0), 450000);
}

// ---------------------------------------------------------------------------
// 5. Ablak miatti várakozás szünetnek számít (≥ 45 p), rövidebb nem. (Szabály 3.)
//    Kezdés szerda 06:00, ma már 200 p vezetett folyamatosan.
// ---------------------------------------------------------------------------
{
  const f = (tol: string) => [F("W", "ber", 100000, [
    M("felrako", "Mátészalka", "2026-10-21", tol, "10:00", 30),
    M("lerako", "Miskolc", "2026-10-21", null, null, 30),
  ], [[200, 190]], [60, 60])];
  // ráállás 60 → 07:00 (f260 n260). Ablak 08:00 → 60 p várakozás → szünet (f0); 08:30; menet 200 → 11:50 (n460).
  const r = utemterv(f("08:00"), K("2026-10-21T06:00", 200, 200), P, ["2026-10-21"]);
  eq("3 60 p várakozás = szünet", megT(r, 0), [
    ["felrako", "Mátészalka", "2026-10-21T07:00", "2026-10-21T08:00", "2026-10-21T08:30", 60, 180],
    ["lerako", "Miskolc", "2026-10-21T11:50", "2026-10-21T11:50", "2026-10-21T12:20", 0, null],
  ]);
  // Ablak 07:40 → 40 p (< 45) nem szünet; 08:10; menet: 10 p (f270) → 08:20, szünet 45 → 09:05, 190 → 12:15.
  const r2 = utemterv(f("07:40"), K("2026-10-21T06:00", 200, 200), P, ["2026-10-21"]);
  eq("3 40 p várakozás nem szünet", megT(r2, 0), [
    ["felrako", "Mátészalka", "2026-10-21T07:00", "2026-10-21T07:40", "2026-10-21T08:10", 40, 180],
    ["lerako", "Miskolc", "2026-10-21T12:15", "2026-10-21T12:15", "2026-10-21T12:45", 0, null],
  ]);
}

// ---------------------------------------------------------------------------
// 6. ≥ 660 p várakozás a megállóban (másnapi ablak) napi pihenő: a napi keret nullázódik. (Szabályok 3, 5.)
// ---------------------------------------------------------------------------
{
  const fuvarok = [
    F("E1", "ber", 150000, [
      M("felrako", "Nyíregyháza", "2026-10-19", null, null, 60),
      M("lerako", "Budapest", "2026-10-20", "07:00", "09:00", 60),
    ], [[180, 170]], [30, 30]),
    F("E2", "ber", 120000, [
      M("felrako", "Budapest", "2026-10-20", null, null, 45),
      M("lerako", "Szeged", "2026-10-20", null, null, 45),
    ], [[240, 175]], [15, 10]),
  ];
  // Kezdés hétfő 12:00, ma már 300 p (f0). 12:30 (n330) → 13:30 → menet 180 → 16:30 (f210 n510).
  // Budapest ablak kedd 07:00 → 870 p várakozás ≥ 660 → napi pihenő; tartalék kedd 09:00 − hétfő 16:30 = 990; 08:00.
  // E2: indulás max(08:00, 06:00) = 08:00; 15 → 08:15; 09:00; menet 240 (f255 n255) → 13:00; 13:45.
  // (Nullázás nélkül n525 + 15 → a 240 p-es menetben 15 p után 11 órás pihenő lenne.)
  const r = utemterv(fuvarok, K("2026-10-19T12:00", 0, 300), P, ["2026-10-19", "2026-10-20"]);
  eq("6 E1 megállók", megT(r, 0), [
    ["felrako", "Nyíregyháza", "2026-10-19T12:30", "2026-10-19T12:30", "2026-10-19T13:30", 0, null],
    ["lerako", "Budapest", "2026-10-19T16:30", "2026-10-20T07:00", "2026-10-20T08:00", 870, 990],
  ]);
  eq("6 E2 megállók", megT(r, 1), [
    ["felrako", "Budapest", "2026-10-20T08:15", "2026-10-20T08:15", "2026-10-20T09:00", 0, null],
    ["lerako", "Szeged", "2026-10-20T13:00", "2026-10-20T13:00", "2026-10-20T13:45", 0, null],
  ]);
  // Kedd: vezetés 15+240 = 255; a megállóbeli éjszakázás nem „útközbeni” napi pihenő; 540 − 255 = 285.
  eq("6 kedd mérleg", nap(r, "2026-10-20"), {
    nap: "2026-10-20", rakottKm: 175, uresKm: 10, berFt: 120000, vezetesPerc: 255, napiPihenoTol: null, kamionstop: null,
    delutanSzabad: { tol: "2026-10-20T13:45", maradekVezetesPerc: 285 },
  });
  eq("6 kedd végez", r.napok.find((n) => n.nap === "2026-10-20")?.vegez, { ido: "2026-10-20T13:45", varos: "Szeged" });
}

// ---------------------------------------------------------------------------
// 7. Késés: negatív tartalék, a legszűkebb a legnegatívabb; becslés-jelző. (Szabály 6.)
// ---------------------------------------------------------------------------
{
  const f = (becsles: boolean) => [F("L", "ber", 135000, [
    M("felrako", "Nyírbátor", "2026-10-21", "06:00", "06:20", 60),
    M("lerako", "Budapest", "2026-10-21", null, "11:00", 60),
  ], [[300, 265]], [35, 35], becsles)];
  // Mint az 1. eset: 06:35 → tartalék 06:20 − 06:35 = −15; Budapest 13:20 → 11:00 − 13:20 = −140.
  const r = utemterv(f(false), K("2026-10-21T06:00"), P, ["2026-10-21"]);
  eq("6 negatív tartalék", megT(r, 0).map((m) => m[6]), [-15, -140]);
  eq("6 legszűkebb", r.fuvarok[0].legszukebbTartalek, -140);
  eq("becslés nincs", r.fuvarok[0].becsles, false);
  eq("becslés: a szakasz becsült", utemterv(f(true), K("2026-10-21T06:00"), P, ["2026-10-21"]).fuvarok[0].becsles, true);
}

// ---------------------------------------------------------------------------
// 8. Kamionstop szombat 22:00-nál (2026-10-17/18, nincs óraátállítás). (Szabályok 2, 4, 5, 7, 9.)
//    Az ablakban a szombat oszlop (fuvar van rajta), a vasárnap nem.
// ---------------------------------------------------------------------------
{
  const fuvarok = [F("KS", "ber", 260000, [
    M("felrako", "Nyíregyháza", "2026-10-17", null, null, 60),
    M("lerako", "Győr", "2026-10-19", "06:00", "08:00", 60),
  ], [[200, 260]], [30, 30])];
  const napok = ["2026-10-16", "2026-10-17", "2026-10-19"];
  const r = utemterv(fuvarok, K("2026-10-17T18:00"), P, napok);
  // szo 18:00 + 30 → 18:30; rakodás → 19:30; menet 200: 22:00-ig 150 p (f180 n180), tilalom szo 22:00 – v 22:00
  // (1440 p ≥ 660 → napi pihenő, nullázás), maradék 50 → v 22:50. Győr ablak h 06:00 → 430 p várakozás; 07:00.
  // tartalék h 08:00 − v 22:50 = 550.
  eq("8 megállók", megT(r, 0), [
    ["felrako", "Nyíregyháza", "2026-10-17T18:30", "2026-10-17T18:30", "2026-10-17T19:30", 0, null],
    ["lerako", "Győr", "2026-10-18T22:50", "2026-10-19T06:00", "2026-10-19T07:00", 430, 550],
  ]);
  eq("8 összesítő", fuvT(r, 0), { id: "KS", rakottKm: 260, uresKmElotte: 30, dijFt: 260000, ftKm: 1000, legszukebbTartalek: 550, becsles: false });
  eq("9 csak az ablak napjai", r.napok.map((n) => n.nap), napok);
  eq("9 péntek üres", nap(r, "2026-10-16"), URES("2026-10-16"));
  // Szombat: vezetés 30+150 = 180; rakott 260·150/200 = 195; bér 260000·195/260 = 195000 (a vasárnapi 65 km / 65000 Ft
  // a vasárnapra esik, ami nincs az ablakban). kamionstop = a szombati ablak.
  const szo = nap(r, "2026-10-17");
  eq("8 szombat mérleg", szo && [szo.rakottKm, szo.uresKm, szo.berFt, szo.vezetesPerc, szo.kamionstop], [
    195, 30, 195000, 180, { tol: "2026-10-17T22:00", ig: "2026-10-18T22:00", ok: "hétvégi kamionstop" },
  ]);
  // Hétfő: nincs vezetés (a v 22:00–22:50 vasárnapra esik), végez 07:00 Győr.
  const h = nap(r, "2026-10-19");
  eq("8 hétfő mérleg", h && [h.rakottKm, h.uresKm, h.berFt, h.vezetesPerc, h.kamionstop], [0, 0, 0, 0, null]);
  eq("8 hétfő végez", r.napok.find((n) => n.nap === "2026-10-19")?.vegez, { ido: "2026-10-19T07:00", varos: "Győr" });
}

// ---------------------------------------------------------------------------
// 9. Üres lánc: minden kért napra nullás mérleg. (Szabály 9.)
// ---------------------------------------------------------------------------
{
  const r = utemterv([], K("2026-10-19T06:00"), P, ["2026-10-19", "2026-10-20"]);
  eq("9 nincs fuvar", r.fuvarok, []);
  eq("9 üres napok", r.napok.map((n) => [nap(r, n.nap), n.vegez]), [[URES("2026-10-19"), null], [URES("2026-10-20"), null]]);
}

console.log(`teszt-het-utemterv: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
