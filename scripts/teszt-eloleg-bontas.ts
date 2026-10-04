// Az előleg év/hónap bontásának tesztje.
// Futtatás: npx tsx scripts/teszt-eloleg-bontas.ts
//
// Miért fontos: ezt a bontást látja a dolgozó a telefonján a tartozásáról.
// Ha a hónap végi egyenleg elcsúszik, az úgy néz ki, mintha más tartozása
// lenne, mint amennyi — és erről ő nem tud mit kezdeni, csak hogy nem hiszi el.

import { elolegBontas, type ElolegTetel } from "@/lib/dolgozok/shared";

let ok = 0,
  bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(
      `  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`
    );
  }
}

let n = 0;
function t(date: string, amount: number, acceptedAt: string | null = "2026-10-01 10:00"): ElolegTetel {
  n += 1;
  return { id: String(n), date, amount, note: null, acceptedAt, acceptedBy: null };
}

// --- üres és egyelemű ---
eq("üres lista", elolegBontas([]), []);
const egy = elolegBontas([t("2026-09-15", 20000)]);
eq("egy tétel egy év", egy.length, 1);
eq("egy tétel egy hónap", egy[0].honapok.length, 1);
eq("egy tétel záró egyenlege maga az összeg", egy[0].honapok[0].zaroEgyenleg, 20000);
eq("egy tétel felvettként", egy[0].honapok[0].felvett, 20000);
eq("nincs visszafizetés", egy[0].honapok[0].vissza, 0);

// --- Vadon Gergő valódi tételei (éles adat, 2026-10-04) ---
const GERGO = [
  t("2026-09-16", 4220000),
  t("2026-09-15", 20000),
  t("2026-09-01", -250000),
];
const g = elolegBontas(GERGO);
eq("Gergő: egy év", g.length, 1);
eq("Gergő: 2026", g[0].ev, 2026);
eq("Gergő: egy hónap (szeptember)", g[0].honapok.length, 1);
eq("Gergő: szeptemberben felvett", g[0].honapok[0].felvett, 4240000);
eq("Gergő: szeptemberben visszafizetve", g[0].honapok[0].vissza, -250000);
eq("Gergő: a hónap zárója a teljes tartozás", g[0].honapok[0].zaroEgyenleg, 3990000);
eq("Gergő: az éves összeg is stimmel", g[0].felvett + g[0].vissza, 3990000);
eq("Gergő: a hónapon belül a legfrissebb elöl", g[0].honapok[0].tetelek.map((x) => x.date),
  ["2026-09-16", "2026-09-15", "2026-09-01"]);

// --- több hónap: a záró egyenleg felülről lefelé fogy ---
const TOBB = [
  t("2026-11-02", -250000),
  t("2026-10-10", 100000),
  t("2026-10-02", 50000),
  t("2026-09-16", 4220000),
  t("2026-09-01", -250000),
];
const tb = elolegBontas(TOBB);
const osszes = TOBB.reduce((s, x) => s + x.amount, 0);
eq("három hónap", tb[0].honapok.map((h) => h.kulcs), ["2026-11", "2026-10", "2026-09"]);
eq("a legfrissebb hónap zárója = teljes egyenleg", tb[0].honapok[0].zaroEgyenleg, osszes);
// november: -250 000 → október végén 250 000-rel többnek kellett lennie
eq("október végi egyenleg", tb[0].honapok[1].zaroEgyenleg, osszes + 250000);
// október: +150 000 → szeptember végén 150 000-rel kevesebb
eq("szeptember végi egyenleg", tb[0].honapok[2].zaroEgyenleg, osszes + 250000 - 150000);
// a legrégebbi hónap zárója = a saját mozgása (előtte nem volt semmi)
eq("a legrégebbi hónap zárója a saját mozgása",
  tb[0].honapok[2].zaroEgyenleg, 4220000 - 250000);

// --- évhatár ---
const KETEV = [
  t("2027-02-01", -250000),
  t("2027-01-20", 60000),
  t("2026-12-01", -250000),
  t("2026-11-10", 40000),
];
const ke = elolegBontas(KETEV);
eq("két év, a frissebb elöl", ke.map((e) => e.ev), [2027, 2026]);
eq("2027-ben két hónap", ke[0].honapok.length, 2);
eq("2026-ban két hónap", ke[1].honapok.length, 2);
eq("2027 felvett", ke[0].felvett, 60000);
eq("2027 vissza", ke[0].vissza, -250000);
eq("2026 felvett", ke[1].felvett, 40000);
eq("2026 vissza", ke[1].vissza, -250000);
eq("az évek összege a teljes egyenleg",
  ke.reduce((s, e) => s + e.felvett + e.vissza, 0),
  KETEV.reduce((s, x) => s + x.amount, 0));

// --- csak visszafizetés egy hónapban ---
const CSAKMINUSZ = elolegBontas([t("2026-12-01", -250000), t("2026-11-10", 300000)]);
eq("decemberben nincs felvett", CSAKMINUSZ[0].honapok[0].felvett, 0);
eq("decemberben csak vissza", CSAKMINUSZ[0].honapok[0].vissza, -250000);
eq("december végi egyenleg", CSAKMINUSZ[0].honapok[0].zaroEgyenleg, 50000);

// --- a nyugtázatlan tétel is beleszámít ---
// Különben a kártyán látható összeg és a bontás nem ugyanazt mondaná.
const NYUGTAZATLAN = elolegBontas([t("2026-10-02", 50000, null), t("2026-09-15", 20000)]);
eq("a nyugtázatlan tétel is benne van a zárásban",
  NYUGTAZATLAN[0].honapok[0].zaroEgyenleg, 70000);
eq("és a hónapja is létrejön", NYUGTAZATLAN[0].honapok.length, 2);

// --- nulla egyenleg (mindent visszafizetett) ---
const NULLA = elolegBontas([t("2026-10-01", -100000), t("2026-09-01", 100000)]);
eq("kiegyenlített tartozás zárója nulla", NULLA[0].honapok[0].zaroEgyenleg, 0);
eq("a szeptemberi záró még a teljes összeg", NULLA[0].honapok[1].zaroEgyenleg, 100000);

console.log(`\nElőleg-bontás teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
