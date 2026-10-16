// Az 1. hullám C része (docs/fuvarozas-1-hullam-terv.md, „Pontos típusok”):
// a megnyert Timocom-ajánlatból bérfuvar-adat (megbizasAjanlatbol).
// Futtatás: npx tsx scripts/teszt-1hullam-ajanlat.ts

import { megbizasAjanlatbol, type AjanlatAdat } from "@/lib/fuvarozas2/ajanlat-megbizas-alap";
import { berFuvarHiba, berSzam, type BerFuvarAdat } from "@/lib/fuvarozas2/berfuvar";

let ok = 0, bad = 0;
function all(nev: string, felt: boolean) {
  if (felt) ok++;
  else { bad++; console.log(`  HIBA  ${nev}`); }
}
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const teljes: AjanlatAdat = {
  id: "4711",
  timocomId: "AbCdEfGhIj1234",
  tcId: "98943",
  megbizo: "Teszt Spedíció Kft.",
  honnan: "4200 Hajdúszoboszló",
  hova: "2120 Dunakeszi",
  felrakasNap: "2026-10-20",
  lerakasNap: "2026-10-21",
  tavKm: 215,
  aru: "Raklapos áru",
  sulyT: 24,
};
const d = { jarmuKod: "NMZ-492", felrakasNap: "2026-10-20", dij: 180_000, penznem: "HUF" as const };

// ── 1. Teljes ajánlat, lerakás nappal ──────────────────────────────────────
{
  const m = megbizasAjanlatbol(teljes, d);
  const b: BerFuvarAdat = m; // a visszatérés BerFuvarAdat-ként is használható (fordítási ellenőrzés)
  eq("teljes: datum = a választott felrakás nap", m.datum, "2026-10-20");
  eq("teljes: lerakasDatum = az ajánlat lerakás napja", m.lerakasDatum, "2026-10-21");
  eq("teljes: felrako = honnan", m.felrako, "4200 Hajdúszoboszló");
  eq("teljes: lerako = hova", m.lerako, "2120 Dunakeszi");
  eq("teljes: megrendelo = az ajánlattevő cég", m.megrendelo, "Teszt Spedíció Kft.");
  eq("teljes: fuvardij szövegként", m.fuvardij, "180000");
  eq("teljes: berSzam(fuvardij) = díj", berSzam(m.fuvardij), 180_000);
  eq("teljes: HUF → 'Ft'", m.fuvardijPenznem, "Ft");
  eq("teljes: rakottKm = tavKm", m.rakottKm, 215);
  eq("teljes: forrás timocom", m.forras, "timocom");
  eq("teljes: kocsi (jarmu) = jarmuKod", m.jarmu, "NMZ-492");
  eq("teljes: jarmuKod", m.jarmuKod, "NMZ-492");
  eq("teljes: aru", m.aru, "Raklapos áru");
  eq("teljes: pozicioszamNincs false", m.pozicioszamNincs, false);
  eq("teljes: átmegy a bérfuvar-ellenőrzésen", berFuvarHiba(b), null);
  // megjegyzés: Timocom + #id + timocomId + tcId
  all(`megjegyzés: „Timocom” (${m.megjegyzes})`, /timocom/i.test(m.megjegyzes));
  all(`megjegyzés: WWP-azonosító #4711 (${m.megjegyzes})`, m.megjegyzes.includes("#4711"));
  all(`megjegyzés: Timocom ajánlat-azonosító (${m.megjegyzes})`, m.megjegyzes.includes("AbCdEfGhIj1234"));
  all(`megjegyzés: TC ID (${m.megjegyzes})`, m.megjegyzes.includes("98943"));
  eq("a bemenetet nem módosítja", teljes.lerakasNap, "2026-10-21");
}
{
  // Csak TC ID, nincs Timocom-azonosító
  const m = megbizasAjanlatbol({ ...teljes, timocomId: null }, d);
  all(`megjegyzés timocomId nélkül: #id és TC ID (${m.megjegyzes})`, m.megjegyzes.includes("#4711") && m.megjegyzes.includes("98943"));
  all(`megjegyzés timocomId nélkül: nincs „null” (${m.megjegyzes})`, !m.megjegyzes.includes("null"));
}

