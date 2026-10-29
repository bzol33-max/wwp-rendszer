// Fuvarozás · Ma + hét egy lapon (redesign 5): lib/fuvarozas2/ma-het-alap.ts.
// Futtatás: npx tsx scripts/teszt-ma-het-lap.ts

import {
  allapotPirula, csuszikNap, csuszoFuvarok, fejlecIdo, fuvarCsoportok, gpsGond, kocsiBajban, lezartCsoport, lezartOsszegzes, megjelenitettNapok,
  napSzakaszCim, nemNulla, oraPerc,
} from "@/lib/fuvarozas2/ma-het-alap";
import type { Elteres, TukorSor } from "@/lib/fuvarozas2/ma-vaszon";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const elt = (badge: string, szin: "red" | "amber"): Elteres => ({ kulcs: badge, cim: "x", badge, szin, sorok: [], href: null, kocsiKod: "K1" });

eq("nemNulla: 0", nemNulla("0"), false);
eq("nemNulla: 0 Ft", nemNulla("0 Ft"), false);
eq("nemNulla: —", nemNulla("—"), false);
eq("nemNulla: 3", nemNulla("3"), true);
eq("nemNulla: 10", nemNulla("10"), true);
eq("nemNulla: 1 250 000 Ft", nemNulla("1 250 000 Ft"), true);

eq("pirula: távollét", allapotPirula({ allapot: null, tavolletMa: "szabadsag" }, []), { szoveg: "Szabadság", szin: "szurke", felkialto: false });
eq("pirula: várakozik", allapotPirula({ allapot: { szoveg: "áll", szin: "normal", hely: null }, tavolletMa: null }, [elt("várakozik 52 p", "red")]),
  { szoveg: "Várakozik 52 perce", szin: "piros", felkialto: true });
eq("pirula: késik", allapotPirula({ allapot: null, tavolletMa: null }, [elt("késés 35 p", "red")]),
  { szoveg: "Késik 35 percet", szin: "piros", felkialto: true });
eq("pirula: úton", allapotPirula({ allapot: { szoveg: "megy · 82 km/h", szin: "mint", hely: "M3" }, tavolletMa: null }, []),
  { szoveg: "Úton", szin: "kek", felkialto: false });
eq("pirula: áll", allapotPirula({ allapot: { szoveg: "áll 40 p · motor jár", szin: "normal", hely: null }, tavolletMa: null }, []),
  { szoveg: "Áll", szin: "narancs", felkialto: false });
eq("pirula: nincs GPS → nincs pirula", allapotPirula({ allapot: { szoveg: "nincs GPS", szin: "amber", hely: null }, tavolletMa: null }, []), null);

eq("gpsGond: nincs GPS", gpsGond({ allapot: { szoveg: "nincs GPS", szin: "amber", hely: null } }), "nincs GPS");
eq("gpsGond: elavult", gpsGond({ allapot: { szoveg: "GPS 08:12 óta nem jelez", szin: "amber", hely: null } }), "GPS 08:12 óta nem jelez");
eq("gpsGond: friss jel", gpsGond({ allapot: { szoveg: "megy · 80 km/h", szin: "mint", hely: null } }), null);
eq("gpsGond: nem tervezett állás (amber, nem GPS-gond)", gpsGond({ allapot: { szoveg: "áll 40 p", szin: "amber", hely: null } }), null);

eq("bajban: piros eltérés", kocsiBajban({ tachoNapiHatraPerc: 300 }, [elt("késés 20 p", "red")]), true);
eq("bajban: csak narancs", kocsiBajban({ tachoNapiHatraPerc: 300 }, [elt("+10 p", "amber")]), false);
eq("bajban: kevés tachó", kocsiBajban({ tachoNapiHatraPerc: 45 }, []), true);
eq("bajban: 89 p tachó (küszöb 90)", kocsiBajban({ tachoNapiHatraPerc: 89 }, []), true);
eq("bajban: 90 p tachó már nem", kocsiBajban({ tachoNapiHatraPerc: 90 }, []), false);
eq("bajban: nincs tachó-adat", kocsiBajban({ tachoNapiHatraPerc: null }, []), false);

eq("oraPerc", oraPerc(160), "2:40");
eq("oraPerc negatív → 0", oraPerc(-5), "0:00");
eq("napSzakaszCim", napSzakaszCim("2026-10-27"), "Kedd · okt. 27.");
eq("fejlecIdo", fejlecIdo("2026-10-26", "10:42"), "hétfő, 2026. okt. 26. · 10:42");

// 5c: lezárt fuvar csukása, csúszó fuvar, napok szűrése
const fuvarSor = (fuvarId: string, partner: string): TukorSor => ({ tipus: "fuvar", fuvarId, partner, hivatkozas: null, jelleg: "ber" });
const megalloSor = (fuvarId: string, varos: string, allapot: "kesz" | "most" | "kovetkezo" | "hatra", teny: string | null): TukorSor => ({
  tipus: "megallo", fuvarId, felLe: "felrako", varos, terv: "06:00", teny, elteres: null, allapot, kiemelt: null, allas: null, ceg: null, kontaktNev: null, telefon: null,
});
const sorok: TukorSor[] = [
  fuvarSor("1", "Flott Trans"), megalloSor("1", "Debrecen", "kesz", "06:00–06:12"), megalloSor("1", "Győr", "kesz", "09:10–09:40"),
  fuvarSor("2", "ÁB SPEED"), megalloSor("2", "Tata", "kesz", "10:00"), megalloSor("2", "Pécs", "most", null),
  fuvarSor("3", "Csúszó Kft"), megalloSor("3", "Eger", "kovetkezo", null),
];
const cs = fuvarCsoportok(sorok);
eq("csoportok száma", cs.length, 3);
eq("lezárt: mind kész", cs.map(lezartCsoport), [true, false, false]);
eq("lezárt összegzés", lezartOsszegzes(cs[0]), { elso: "Debrecen", utolso: "Győr", lerakva: "09:10–09:40" });
eq("lezárt összegzés: nincs tény", lezartOsszegzes({ fuvar: null, sorok: [megalloSor("9", "X", "kesz", null)] }).lerakva, null);
eq("fejléc nélküli (állás) csoport nem lezárt", lezartCsoport({ fuvar: null, sorok: [megalloSor("9", "X", "kesz", null)] }), false);
eq("csúszó: csak a nyitott, múltra tervezett", csuszoFuvarok(cs, [
  { id: "1", lerakasNap: "2026-10-27" }, { id: "2", lerakasNap: "2026-10-29" }, { id: "3", lerakasNap: "2026-10-27" },
], "2026-10-29"), [{ fuvarId: "3", partner: "Csúszó Kft", eredetiNap: "2026-10-27" }]);
eq("csuszikNap", csuszikNap("2026-10-27"), "kedd, okt. 27.");
const hetNapok = ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];
eq("napok: aktuális hét a mai naptól", megjelenitettNapok(hetNapok, "2026-10-29", true), ["2026-10-29", "2026-10-30"]);
eq("napok: múltbeli hét teljes", megjelenitettNapok(hetNapok, "2026-11-05", false), hetNapok);

console.log(`teszt-ma-het-lap: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
