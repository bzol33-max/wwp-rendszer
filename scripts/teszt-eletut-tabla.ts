// Megbízások · életút-tábla besorolás (lib/fuvarozas2/eletut-tabla.ts).
// Futtatás: npx tsx scripts/teszt-eletut-tabla.ts

import { eletutOszlopok, OSZLOP_MAX, type Fizetes } from "@/lib/fuvarozas2/eletut-tabla";
import type { MunkaasztalSor } from "@/lib/fuvarozas2/megbizasok";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const MA = "2026-10-21";
const sor = (id: string, x: Partial<MunkaasztalSor>): MunkaasztalSor =>
  ({ id, jelleg: "ber", szakasz: "folyamatban", allapot: "folyamatban", felrakas_nap: "2026-10-20", lerakas_nap: "2026-10-20", idopont_nyitott: false, ...x }) as unknown as MunkaasztalSor;

const nyitott = [
  sor("1", { szakasz: "beerkezett", allapot: "ellenorzesre_var" }),
  sor("2", {}),
  sor("3", { szakasz: "szamlazasra", allapot: "szamlazhato" }),
  sor("4", { szakasz: "postara", allapot: "szamlazva" }),
  sor("5", { jelleg: "sajat", szakasz: "elokeszites", allapot: "tervezett" }),
  sor("6", { jelleg: "sajat" }),
  // Elvinni való (nyitott időpont): nem az Előkészítés oszlopba megy.
  sor("7", { jelleg: "sajat", szakasz: "elokeszites", idopont_nyitott: true } as Partial<MunkaasztalSor>),
];
const archiv = [
  sor("10", { szakasz: "archiv", allapot: "postazva" }),
  sor("11", { szakasz: "archiv", allapot: "postazva" }),
  sor("12", { szakasz: "archiv", allapot: "lezart" }),
  sor("13", { szakasz: "archiv", allapot: "lezart" }),
  sor("14", { szakasz: "archiv", allapot: "lezart" }),
  sor("15", { szakasz: "archiv", allapot: "postazva" }), // nincs számla a táblában → sehol
  sor("20", { jelleg: "sajat", szakasz: "archiv", allapot: "teljesitve", lerakas_nap: "2026-10-20" }),
  sor("21", { jelleg: "sajat", szakasz: "archiv", allapot: "teljesitve", lerakas_nap: "2026-07-01" }), // 60 napnál régebbi
  sor("22", { jelleg: "sajat", szakasz: "archiv", allapot: "lezart", lerakas_nap: "2026-10-15" }),
  sor("23", { jelleg: "sajat", szakasz: "archiv", allapot: "lezart", lerakas_nap: "2026-10-10" }), // 11 napja
];
const fizetes: Record<string, Fizetes> = {
  "10": { all: "kikuldve", fizetveNap: null, lejartNap: 0 },
  "11": { all: "lejart", fizetveNap: null, lejartNap: 3 },
  "12": { all: "lejart", fizetveNap: null, lejartNap: 40 },
  "13": { all: "fizetve", fizetveNap: "2026-10-05", lejartNap: 0 },
  "14": { all: "fizetve", fizetveNap: "2026-09-28", lejartNap: 0 }, // előző hónap
};

const t = eletutOszlopok({ sorok: nyitott, archiv, fizetes, ma: MA });
const idk = (o: { sorok: MunkaasztalSor[] }) => o.sorok.map((s) => s.id);
const B = Object.fromEntries(t.ber.map((o) => [o.kulcs, o]));
const S = Object.fromEntries(t.sajat.map((o) => [o.kulcs, o]));

eq("bér oszlopok sorrendje", t.ber.map((o) => o.kulcs), ["beerkezett", "folyamatban", "szamlazasra", "postara", "kikuldve", "lejart", "fizetve"]);
eq("beérkezett", idk(B.beerkezett), ["1"]);
eq("úton: csak bér", idk(B.folyamatban), ["2"]);
eq("számlázásra", idk(B.szamlazasra), ["3"]);
eq("postára", idk(B.postara), ["4"]);
eq("kiküldve", idk(B.kikuldve), ["10"]);
eq("lejárt: a legrégebben lejárt elöl", idk(B.lejart), ["12", "11"]);
eq("fizetve: csak az aktuális hónap", idk(B.fizetve), ["13"]);
eq("fizetve oszlop címe a hónappal", B.fizetve.cim, "Fizetve · október");
eq("pénz-szűrő a további linkhez", [B.kikuldve.penzSzuro, B.lejart.penzSzuro, B.fizetve.penzSzuro, B.postara.penzSzuro], ["kikuldve", "lejart", "fizetve", undefined]);

eq("saját előkészítés (elvinni való nélkül)", idk(S["s-elokeszites"]), ["5"]);
eq("saját tervezett / úton", idk(S["s-folyamatban"]), ["6"]);
eq("saját fotóra vár (60 napon belül)", idk(S["s-fotora"]), ["20"]);
eq("saját kész az utolsó 7 napból", idk(S["s-kesz"]), ["22"]);

// Levágás: legfeljebb OSZLOP_MAX kártya, az összes szám megmarad.
const sok = Array.from({ length: OSZLOP_MAX + 5 }, (_, i) => sor(`k${i}`, { szakasz: "archiv", allapot: "postazva" }));
const sokFiz = Object.fromEntries(sok.map((s) => [s.id, { all: "kikuldve", fizetveNap: null, lejartNap: 0 } as Fizetes]));
const t2 = eletutOszlopok({ sorok: [], archiv: sok, fizetes: sokFiz, ma: MA });
eq("levágás", [t2.ber[4].sorok.length, t2.ber[4].osszes], [OSZLOP_MAX, OSZLOP_MAX + 5]);

console.log(`teszt-eletut-tabla: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
