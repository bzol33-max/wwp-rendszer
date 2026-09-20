// A Fuvarozás 2 modell-utántöltés megálló-tervének tesztje.
// Futtatás: npx tsx scripts/teszt-modell-szinkron.ts
//
// Miért fontos: 2026-09-20-ig az új fuvarok EGYÁLTALÁN nem kaptak megállót
// (csak a kézi backfill írt ilyet), ezért a Ma-képernyő ablak-, várakozás- és
// „kész"-logikája vak volt rajtuk. Ez a terv dönti el, hány megálló lesz,
// milyen sorrendben, melyik napra és melyik időablakkal.

import { megalloTerv } from "@/lib/fuvarozas2/megallo-terv";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const alap: Parameters<typeof megalloTerv>[0] = {
  felrako: "4243 Téglás, Hrsz. 0135/9",
  lerako: "3200 Gyöngyös, Szurdokpart u. 6-8.",
  datum_iso: "2026-09-21",
  lerakas_datum_iso: "2026-09-22",
  felrakas_ablak_tol: "2026-09-21T06:00:00Z",
  felrakas_ablak_ig: "2026-09-21T14:00:00Z",
  lerakas_ablak_tol: "2026-09-22T07:00:00Z",
  lerakas_ablak_ig: "2026-09-22T15:00:00Z",
};
const t = (extra: Partial<Parameters<typeof megalloTerv>[0]> = {}) => megalloTerv({ ...alap, ...extra });

// 1. Egy felrakó + egy lerakó: két megálló, felrakó elöl.
const ketto = t();
eq("darab", ketto.length, 2);
eq("sorrend", ketto.map((m) => m.tipus), ["felrako", "lerako"]);
eq("felrakó címe", ketto[0].cim, "4243 Téglás, Hrsz. 0135/9");
eq("lerakó címe", ketto[1].cim, "3200 Gyöngyös, Szurdokpart u. 6-8.");

// 2. A nap: a felrakó a fuvar napja, a lerakó a lerakás napja.
eq("felrakó napja", ketto[0].nap, "2026-09-21");
eq("lerakó napja", ketto[1].nap, "2026-09-22");

// 3. Lerakás dátuma nélkül a lerakó is a fuvar napjára esik.
eq("lerakó nap visszaesése", t({ lerakas_datum_iso: null })[1].nap, "2026-09-21");

// 4. Az ablakok a megfelelő megállóra kerülnek.
eq("felrakó ablak tól", ketto[0].tol, "2026-09-21T06:00:00Z");
eq("felrakó ablak ig", ketto[0].ig, "2026-09-21T14:00:00Z");
eq("lerakó ablak tól", ketto[1].tol, "2026-09-22T07:00:00Z");
eq("lerakó ablak ig", ketto[1].ig, "2026-09-22T15:00:00Z");

// 5. Ablak nélküli megbízás (ma az importok többsége ilyen): null, nem hiba.
const ablakNelkul = t({
  felrakas_ablak_tol: null, felrakas_ablak_ig: null, lerakas_ablak_tol: null, lerakas_ablak_ig: null,
});
eq("ablak nélkül darab", ablakNelkul.length, 2);
eq("ablak nélkül tól", ablakNelkul[0].tol, null);
eq("ablak nélkül ig", ablakNelkul[1].ig, null);

// 6. Több megálló egy oldalon: mindegyik külön sor, a sorrend megmarad.
const tobb = t({ lerako: "3200 Gyöngyös, Szurdokpart u. 6-8.; 4002 Debrecen, Csonka János utca 7." });
eq("több lerakó darab", tobb.length, 3);
eq("több lerakó típusok", tobb.map((m) => m.tipus), ["felrako", "lerako", "lerako"]);
eq("második lerakó címe", tobb[2].cim, "4002 Debrecen, Csonka János utca 7.");
eq("mindkét lerakó ugyanazt az ablakot kapja", [tobb[1].tol, tobb[2].tol], [alap.lerakas_ablak_tol, alap.lerakas_ablak_tol]);

// 7. Hiányzó felrakó (bér fuvarnál előfordul): csak a lerakó lesz megálló.
const csakLerako = t({ felrako: null });
eq("felrakó nélkül darab", csakLerako.length, 1);
eq("felrakó nélkül típus", csakLerako[0].tipus, "lerako");

// 8. Se felrakó, se lerakó: üres terv, nem hiba.
eq("üres terv", t({ felrako: null, lerako: null }), []);

// 9. Nap nélküli megbízás: a nap null marad, a megálló attól még létrejön.
const napNelkul = t({ datum_iso: null, lerakas_datum_iso: null });
eq("nap nélkül darab", napNelkul.length, 2);
eq("nap nélkül nap", napNelkul[0].nap, null);

console.log(`\nmodell-szinkron: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
