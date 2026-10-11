// A Tervezés heti számtanának tesztje. Futtatás: npx tsx scripts/teszt-tervezo.ts
import { atfed, elozmenyElteres, hetEredmeny, hetHatas, hetNapjai, legjobbKocsi, legvonalKm, type HetFuvar, type HetParam } from "@/lib/fuvarozas2/tervezo-alap";
import { arLetra } from "@/lib/fuvarozas2/ar-letra";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Egy egyenes vonal: 1 fok hosszúság ~ 70–75 km ezen a szélességen; a pontos érték nem cél, a lánc logikája igen.
const A = { lat: 47.5, lon: 19.0 }, B = { lat: 47.5, lon: 20.0 }, C = { lat: 47.5, lon: 21.0 };
const p: HetParam = { telephely: A, fogyasztasL100: 30, gazolajFt: 600, napiFt: 50000, munkanapok: 5, utdijPerKm: 100 };
const f = (id: string, nap: string, fel: typeof A, le: typeof A, dij: number | null, km: number | null = null): HetFuvar =>
  ({ id, jelleg: dij == null ? "sajat" : "ber", felrakasNap: nap, lerakasNap: nap, felrako: fel, lerako: le, rakottKm: km, dijFt: dij, utdijFt: null });

const ab = legvonalKm(A, B);
eq("légvonal szimmetrikus", legvonalKm(B, A), ab);
eq("légvonal nulla", legvonalKm(A, A), 0);

const ures = hetEredmeny([], null, p);
eq("üres hét: csak a napi költség", [ures.bevetel, ures.rakottKm, ures.uresKm, ures.onkoltseg, ures.eredmeny], [0, 0, 0, 250000, -250000]);

// Telephely (A) → B felrak → C lerak → haza A: üres = 0 (A→A? nem: A→B a felrakóig) + C→A.
const e1 = hetEredmeny([f("1", "2026-09-29", B, C, 200000, 70)], null, p);
eq("egy fuvar: rakott km a tárolt érték", e1.rakottKm, 70);
eq("egy fuvar: üres = telephely→felrakó + lerakó→telephely", e1.uresKm, ab + legvonalKm(C, A));
eq("bevétel", e1.bevetel, 200000);
eq("önköltség = üzemanyag + útdíj + napi", e1.onkoltseg, e1.uzemanyagFt + e1.utdijFt + e1.napiFt);

// Visszfuvar-hatás: A→C, majd C→A — a második fuvar ELVESZI a hazautat.
const oda = f("1", "2026-09-29", A, C, 200000);
const vissza = f("2", "2026-09-30", C, A, 150000);
const h = hetHatas([oda], vissza, null, p);
eq("visszfuvar: nem ütközik", h.utkozik, false);
eq("visszfuvar: az üres km csökken", h.vele.uresKm < h.nelkule.uresKm, true);
eq("visszfuvar hatása = díj − plusz költség", h.hatas, h.vele.eredmeny - h.nelkule.eredmeny);
eq("visszfuvar hatása pozitív", h.hatas > 0, true);

eq("ütközés ugyanazon a napon", hetHatas([oda], { ...vissza, felrakasNap: "2026-09-29", lerakasNap: "2026-09-29" }, null, p).utkozik, true);
eq("átfedés: szomszéd napok nem", atfed({ felrakasNap: "2026-09-29", lerakasNap: "2026-09-29" }, { felrakasNap: "2026-09-30", lerakasNap: "2026-10-01" }), false);
eq("átfedés: többnapos", atfed({ felrakasNap: "2026-09-29", lerakasNap: "2026-10-01" }, { felrakasNap: "2026-09-30", lerakasNap: "2026-09-30" }), true);
eq("saját fuvar nem bevétel", hetEredmeny([f("9", "2026-09-29", A, B, null)], null, p).bevetel, 0);
eq("hatás nem függ a sorrendtől", hetHatas([vissza], oda, null, p).vele.eredmeny, hetHatas([oda], vissza, null, p).vele.eredmeny);

eq("legjobb kocsi: a nem ütközők közül a legnagyobb", legjobbKocsi([{ k: "a", hatas: 90, utkozik: true }, { k: "b", hatas: 40, utkozik: false }, { k: "c", hatas: 60, utkozik: false }])?.k, "c");
eq("legjobb kocsi: mind ütközik", legjobbKocsi([{ hatas: 1, utkozik: true }]), null);

eq("előzmény: átlag és eltérés", elozmenyElteres(583, [728, 680, null]), { atlag: 704, eltere: -17 });
eq("előzmény: nincs mihez", elozmenyElteres(583, [null]), { atlag: null, eltere: null });
// A célár (8% a díjhoz) helyett az árlétra +10%-os foka (2026-10-11): 376 300 × 1,1 = 413 930 → 415 000.
eq("célár = árlétra +10%", arLetra(376300, null).fokok[0].ft, 415000);

// A lánc a közös sorrendben (napi-sorrend.ts): a később rögzített, kiírt
// időpontú fuvar az időpont nélküli elé — itt A→C (10:00), utána C→A: nincs üres út.
{
  const ido = f("2", "2026-09-29", A, C, 150000, 140);
  const idoNelkul = f("1", "2026-09-29", C, A, null, 140);
  const e = hetEredmeny([idoNelkul, { ...ido, tervIdo: Date.parse("2026-09-29T08:00:00Z") }], null, p);
  eq("közös sorrend: az időpontos előbb, üres út nincs", e.uresKm, 0);
  eq("időpont nélkül az id dönt (régi lánc): üres út van", hetEredmeny([idoNelkul, ido], null, p).uresKm > 0, true);
}

// A hét mind a 7 napja (QA: a vasárnapi fuvar „ütközik”, de csak H–P látszott).
{
  const het = hetNapjai("2026-10-12");
  eq("a hét 7 napja hétfőtől vasárnapig", het.map((n) => n.nap), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  eq("a hétvége jelölve (szombat, vasárnap)", het.map((n) => n.hetvege), [null, null, null, null, null, "szombat", "vasarnap"]);
  const vasarnapi = { felrakasNap: "2026-10-18", lerakasNap: "2026-10-18" };
  eq("a vasárnapi fuvar ütközése a heti napok közt látszik", het.some((n) => atfed(vasarnapi, { felrakasNap: n.nap, lerakasNap: n.nap }) && n.hetvege === "vasarnap"), true);
}

console.log(`\nTervező teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
