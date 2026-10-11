// Megbízások · pénz-nézet besorolás és összesítő (lib/fuvarozas2/penz-lista-alap.ts).
// Futtatás: npx tsx scripts/teszt-penz-lista.ts

import { osszegSzoveg, osszesit, penzAllapot, szurobeEsik, type PenzBemenet } from "@/lib/fuvarozas2/penz-lista-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  const n = (x: unknown) => JSON.stringify(x).replace(/\\u00a0|\u00a0/g, " ");
  if (n(kapott) === n(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const MA = "2026-10-11";
const alap: PenzBemenet = { id: "1", jelleg: "ber", allapot: "teljesitve", nap: "2026-10-09", fuvardij: 480, penznem: "EUR", szamlaSzam: null, vanPapir: true, szamla: null };
const sz = (x: Partial<NonNullable<PenzBemenet["szamla"]>>) => ({ brutto: 100000, fizetett: 0, penznem: "HUF", kiallitas: "2026-09-20", hatarido: "2026-10-20", fizetve: false, fizetveNap: null, ...x });

const a1 = penzAllapot(alap, MA);
eq("számlázatlan bér", [a1.kesz, a1.szamlazatlan, a1.papirHianyzik, a1.kor], [true, true, false, 2]);
eq("teendő", szurobeEsik(a1, "teendo"), true);
eq("úton lévő nem kész", penzAllapot({ ...alap, allapot: "folyamatban" }, MA).kesz, false);
const sajat = penzAllapot({ ...alap, jelleg: "sajat", vanPapir: false, nap: "2026-10-05" }, MA);
eq("saját: nincs számla, papír hiányzik", [sajat.szamlazatlan, sajat.papirHianyzik, sajat.kor], [false, true, 6]);
eq("régi saját papírt nem kérünk", penzAllapot({ ...alap, jelleg: "sajat", vanPapir: false, nap: "2026-07-01" }, MA).papirHianyzik, false);
eq("postázott papírja megvolt", penzAllapot({ ...alap, allapot: "postazva", vanPapir: false, szamlaSzam: "X" }, MA).papirHianyzik, false);
const kik = penzAllapot({ ...alap, allapot: "postazva", szamlaSzam: "A", szamla: sz({}) }, MA);
eq("kiküldve", [kik.kikuldve, kik.lejart, kik.fizetve, szurobeEsik(kik, "teendo")], [true, false, false, false]);
const lej = penzAllapot({ ...alap, allapot: "postazva", szamlaSzam: "B", szamla: sz({ hatarido: "2026-10-01" }) }, MA);
eq("lejárt 10 napja", [lej.lejart, lej.lejartNap, szurobeEsik(lej, "teendo")], [true, 10, true]);
const fiz = penzAllapot({ ...alap, allapot: "lezart", szamlaSzam: "C", szamla: sz({ fizetve: true, fizetveNap: "2026-10-03" }) }, MA);
eq("fizetve", [fiz.fizetve, fiz.lejart, fiz.kikuldve], [true, false, false]);

// Összesítő
const sorok = [
  { ...alap },
  { ...alap, id: "2", penznem: "Ft", fuvardij: 30000 },
  { ...alap, id: "3", jelleg: "sajat" as const, vanPapir: false, nap: "2026-10-05", fuvardij: null },
  { ...alap, id: "4", allapot: "postazva", szamlaSzam: "B", szamla: sz({ hatarido: "2026-10-01", kiallitas: "2026-08-01", brutto: 250000, fizetett: 50000 }) },
  { ...alap, id: "5", allapot: "postazva", szamlaSzam: "B", szamla: sz({ hatarido: "2026-10-01", kiallitas: "2026-08-01", brutto: 250000, fizetett: 50000 }) },
  { ...alap, id: "6", allapot: "postazva", szamlaSzam: "D", szamla: sz({ penznem: "EUR", brutto: 609.6, kiallitas: "2026-10-01" }) },
  { ...alap, id: "7", allapot: "lezart", szamlaSzam: "C", szamla: sz({ fizetve: true, fizetveNap: "2026-10-03", brutto: 120000 }) },
  { ...alap, id: "8", allapot: "lezart", szamlaSzam: "E", szamla: sz({ fizetve: true, fizetveNap: "2026-09-30", brutto: 99999 }) },
].map((s) => ({ ...s, a: penzAllapot(s, MA) }));
const o = osszesit(sorok, MA);
eq("számlázatlan", [o.szamlazatlan.db, osszegSzoveg(o.szamlazatlan.osszeg)], [2, "480 EUR + 30 000 Ft"]);
eq("papír", [o.papir.db, o.papir.legregebbi], [1, 6]);
eq("kintlévő számlánként egyszer", osszegSzoveg(o.kintlevo.osszeg), "610 EUR + 200 000 Ft");
eq("kintlévő sávok", o.kintlevo.savok.map(osszegSzoveg), ["610 EUR", "0 Ft", "200 000 Ft"]);
eq("lejárt", [o.lejart.db, osszegSzoveg(o.lejart.osszeg)], [1, "200 000 Ft"]);
eq("befolyt a hónapban", [o.befolyt.db, osszegSzoveg(o.befolyt.osszeg)], [1, "120 000 Ft"]);
eq("szűrő-számok", [o.szamok.teendo, o.szamok.szamlazatlan, o.szamok.papir, o.szamok.kikuldve, o.szamok.lejart, o.szamok.fizetve, o.szamok.mind], [5, 2, 1, 1, 2, 2, 8]);

console.log(`teszt-penz-lista: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
