// A sofőr app tiszta számításai (lib/fuvarozas/sofor-app-alap.ts) — DB nélkül.
import { fogyasztasKep, napCimke, papirNeve, tizedes } from "@/lib/fuvarozas/sofor-app-alap";

let hiba = 0;
const eq = (nev: string, kapott: unknown, vart: unknown) => {
  const ok = JSON.stringify(kapott) === JSON.stringify(vart);
  if (!ok) { hiba++; console.log(`✗ ${nev}\n  kapott: ${JSON.stringify(kapott)}\n  várt:   ${JSON.stringify(vart)}`); } else console.log(`✓ ${nev}`);
};

// --- papír
eq("saját fuvar papírja", papirNeve(true), "aláírt szállítólevél");
eq("bérfuvar papírja", papirNeve(false), "aláírt fuvarlevél (CMR)");

// --- dátum-címke (2026-10-21 szerda)
const ma = "2026-10-21";
eq("ma", napCimke(ma, ma), "ma");
eq("holnap", napCimke("2026-10-22", ma), "holnap");
eq("tegnap", napCimke("2026-10-20", ma), "tegnap");
eq("péntek", napCimke("2026-10-23", ma), "péntek");
eq("jövő hét szerda dátummal", napCimke("2026-10-28", ma), "okt. 28.");
eq("üres", napCimke(null, ma), null);

// --- fogyasztás
const napok = [
  // előző hét: 3 nap × 500 km × 29 l/100
  { nap: "2026-10-09", liter: 145, km: 500 },
  { nap: "2026-10-12", liter: 145, km: 500 },
  { nap: "2026-10-14", liter: 145, km: 500 },
  // ez a hét: 27,5 l/100 átlag
  { nap: "2026-10-16", liter: 140, km: 500 },
  { nap: "2026-10-19", liter: 135, km: 500 },
  { nap: "2026-10-20", liter: 137.5, km: 500 },
  // ma csak 10 km — napi átlagnak kevés
  { nap: "2026-10-21", liter: 6, km: 10 },
  // hibás sor: kimarad
  { nap: "2026-10-18", liter: null, km: 300 },
];
const k = fogyasztasKep(napok, ma);
eq("7 nap l/100 (412,5+6 l / 1510 km)", k.het.l100, 27.7);
eq("7 nap km", k.het.km, 1510);
eq("előző hét 29,0", k.elozoHet.l100, 29);
eq("változás −1,3 l", k.valtozas, -1.3);
eq("ma: kevés km → nincs átlag", k.ma.l100, null);
eq("napi oszlopok: 7 nap, régitől a maiig", k.napok.map((n) => n.nap), ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"]);
eq("napi oszlop értékek", k.napok.map((n) => n.l100), [null, 28, null, null, 27, 27.5, null]);
eq("14 nap km", k.ketHet.km, 3010);
const ures = fogyasztasKep([], ma);
eq("adat nélkül: semmi", [ures.het.l100, ures.valtozas, ures.ketHet.km], [null, null, 0]);
eq("tizedesvessző", tizedes(27.4), "27,4");

Promise.resolve().then(() => {
  if (hiba) {
    console.log(`\n${hiba} hiba`);
    process.exit(1);
  }
  console.log("\nminden rendben");
});
