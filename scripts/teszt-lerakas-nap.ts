// A lerakás napjának eldöntése az importnál (lib/fuvarozas/import/lerakas-nap.ts).
// Futtatás: npx tsx scripts/teszt-lerakas-nap.ts

import { dontsLerakasNapot, idoablakVege, LERAKAS_NAP_HIANYZIK } from "@/lib/fuvarozas/import/lerakas-nap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// --- Időablak vége ---
eq("ÓÓ:PP tartomány", idoablakVege("14:00-15:00"), 15);
eq("pontos tartomány félórával", idoablakVege("Hétfő-Péntek 6.00-15.30"), 15.5);
eq("-ig", idoablakVege("15:00-ig"), 15);
eq("puszta órák", idoablakVege("8-20"), 20);
eq("puszta -ig", idoablakVege("10-ig"), 10);
eq("órás időkapu", idoablakVege("15 órás időkapu"), 15);
eq("nincs idő", idoablakVege("előre egyeztetve"), null);
eq("null", idoablakVege(null), null);

// --- Meg van adva ---
eq(
  "megadott más nap",
  dontsLerakasNapot({ felrakasDatum: "2026-10-06", lerakasDatum: "2026-10-07", megadva: true, tavKm: 400, felrakasIdo: "14:00-15:00" }),
  { lerakasDatum: "2026-10-07", kifogas: null }
);
eq(
  "megadott aznap → null (a konvenció szerint), kifogás nélkül",
  dontsLerakasNapot({ felrakasDatum: "2026-10-06", lerakasDatum: "2026-10-06", megadva: true, tavKm: 400, felrakasIdo: "14:00-15:00" }),
  { lerakasDatum: null, kifogas: null }
);
eq(
  "\"aznap\" dátum nélkül",
  dontsLerakasNapot({ felrakasDatum: "2026-10-06", lerakasDatum: null, megadva: true, tavKm: null, felrakasIdo: null }),
  { lerakasDatum: null, kifogas: null }
);

// --- Nincs megadva: az Endo-Star eset (#300/#301, Nyírjákó → Ravazd) ---
const endo = dontsLerakasNapot({ felrakasDatum: "2026-10-06", lerakasDatum: null, megadva: false, tavKm: 400, felrakasIdo: "14:00-15:00" });
eq("Endo-Star: másnap", endo.lerakasDatum, "2026-10-07");
eq("Endo-Star: ellenőrzésre", endo.kifogas?.startsWith(LERAKAS_NAP_HIANYZIK), true);
eq("Endo-Star: indok a kifogásban", /400 km/.test(endo.kifogas ?? "") && /14:00-15:00/.test(endo.kifogas ?? ""), true);

eq(
  "csak a távolság miatt másnap",
  dontsLerakasNapot({ felrakasDatum: "2026-10-06", lerakasDatum: null, megadva: false, tavKm: 300, felrakasIdo: "8:00-10:00" }).lerakasDatum,
  "2026-10-07"
);
eq(
  "csak a késői felrakás miatt másnap",
  dontsLerakasNapot({ felrakasDatum: "2026-10-06", lerakasDatum: null, megadva: false, tavKm: 120, felrakasIdo: "13:00-14:00" }).lerakasDatum,
  "2026-10-07"
);
eq(
  "pénteki felrakás → hétfő",
  dontsLerakasNapot({ felrakasDatum: "2026-10-09", lerakasDatum: null, megadva: false, tavKm: 400, felrakasIdo: null }).lerakasDatum,
  "2026-10-12"
);
const rovid = dontsLerakasNapot({ felrakasDatum: "2026-10-06", lerakasDatum: null, megadva: false, tavKm: 80, felrakasIdo: "7:00-9:00" });
eq("rövid, korai: aznap marad", rovid.lerakasDatum, null);
eq("rövid, korai: de ellenőrzésre megy", rovid.kifogas?.startsWith(LERAKAS_NAP_HIANYZIK), true);
const ismeretlen = dontsLerakasNapot({ felrakasDatum: "2026-10-06", lerakasDatum: null, megadva: false, tavKm: null, felrakasIdo: null });
eq("semmi adat: aznap, ellenőrzésre", [ismeretlen.lerakasDatum, !!ismeretlen.kifogas], [null, true]);

console.log(`teszt-lerakas-nap: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
