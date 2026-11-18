// Megbízások „Kocsi-sínek” nézet tiszta számításai (lib/fuvarozas2/kocsi-sinek-alap.ts).
// Futtatás: npx tsx scripts/teszt-kocsi-sinek.ts
import { pecsetek, lepesbenNap, jegySzin, haviOsszesites, elozoHonapUgyanezNap, honapNapjai, mnbValaszArfolyamok, eFt, type HaviFuvar, type PecsetBemenet } from "@/lib/fuvarozas2/kocsi-sinek-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  const a = JSON.stringify(kapott), b = JSON.stringify(vart);
  if (a === b) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${b}\n    kapott: ${a}`); }
}
const MA = "2026-11-18";
const alap: PecsetBemenet = { jelleg: "ber", letrehozva_at: "2026-11-10T08:00:00Z", felvetel_at: null, lerakas_at: null, allapot: "tervezett", allapot_at: null, szamla_kelte: null, felrakas_nap: "2026-11-19", lerakas_nap: "2026-11-19" };

// 1. friss bérfuvar: csak beérkezés, semmi nem késik
let p = pecsetek(alap, MA);
eq("ber 4 pecsét", p.length, 4);
eq("csak beérkezés", p.map((x) => x.nap), ["2026-11-10", null, null, null]);
eq("nem késik", p.map((x) => x.keso), ["nem", "nem", "nem", "nem"]);
eq("szín = felvétel", jegySzin(p), "felvetel");
eq("lépésben 8 nap, köv. felvétel", lepesbenNap(p, MA), { nap: 8, kovetkezo: "felvetel" });

// 2. lerakva 6 napja, nincs számla → piros számla
p = pecsetek({ ...alap, felvetel_at: "2026-11-11T06:00:00Z", lerakas_at: "2026-11-12T14:00:00Z", allapot: "teljesitve", felrakas_nap: "2026-11-11", lerakas_nap: "2026-11-12" }, MA);
eq("számla piros", p[3].keso, "piros");
eq("szín piros", jegySzin(p), "piros");
eq("lépésben 6 nap", lepesbenNap(p, MA).nap, 6);
// lerakva 2 napja → sárga
p = pecsetek({ ...alap, felvetel_at: "2026-11-16T06:00:00Z", lerakas_at: "2026-11-16T14:00:00Z", allapot: "teljesitve" }, MA);
eq("számla sárga", p[3].keso, "sarga");
// számlázva → kész
p = pecsetek({ ...alap, felvetel_at: "2026-11-16T06:00:00Z", lerakas_at: "2026-11-16T14:00:00Z", allapot: "szamlazva", szamla_kelte: "2026-11-17" }, MA);
eq("kész", jegySzin(p), "kesz");
eq("nincs következő", lepesbenNap(p, MA).kovetkezo, null);

// 3. megálló-jelölés nélkül, de teljesítve: allapot_at adja a lerakást és a felvételt
p = pecsetek({ ...alap, allapot: "teljesitve", allapot_at: "2026-11-15T10:00:00Z" }, MA);
eq("állapotból lerakás", [p[1].nap, p[2].nap], ["2026-11-15", "2026-11-15"]);

// 4. felvétel késik: tervezett felrakás 2 napja volt
p = pecsetek({ ...alap, felrakas_nap: "2026-11-16" }, MA);
eq("felvétel piros", p[1].keso, "piros");
eq("lerakás addig nem késik", p[2].keso, "nem");

// 5. saját: 3 pecsét
p = pecsetek({ ...alap, jelleg: "sajat" }, MA);
eq("saját 3 pecsét", p.map((x) => x.kulcs), ["beerkezes", "felvetel", "lerakas"]);

// 6. hónap-segédek
eq("november 30 nap", honapNapjai(MA), 30);
eq("előző hó ugyanaz a nap", elozoHonapUgyanezNap(MA), { tol: "2026-10-01", ig: "2026-10-18" });
eq("március 31 → február 28", elozoHonapUgyanezNap("2027-03-31"), { tol: "2027-02-01", ig: "2027-02-28" });
eq("január → december", elozoHonapUgyanezNap("2027-01-15"), { tol: "2026-12-01", ig: "2026-12-15" });

// 7. havi összesítés
const f = (x: Partial<HaviFuvar>): HaviFuvar => ({ id: "1", jelleg: "ber", jarmu_kod: "NMZ-492", lerakas_nap: "2026-11-10", fuvardij: 100000, fuvardij_penznem: "Ft", rakott_km: 200, szamla_kelte: "2026-11-11", ...x });
const arf = (nap: string) => (nap === "2026-11-16" ? 400 : nap === MA ? 410 : null);
const h = haviOsszesites(MA, [
  f({}),
  f({ id: "2", fuvardij: 500, fuvardij_penznem: "EUR", szamla_kelte: "2026-11-16", rakott_km: 300, jarmu_kod: "AOPU-427" }),
  f({ id: "3", fuvardij: 100, fuvardij_penznem: "EUR", szamla_kelte: null, rakott_km: 0 }),
  f({ id: "4", jelleg: "sajat", fuvardij: null, rakott_km: 100 }),
], [f({ fuvardij: 170000 })], arf, { kiadasFt: 200000, celFt: 682000 });
eq("bér db", h.berDb, 3);
eq("bér Ft", h.berFt, 100000);
eq("EUR összeg", h.berEur, 600);
eq("EUR Ft: 500×400 + 100×410 (előzetes)", h.berEurFt, 241000);
eq("előzetes jelölve", h.berElozetesEur, true);
eq("számlázatlan = 100 EUR mai árfolyamon", h.szamlazatlanFt, 41000);
eq("átlag Ft/km = 341000/500", h.atlagFtKm, 682);
eq("saját belső díj = 100 km × 682", h.sajatBelsoFt, 68200);
eq("eredmény", h.eredmenyFt, 341000 + 68200 - 200000);
eq("cél %", h.celSzazalek, 50);
eq("előző hóhoz", h.elozoSzazalek, 101);
eq("kocsi NMZ bér", h.kocsik["NMZ-492"].berFt, 141000);
eq("kocsi AOPU Ft/km", Math.round(h.kocsik["AOPU-427"].ftKm ?? 0), 667);
eq("kocsi NMZ saját db", h.kocsik["NMZ-492"].sajatDb, 1);
const ures = haviOsszesites(MA, [], [], arf, { kiadasFt: null, celFt: null });
eq("üres: eredmény null", [ures.eredmenyFt, ures.celSzazalek, ures.elozoSzazalek, ures.atlagFtKm], [null, null, null, null]);

// 8. MNB válasz
const xml = `<GetExchangeRatesResult>&lt;MNBExchangeRates&gt;&lt;Day date="2026-11-17"&gt;&lt;Rate unit="1" curr="EUR"&gt;402,15&lt;/Rate&gt;&lt;/Day&gt;&lt;Day date="2026-11-14"&gt;&lt;Rate unit="100" curr="JPY"&gt;230,5&lt;/Rate&gt;&lt;Rate unit="1" curr="EUR"&gt;401,9&lt;/Rate&gt;&lt;/Day&gt;&lt;/MNBExchangeRates&gt;</GetExchangeRatesResult>`;
eq("MNB EUR", [...mnbValaszArfolyamok(xml, "EUR")], [["2026-11-17", 402.15], ["2026-11-14", 401.9]]);
eq("MNB JPY egység", [...mnbValaszArfolyamok(xml, "JPY")], [["2026-11-14", 2.305]]);
eq("MNB üres", mnbValaszArfolyamok("<x/>", "EUR").size, 0);

eq("eFt", [eFt(4877000), eFt(12300000), eFt(null)], ["4 877 e Ft", "12,3 M Ft", "—"]);

console.log(`kocsi-sinek: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
