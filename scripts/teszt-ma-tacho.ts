// A Ma kocsi-kártya fő vezetési sora a tachóból (lib/fuvarozas2/tervezes-het-tacho.ts maTachoSor).
// Futtatás: npx tsx scripts/teszt-ma-tacho.ts

import { maTachoSor } from "@/lib/fuvarozas2/tervezes-het-tacho";
import type { TachoAllapot } from "@/lib/ecofleet/szamitas";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const most = new Date("2026-10-21T10:22:00Z"); // 12:22 Budapest
const alap: TachoAllapot = {
  objectId: "1", allapot: "Vezetés", allapotKezdete: new Date("2026-10-21T09:20:00Z"),
  napiVezetesHatraPerc: 349, hetiVezetesHatraPerc: null, hetiVezetesPerc: 1140, muszakHatraPerc: 478,
  munkaidoHatraPerc: null, kovetkezoNapiPihenoPerc: null, csokkentettPihenok: null, hosszabbitottVezetesek: null,
  adatIdopont: new Date("2026-10-21T10:21:00Z"),
};

// Gergő, 2026-10-21 12:22 — a GPS-becslés „6:36 / 9:00 · szünet esedékes”-t mutatott.
eq("friss tachó: állapot, napi, műszak, hét", maTachoSor(alap, most), { sor: "Vezetés 11:20 óta · ma még 5 ó 49 p vezethet · műszak még 7 ó 58 p · hét 19/56 ó", friss: true, korPerc: 1 });
// Micó: 11:38 óta nem jön jel (áll) — a tachó utolsó állapota az idejével látszik.
const allo = { ...alap, allapot: "Pihenő", allapotKezdete: new Date("2026-10-21T09:38:00Z"), adatIdopont: new Date("2026-10-21T09:38:00Z") };
eq("régebbi tachó az idejével", maTachoSor(allo, most)?.sor, "Pihenő 11:38 óta · ma még 5 ó 49 p vezethet · műszak még 7 ó 58 p · hét 19/56 ó · adat 11:38");
eq("12 óránál régebbi → semmi", maTachoSor({ ...alap, adatIdopont: new Date("2026-10-20T20:00:00Z") }, most), null);
eq("nincs tachó → semmi", maTachoSor(null, most), null);
eq("üres tachó → semmi", maTachoSor({ ...alap, allapot: null, napiVezetesHatraPerc: null, hetiVezetesPerc: null }, most), null);

console.log(`teszt-ma-tacho: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
