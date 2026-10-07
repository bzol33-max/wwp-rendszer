// A Ma oldal heti rácsa (R2). Futtatás: npx tsx scripts/teszt-ma-het.ts

import { hetCellak, hetMost, hetNapjai, hetSzama, type HetFuvar, type HetMegallo } from "@/lib/fuvarozas2/ma-het";
import { tukorSorok, type TukorSor } from "@/lib/fuvarozas2/ma-tukor";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const napok = hetNapjai("2026-10-05");
eq("hétfőn az aktuális hét", napok.map((n) => n.nap), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
eq("napcímke", napok[0].cimke, "Hétfő 5.");
eq("ma jelölve", napok.map((n) => n.ma), [true, false, false, false, false]);
eq("szerdán is ez a hét", hetNapjai("2026-10-07")[0].nap, "2026-10-05");
eq("szombaton már a következő hét", hetNapjai("2026-10-10")[0].nap, "2026-10-12");
eq("vasárnap is a következő hét", hetNapjai("2026-10-11")[0].nap, "2026-10-12");
eq("hét száma", hetSzama("2026-10-05"), 41);
eq("hét száma év elején", hetSzama("2026-01-01"), 1);

const alap = { jelleg: "sajat" as const, hivatkozas: null, jarmu_kod: "AOPU-427" };
const fuvarok: HetFuvar[] = [
  { ...alap, id: "293", allapot: "tervezett", jelleg: "ber", partner: "Lösung", felrakas_nap: "2026-10-05", lerakas_nap: "2026-10-06", felrako: "HU-9600 Sárvár, Ikervári út 42.", lerako: "HU-4031 Debrecen" },
  { ...alap, id: "294", allapot: "teljesitve", partner: "Pál-Ferr-Box", felrakas_nap: "2026-10-05", lerakas_nap: "2026-10-05", felrako: "Szakoly, Rákóczi utca 26", lerako: "Tata" },
  { ...alap, id: "295", allapot: "folyamatban", partner: "Fabrika", felrakas_nap: "2026-10-05", lerakas_nap: "2026-10-05", felrako: "2890 Tata, Agráripari telep", lerako: "9662 Tompaládony, 0117/8 hrsz." },
  { ...alap, id: "280", allapot: "lezart", partner: "Régi", felrakas_nap: "2026-10-01", lerakas_nap: "2026-10-01", felrako: "Győr", lerako: "Pápa" },
];
const megallok = new Map<string, HetMegallo[]>([
  ["293", [{ tipus: "felrako", varos: "Sárvár", nap: "2026-10-05", ott: false, kesz: false }, { tipus: "lerako", varos: "Debrecen", nap: "2026-10-06", ott: false, kesz: false }]],
  ["295", [{ tipus: "felrako", varos: "Tata", nap: "2026-10-05", ott: true, kesz: true }, { tipus: "lerako", varos: "Tompaládony", nap: "2026-10-05", ott: false, kesz: false }]],
]);
const cellak = hetCellak(fuvarok, megallok, napok);
eq("hétfő: menet-sorrend, a több napos a végén", cellak[0].map((k) => k.id), ["294", "295", "293"]);
eq("kész fuvar marad: fotóra vár", [cellak[0][0].szin, cellak[0][0].cimke], ["foto", "fotóra vár"]);
eq("folyamatban, megálló között: úton", [cellak[0][1].szin, cellak[0][1].cimke], ["uton", "úton"]);
eq("útvonal városnévvel", cellak[0][2].utvonal, "Sárvár → Debrecen");
eq("kedden folytatódik, aznapi megállóval", [cellak[1].map((k) => k.id), cellak[1][0].folytatodik, cellak[1][0].aznap], [["293"], true, "Debrecen le"]);
eq("kedden a még nyitott fuvar folytatódik, nem kész", cellak[1][0].aznapKesz, false);
const lezartFolyt = hetCellak([{ ...fuvarok[0], id: "297", allapot: "lezart" }], new Map(), napok);
eq("kedden a lezárt fuvar folytatódó napja kész", [lezartFolyt[1][0].folytatodik, lezartFolyt[1][0].aznapKesz, lezartFolyt[0][0].aznapKesz], [true, true, false]);
const leteve = hetCellak([{ ...fuvarok[0], id: "8", allapot: "folyamatban" }], new Map([["8", [{ ...megallok.get("293")![0], kesz: true }, { ...megallok.get("293")![1], kesz: true }]]]), napok);
eq("kedden a lerakott (még nem lezárt) fuvar folytatódó napja kész", leteve[1][0].aznapKesz, true);
eq("a múlt heti fuvar nincs a rácson", cellak.flat().some((k) => k.id === "280"), false);
eq("szerda üres", cellak[2].length, 0);

const rakodik = hetCellak(
  [{ ...fuvarok[2], id: "9" }],
  new Map([["9", [{ tipus: "felrako" as const, varos: "Tata", nap: "2026-10-05", ott: true, kesz: false }]]]),
  napok
);
eq("felrakón áll: rakodik", [rakodik[0][0].szin, rakodik[0][0].cimke], ["ott", "rakodik · Tata"]);

const elozoHetrol = hetCellak([{ ...fuvarok[0], id: "7", felrakas_nap: "2026-10-02", lerakas_nap: "2026-10-05" }], new Map(), napok);
eq("múlt pénteken indult: hétfőn folytatódik", elozoHetrol[0][0].folytatodik, true);

const m = (fuvarId: string, varos: string, felLe: "felrako" | "lerako", allapot: "kesz" | "most" | "kovetkezo" | "hatra", teny: string | null = null): TukorSor => ({
  tipus: "megallo", fuvarId, felLe, varos, terv: null, teny, elteres: null, allapot, kiemelt: null, allas: null, ceg: null, kontaktNev: null, telefon: null,
});
const tukor: TukorSor[] = [
  { tipus: "fuvar", fuvarId: "294", partner: "Pál-Ferr-Box", hivatkozas: null, jelleg: "sajat" },
  m("294", "Szakoly", "felrako", "kesz"), m("294", "Tata", "lerako", "kesz"),
  { tipus: "fuvar", fuvarId: "295", partner: "Fabrika", hivatkozas: null, jelleg: "sajat" },
  m("295", "Tata", "felrako", "kesz"), m("295", "Tompaládony", "lerako", "kovetkezo", "ETA 15:10"),
];
eq("Most: a mostani fuvar és a haladása", hetMost(tukor), { tipus: "fuvar", fuvarId: "295", partner: "Fabrika", szazalek: 50, kovetkezo: "Tompaládony le", ido: "ETA 15:10", szin: "blue" });
eq("Most: a megállón állva sárga", (hetMost([tukor[3], tukor[4], m("295", "Tompaládony", "lerako", "most", "ott 14:40 óta")]) as { szin: string }).szin, "amber");
eq("Most: minden kész", hetMost(tukor.slice(0, 3)), { tipus: "kesz" });
eq("Most: nincs mai fuvar", hetMost([]), { tipus: "ures" });
// Este a nap minden fuvarja lezárult (a lezárt fuvar is a tükörben marad, készként): „kész”, nem „üres”.
eq("Most: a lezárt fuvarokkal kész nap", hetMost(tukorSorok({
  fuvarok: [{ id: "293", partner: "Lösung", hivatkozas: null, jelleg: "ber", megallo_reszletek: null, lezart: true, megallok: [
    { sorszam: 1, tipus: "lerako", cim_nyers: "HU-4031 Debrecen", ablak_tol: null, ablak_ig: "2026-10-06 08:00:00+00", gps_erkezes: null, gps_tavozas: null, sofor_kesz_at: null, varakozas_kezdete: null, varakozas_vege: null, tervezett_nap: "2026-10-06" },
  ] }],
  allasok: [], eta: null, most: new Date("2026-10-06T16:55:00Z"), ma: "2026-10-06",
})), { tipus: "kesz" });

console.log(`heti rács: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