// ── 2. Lerakás nap hiányzik → felrakás + ceil(km / 600) nap ────────────────
{
  const nl = { ...teljes, lerakasNap: null };
  eq("215 km → +1 nap", megbizasAjanlatbol(nl, d).lerakasDatum, "2026-10-21");
  eq("600 km → +1 nap (pontosan 1)", megbizasAjanlatbol({ ...nl, tavKm: 600 }, d).lerakasDatum, "2026-10-21");
  eq("601 km → +2 nap", megbizasAjanlatbol({ ...nl, tavKm: 601 }, d).lerakasDatum, "2026-10-22");
  eq("1300 km → +3 nap", megbizasAjanlatbol({ ...nl, tavKm: 1300 }, d).lerakasDatum, "2026-10-23");
  eq("0 km → ugyanaz a nap → '' (BerFuvarAdat szokás)", megbizasAjanlatbol({ ...nl, tavKm: 0 }, d).lerakasDatum, "");
  eq("ismeretlen km (null) → ugyanaz a nap → ''", megbizasAjanlatbol({ ...nl, tavKm: null }, d).lerakasDatum, "");
  eq("ismeretlen km: rakottKm null", megbizasAjanlatbol({ ...nl, tavKm: null }, d).rakottKm, null);
  eq("hónapváltás: 10-31 + 1300 km → 11-03",
    megbizasAjanlatbol({ ...nl, tavKm: 1300 }, { ...d, felrakasNap: "2026-10-31" }).lerakasDatum, "2026-11-03");
  eq("évváltás: 12-31 + 700 km → 2027-01-02",
    megbizasAjanlatbol({ ...nl, tavKm: 700 }, { ...d, felrakasNap: "2026-12-31" }).lerakasDatum, "2027-01-02");
  const m = megbizasAjanlatbol({ ...nl, tavKm: 1300 }, d);
  eq("becsült lerakás: átmegy a bérfuvar-ellenőrzésen", berFuvarHiba(m), null);
}
{
  // Az ajánlat lerakás napja a (később választott) felrakás nap ELÉ esik → becslés
  const m = megbizasAjanlatbol(teljes, { ...d, felrakasNap: "2026-10-23" });
  eq("lerakás nap < választott felrakás → becsült (215 km → +1)", m.lerakasDatum, "2026-10-24");
  eq("…és a datum a választott nap", m.datum, "2026-10-23");
  // Ugyanaz a nap az ajánlatban → ''
  eq("az ajánlat lerakás napja = felrakás nap → ''", megbizasAjanlatbol({ ...teljes, lerakasNap: "2026-10-20" }, d).lerakasDatum, "");
}

// ── 3. EUR díj ─────────────────────────────────────────────────────────────
{
  const m = megbizasAjanlatbol(teljes, { ...d, dij: 850.5, penznem: "EUR" });
  eq("EUR: pénznem", m.fuvardijPenznem, "EUR");
  eq("EUR: berSzam(fuvardij) = 850,5", berSzam(m.fuvardij), 850.5);
  eq("EUR: fuvardij szövegként", m.fuvardij, "850.5");
}

// ── 4. Hiányos ajánlat ─────────────────────────────────────────────────────
{
  const m = megbizasAjanlatbol({ ...teljes, megbizo: null, aru: null, sulyT: null }, d);
  eq("nincs megbízó → megrendelo ''", m.megrendelo, "");
  eq("nincs áru → aru ''", m.aru, "");
  eq("forrás így is timocom", m.forras, "timocom");
}

console.log(`\n1. hullám — ajánlat → megbízás teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
