// Ajánlat oldal · Q2 keresési javaslat (docs/ajanlat-q2-terv.md).
// Futtatás: npx tsx scripts/teszt-kereses-javaslat.ts

import {
  elsoNapKeret, hazaNapja, kocsiJavaslat, keresesiJavaslatok, napokKell, timocomKeresSzoveg,
  type KeresAjanlat, type KeresKocsi, type KeresMult, type KeresParam,
} from "@/lib/fuvarozas2/kereses-javaslat-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const P = {
  kisvarda: { lat: 48.22, lon: 22.08 }, szakoly: { lat: 47.77, lon: 21.91 }, budapest: { lat: 47.5, lon: 19.04 },
  bpBilk: { lat: 47.38, lon: 19.17 }, gyor: { lat: 47.69, lon: 17.63 }, debrecen: { lat: 47.53, lon: 21.63 },
  nyiregyhaza: { lat: 47.95, lon: 21.72 }, sarvar: { lat: 47.25, lon: 16.93 }, mateszalka: { lat: 47.95, lon: 22.32 },
  balkany: { lat: 47.77, lon: 21.86 },
};
const H = (varos: keyof typeof P) => ({ varos: varos[0].toUpperCase() + varos.slice(1), pont: P[varos] });
const param: KeresParam = { telephely: { varos: "Szakoly", pont: P.szakoly }, kmKoltseg: 300 };

// --- haza-nap (2026-10-23 péntek nemzeti ünnep) ---
eq("haza-nap: kedd → csütörtök (péntek ünnep)", hazaNapja("2026-10-20"), "2026-10-22");
eq("haza-nap: következő hét kedd → péntek", hazaNapja("2026-10-27"), "2026-10-30");
eq("haza-nap: szerdai szabadság → kedd", hazaNapja("2026-10-27", ["2026-10-28"]), "2026-10-27");
eq("haza-nap: pénteki szabadság → csütörtök", hazaNapja("2026-10-26", ["2026-10-30"]), "2026-10-29");
eq("haza-nap: pénteken péntek", hazaNapja("2026-10-30"), "2026-10-30");

// --- vezetési keret ---
eq("keret: tachóból", elsoNapKeret({ nap: "2026-10-20", ido: "08:37", hely: H("kisvarda"), vezetesHatraPerc: 458, becsult: false }), 458);
eq("keret: idő szerint (14:00 → 4 ó)", elsoNapKeret({ nap: "2026-10-20", ido: "14:00", hely: H("kisvarda"), vezetesHatraPerc: null, becsult: false }), 240);
eq("keret: 19:00 → 0", elsoNapKeret({ nap: "2026-10-20", ido: "19:00", hely: H("kisvarda"), vezetesHatraPerc: null, becsult: false }), 0);
eq("keret: idő nélkül teljes nap", elsoNapKeret({ nap: "2026-10-20", ido: null, hely: H("kisvarda"), vezetesHatraPerc: null, becsult: false }), 540);
eq("napok: belefér", napokKell(400, 458), 1);
eq("napok: +1 nap", napokKell(900, 458), 2);
eq("napok: +2 nap", napokKell(1100, 458), 3);

// --- Gergő: kedd 08:37 Kisvárda ---
const mult: KeresMult[] = [
  { partner: "FLOTT", fel: H("kisvarda"), le: H("budapest"), nap: "2026-10-01", dijFt: 240000 },
  { partner: "FLOTT", fel: H("kisvarda"), le: H("bpBilk"), nap: "2026-09-20", dijFt: 220000 },
  { partner: "Lösung", fel: H("mateszalka"), le: H("gyor"), nap: "2026-09-10", dijFt: 380000 },
  { partner: "Helyi Kft.", fel: H("kisvarda"), le: H("debrecen"), nap: "2026-09-05", dijFt: 90000 },
  { partner: "Messzi", fel: H("budapest"), le: H("sarvar"), nap: "2026-09-01", dijFt: 200000 }, // felrakó messze: kimarad
];
const ajanlatok: KeresAjanlat[] = [
  { id: "t1", megbizo: "Timo Bt.", fel: H("nyiregyhaza"), le: H("budapest"), felNap: "2026-10-20", arFt: 230000 },
  { id: "t2", megbizo: "Régi", fel: H("nyiregyhaza"), le: H("gyor"), felNap: "2026-10-15", arFt: 999999 }, // lejárt nap: kimarad
];
const gergo: KeresKocsi = { kod: "AOPU-427", sofor: "Gergő", szabad: { nap: "2026-10-20", ido: "08:37", hely: H("kisvarda"), vezetesHatraPerc: 458, becsult: false }, tavolletNapok: [] };
const g = kocsiJavaslat(gergo, mult, ajanlatok, param);
eq("Gergő: haza-nap csütörtök", g.hazaNap, "2026-10-22");
eq("Gergő: 3 irány", g.iranyok.length, 3);
eq("Gergő: irányok", g.iranyok.map((i) => [i.nev, i.cimke]), [["Budapest felé", "tobb-penz"], ["Gyor felé", "tovabbi"], ["Debrecen felé", "hazafele"]]);
const bp = g.iranyok.find((i) => i.nev === "Budapest felé")!;
eq("Budapest: 2 múlt + 1 Timocom (BILK egy csoportban)", [bp.multDb, bp.timocomDb], [2, 1]);
eq("Budapest: medián díj", bp.dijFt, 230000);
eq("Budapest: a lejárt Timocom nincs benne", bp.ajanlatIdk, ["t1"]);
eq("Budapest: partner FLOTT kétszer", bp.partnerek[0], { partner: "FLOTT", db: 2, utolsoNap: "2026-10-01", utolsoDijFt: 240000 });
eq("Budapest: hazaér csütörtökre", bp.hazaer, true);
eq("Budapest: legalább 1 éj kint", bp.ejszakaKint >= 1, true);
eq("Győr: messzebb → több éj", g.iranyok[1].ejszakaKint >= bp.ejszakaKint, true);
eq("a Messzi (Bp felrakó) nincs a partnerek közt", g.iranyok.some((i) => i.partnerek.some((x) => x.partner === "Messzi")), false);
eq("Timocom-szöveg", timocomKeresSzoveg("Kisvárda", bp), "Kisvárda +50 km → Budapest +50 km");

