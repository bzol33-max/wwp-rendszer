// Hét rács 2.0 · hétvége/ünnep sáv: szunetSavok(napok) (lib/fuvarozas2/tervezes-het-alap.ts).
// Spec: docs/het-racs-2-terv.md („Hétvége/ünnep sáv”, „Tesztek”).
// Futtatás: npx tsx scripts/teszt-het-szunetsav.ts
//
// SZERZŐDÉS (Dev B ehhez igazodjon):
//   szunetSavok(napok: string[]): { elott: string; cimke: string }[]
//   - `napok` a gördülő ablak oszlopai (növekvő "YYYY-MM-DD").
//   - Két egymást követő oszlop (a, b) között, ha van köztük kihagyott nap, egy sáv:
//     elott = b (a második oszlop napja), cimke = a KIHAGYOTT napok (a < nap < b) időrendben,
//     " · " (szóköz, középpont U+00B7, szóköz) elválasztóval.
//     (A tervAblak minden munkanapot — a ledolgozós szombatot is — oszlopnak vesz, így a
//     kihagyott nap mindig nem-munkanap; a címke mindegyiket felsorolja.)
//   - Egy nap címkéje: rövid napnév: H, K, Sze, Cs, P, Szo, V
//       + " ünnep", ha törvényes ünnep (torvenyesUnnep(nap) !== null)       pl. "P ünnep", "V ünnep"
//       + " pihenőnap", ha áthelyezett pihenőnap (munkaszunetiNap(nap) !== null, de nem ünnep)
//                                                                           pl. "P pihenőnap"
//       a sima szombat/vasárnap csak "Szo" / "V".
//   - Az első oszlop elé nincs sáv; nincs rés → nincs elem; a sorrend a `napok` sorrendje.

import { szunetSavok } from "@/lib/fuvarozas2/tervezes-het-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const S = (elott: string, cimke: string) => ({ elott, cimke });

// Spec példája: P 10.16. → H 10.19. (hétvége); Cs 10.22. → H 10.26. (okt. 23. péntek ünnep + hétvége).
eq("okt. 16–26. ablak", szunetSavok(["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-26"]), [
  S("2026-10-19", "Szo · V"),
  S("2026-10-26", "P ünnep · Szo · V"),
]);

// Nincs rés → üres.
eq("folyamatos hétköznapok", szunetSavok(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]), []);
eq("üres ablak", szunetSavok([]), []);
eq("egy nap", szunetSavok(["2026-10-19"]), []);

// Szombat oszlop (fuvar van rajta) → csak a vasárnap a sáv, a hétfő előtt.
eq("szombat oszlop, vasárnap sáv", szunetSavok(["2026-10-16", "2026-10-17", "2026-10-19"]), [S("2026-10-19", "V")]);

// Okt. 23. péntek ünnep oszlopként (fuvar van rajta): nincs sáv előtte, a hétvége a hétfő előtt.
eq("ünnep oszlop", szunetSavok(["2026-10-22", "2026-10-23", "2026-10-26"]), [S("2026-10-26", "Szo · V")]);

// Vasárnapra eső ünnep: 2026-11-01 (Mindenszentek, vasárnap).
eq("vasárnapi ünnep", szunetSavok(["2026-10-30", "2026-11-02"]), [S("2026-11-02", "Szo · V ünnep")]);

// Áthelyezett pihenőnap: 2026-08-20 Cs ünnep, 08-21 P áthelyezett pihenőnap, hétvége.
eq("aug. 20. + pihenőnap", szunetSavok(["2026-08-19", "2026-08-24"]), [S("2026-08-24", "Cs ünnep · P pihenőnap · Szo · V")]);

// Karácsony 2026: 12-24 Cs (áthelyezett pihenőnap), 12-25 P ünnep, 12-26 Szo ünnep, 12-27 V.
eq("karácsony 2026", szunetSavok(["2026-12-23", "2026-12-28"]), [S("2026-12-28", "Cs pihenőnap · P ünnep · Szo ünnep · V")]);

// Ledolgozós szombat (2026-12-12) munkanap → oszlop; csak a vasárnap a sáv.
eq("ledolgozós szombat oszlop", szunetSavok(["2026-12-11", "2026-12-12", "2026-12-14"]), [S("2026-12-14", "V")]);

// Húsvét 2026: nagypéntek (ápr. 3.) ünnep, Szo, V (húsvétvasárnap nem külön törvényes nap a listában), húsvéthétfő ünnep.
eq("húsvét 2026", szunetSavok(["2026-04-02", "2026-04-07"]), [S("2026-04-07", "P ünnep · Szo · V · H ünnep")]);

// Két sáv egy ablakban, sorrendben.
eq("két hétvége", szunetSavok(["2026-10-09", "2026-10-12", "2026-10-16", "2026-10-19"]), [
  S("2026-10-12", "Szo · V"),
  S("2026-10-19", "Szo · V"),
]);

console.log(`teszt-het-szunetsav: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
