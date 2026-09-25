// Számlázz.hu-s szállítólevél ↔ saját fuvar párosítás tesztje.
// Futtatás: npx tsx scripts/teszt-szallitolevel-parositas.ts
//
// Valós minta: S-WLLWR-2026-162 · FABRIKA + 2000 Kft. · 2026.09.23. ·
// „Rendszám:NMZ-492,XZV-926” · Használt EUR Raklap 812 db.

import { parositSzallitoleveleket, rendszamEgyezik, vevoEgyezik, type SzlFuvar, type SzlSzallitolevel } from "@/lib/fuvarozas2/szallitolevel-parositas";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const sz162: SzlSzallitolevel = { bizonylatszam: "S-WLLWR-2026-162", kelt: "2026-09-23", vevo: "FABRIKA + 2000 Kft.", rendszam: "NMZ-492,XZV-926" };
const fabrika: SzlFuvar = { id: "1", datum: "2026-09-23", jarmuRendszam: "NMZ-492", kinek: null, hova: "Fabrika, 9662 Tompaládony 0117/8 hrsz." };

eq("rendszám: vontató+pótkocsi → Micó kocsija", rendszamEgyezik("NMZ-492,XZV-926", "NMZ-492"), true);
eq("rendszám: a jarmu-címke alakja is", rendszamEgyezik("NMZ-492,XZV-926", "Micó — NMZ-492/XZV-926"), true);
eq("rendszám: másik kocsi", rendszamEgyezik("NMZ-492,XZV-926", "AOPU-427"), false);
eq("vevő a hová szövegben", vevoEgyezik("FABRIKA + 2000 Kft.", fabrika), true);
eq("vevő a kinek mezőben", vevoEgyezik("FABRIKA + 2000 Kft.", { kinek: "FABRIKA + 2000 Kft.", hova: "Tompaládony" }), true);
eq("más vevő", vevoEgyezik("Keter Hungary Kft.", fabrika), false);

eq("valós eset párosul", parositSzallitoleveleket([fabrika], [sz162]), [{ fuvarId: "1", bizonylatszam: "S-WLLWR-2026-162" }]);
eq("a fuvar dátuma 2 nappal később (hétfőn kiállítva, szerdán rak le)", parositSzallitoleveleket([{ ...fabrika, datum: "2026-09-25" }], [sz162]).length, 1);
eq("4 nap eltérés már nem", parositSzallitoleveleket([{ ...fabrika, datum: "2026-09-27" }], [sz162]).length, 0);
eq("másik kocsi nem", parositSzallitoleveleket([{ ...fabrika, jarmuRendszam: "AOPU-427" }], [sz162]).length, 0);
eq("kocsi nélküli fuvar nem", parositSzallitoleveleket([{ ...fabrika, jarmuRendszam: null }], [sz162]).length, 0);
eq("két egyforma fuvar → egyiket sem", parositSzallitoleveleket([fabrika, { ...fabrika, id: "2" }], [sz162]).length, 0);
eq("két szállító egy fuvarra → egyiket sem", parositSzallitoleveleket([fabrika], [sz162, { ...sz162, bizonylatszam: "S-WLLWR-2026-163" }]).length, 0);
eq("két fuvar, két nap → mindkettő a sajátját",
  parositSzallitoleveleket(
    [fabrika, { ...fabrika, id: "2", datum: "2026-09-30" }],
    [sz162, { ...sz162, bizonylatszam: "S-WLLWR-2026-170", kelt: "2026-09-30" }]
  ).map((p) => `${p.fuvarId}=${p.bizonylatszam}`).sort(),
  ["1=S-WLLWR-2026-162", "2=S-WLLWR-2026-170"]
);

console.log(`\nSzállítólevél-párosítás teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