// --- csak haza: a haza-nap maga ---
const csut: KeresKocsi = { ...gergo, szabad: { ...gergo.szabad!, nap: "2026-10-22" } };
const c = kocsiJavaslat(csut, mult, ajanlatok, param);
eq("csütörtök: csak haza", c.csakHaza, true);
eq("csütörtök: Budapest/Győr nincs, Debrecen hazafelé", c.iranyok.map((i) => i.cimke), ["hazafele"]);

// --- Micó: szerdán szabadság ---
const mico: KeresKocsi = { kod: "NMZ-492", sofor: "Micó", szabad: { nap: "2026-10-20", ido: "11:38", hely: H("debrecen"), vezetesHatraPerc: null, becsult: false }, tavolletNapok: ["2026-10-21"] };
const m = kocsiJavaslat(mico, [], [], param);
eq("Micó: haza-nap = kedd", m.hazaNap, "2026-10-20");
eq("Micó: nincs adat → csak üresen haza", [m.nincsAdat, m.iranyok.map((i) => i.cimke)], [true, ["ures-haza"]]);
eq("Micó: Debrecen → Szakoly hazaér aznap", [m.iranyok[0].hazaer, m.iranyok[0].ejszakaKint], [true, 0]);

// --- távollét a szabad napon ---
const tav = kocsiJavaslat({ ...mico, tavolletNapok: ["2026-10-20"] }, mult, ajanlatok, param);
eq("távollét a szabad napon", [tav.tavolletben, tav.iranyok.length], [true, 0]);

// --- nincs szabad hely ---
eq("szabad nélkül üres", kocsiJavaslat({ ...gergo, szabad: null }, mult, ajanlatok, param).iranyok, []);
eq("pont nélkül üres", kocsiJavaslat({ ...gergo, szabad: { ...gergo.szabad!, hely: { varos: "?", pont: null } } }, mult, ajanlatok, param).iranyok, []);

// --- sorrend ---
const sor = keresesiJavaslatok([{ ...gergo, kod: "B", szabad: null }, mico, gergo], mult, ajanlatok, param).map((k) => k.sofor + k.kod);
eq("felszabadulás sorrendje, szabad nélküli a végén", sor, ["GergőAOPU-427", "MicóNMZ-492", "GergőB"]);

// --- díj nélküli múlt: pontszám null, nem „több pénz” ---
const dijNelkul = kocsiJavaslat(gergo, [{ partner: "X", fel: H("kisvarda"), le: H("gyor"), nap: "2026-10-01", dijFt: null }], [], param);
eq("díj nélkül, egyszeri: nincs „több pénz”, nincs „gyakori”", dijNelkul.iranyok.map((i) => i.cimke), ["tovabbi", "ures-haza"]);

// --- jól fizető Győr: több pénz; Budapest (2 múlt + 1 Timocom) gyakori ---
const gyorDraga = mult.map((m) => (m.le.varos === "Gyor" ? { ...m, dijFt: 700000 } : m));
eq("Győr több pénz, Budapest gyakori, Debrecen hazafelé", kocsiJavaslat(gergo, gyorDraga, ajanlatok, param).iranyok.map((i) => [i.nev, i.cimke]), [["Gyor felé", "tobb-penz"], ["Budapest felé", "gyakori"], ["Debrecen felé", "hazafele"]]);

// --- péntekre nem ér haza: este szabadul csütörtök előtt, Sárvár felé ---
const este: KeresKocsi = { ...gergo, szabad: { nap: "2026-10-21", ido: "17:30", hely: H("kisvarda"), vezetesHatraPerc: 30, becsult: false } };
const e = kocsiJavaslat(este, [{ partner: "Y", fel: H("kisvarda"), le: H("sarvar"), nap: "2026-10-01", dijFt: 500000 }], [], param);
eq("Sárvár nem fér bele → csak a végén, nem ér haza", [e.iranyok.at(-1)?.nev, e.iranyok.at(-1)?.hazaer], ["Sarvar felé", false]);
eq("az első a hazavezető sor", e.iranyok[0].cimke, "ures-haza");

console.log(`teszt-kereses-javaslat: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
