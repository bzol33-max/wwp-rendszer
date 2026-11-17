// „Csak dátum” időablak felismerése (lib/fuvarozas2/ablak-alap.ts) és a megálló-terv napja.
// Futtatás: npx tsx scripts/teszt-ablak-alap.ts
import { ablakFelirat, csakDatumAblak, ervenyesAblak, helyiNap, helyiOraPerc } from "@/lib/fuvarozas2/ablak-alap";
import { megalloTerv } from "@/lib/fuvarozas2/megallo-terv";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

eq("helyi szöveg óra", helyiOraPerc("2026-11-16T00:00"), "00:00");
eq("Postgres UTC → Budapest (CET)", helyiOraPerc("2026-11-15 23:00:00+00"), "00:00");
eq("Postgres +01", helyiOraPerc("2026-11-16 00:00:00+01"), "00:00");
eq("nyári idő (CEST)", helyiOraPerc("2026-07-01 22:00:00+00"), "00:00");
eq("helyi nap UTC-ből", helyiNap("2026-11-15 23:00:00+00"), "2026-11-16");
eq("#373: 00:00–00:00 csak dátum", csakDatumAblak("2026-11-15 23:00:00+00", "2026-11-15 23:00:00+00"), true);
eq("csak tol 00:00", csakDatumAblak("2026-11-16T00:00", null), true);
eq("valódi éjfél–06:00 ablak nem csak dátum", csakDatumAblak("2026-11-16T00:00", "2026-11-16T06:00"), false);
eq("14:00 ablak", csakDatumAblak("2026-11-13 13:00:00+00", "2026-11-13 13:00:00+00"), false);
eq("nincs ablak", csakDatumAblak(null, null), false);
eq("ervenyesAblak: csak dátum → null", ervenyesAblak("2026-11-16T00:00", "2026-11-16T00:00"), { tol: null, ig: null });
eq("ervenyesAblak: valódi marad", ervenyesAblak("2026-11-16T08:00", "2026-11-16T10:00"), { tol: "2026-11-16T08:00", ig: "2026-11-16T10:00" });

const sor = { felrako: "Budapest", lerako: "Debrecen", datum_iso: "2026-11-13", lerakas_datum_iso: "2026-11-16",
  felrakas_ablak_tol: "2026-11-13 13:00:00+00", felrakas_ablak_ig: "2026-11-13 13:00:00+00",
  lerakas_ablak_tol: "2026-11-15 23:00:00+00", lerakas_ablak_ig: "2026-11-15 23:00:00+00" };
eq("megalloTerv: csak-dátum lerakó ablak nélkül", megalloTerv(sor).map((m) => [m.tipus, m.nap, m.tol, m.ig]),
  [["felrako", "2026-11-13", "2026-11-13 13:00:00+00", "2026-11-13 13:00:00+00"], ["lerako", "2026-11-16", null, null]]);
const atirt = { ...sor, lerakas_datum_iso: "2026-11-13", lerakas_ablak_tol: "2026-11-16 07:00:00+00", lerakas_ablak_ig: "2026-11-16 09:00:00+00" };
eq("megalloTerv: átírt nap — a másik napi ablak nem jön vele", megalloTerv(atirt)[1], { tipus: "lerako", cim: "Debrecen", nap: "2026-11-13", tol: null, ig: null });

eq("felirat: #373 00:00–00:00 → nincs idő", ablakFelirat("2026-11-15 23:00:00+00", "2026-11-15 23:00:00+00"), "");
eq("felirat: #373 14:00–14:00 → 14:00", ablakFelirat("2026-11-13 13:00:00+00", "2026-11-13 13:00:00+00"), "14:00");
eq("felirat: #352 00:00–23:59 → egész nap", ablakFelirat("2026-11-01 23:00:00+00", "2026-11-02 22:59:00+00"), "egész nap");
eq("felirat: valódi ablak", ablakFelirat("2026-11-03T06:00", "2026-11-03T22:00"), "06:00–22:00");
eq("felirat: csak vég", ablakFelirat(null, "2026-11-03T15:00"), "15:00-ig");
eq("felirat: nincs ablak", ablakFelirat(null, null), "");
console.log(`\nAblak-alap teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
