// Hét nézet B1: bejegyzések, távollétek, kocsiszín (docs/het-b1-terv.md).
// Futtatás: npx tsx scripts/teszt-bejegyzes.ts

import {
  ellenorizBejegyzes, bejegyzesekNapokra, tavolletekNapokra, napFoglalt, elofordulNapon, bejegyzesIdo, tipusNev,
  type BejegyzesSor, type BejegyzesBemenet,
} from "@/lib/fuvarozas2/bejegyzes-alap";
import { kocsiSzin, SZURKE_SZIN } from "@/lib/fuvarozas2/kocsi-szin";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const alap: BejegyzesBemenet = { jarmuKod: "AOPU-427", tipus: "szerviz", nap: "2026-10-20", egeszNap: false, tol: "13:00", ig: "16:00", hely: " DAF Nyíregyháza ", megjegyzes: "" };
const hiba = (b: Partial<BejegyzesBemenet>, kodok?: string[]) => { const r = ellenorizBejegyzes({ ...alap, ...b }, kodok); return r.ok ? null : r.hiba; };

// --- ellenőrzés ---
{
  const r = ellenorizBejegyzes(alap, ["AOPU-427", "NMZ-492"]);
  eq("érvényes: ok", r.ok, true);
  if (r.ok) {
    eq("hely trimelve", r.ertek.hely, "DAF Nyíregyháza");
    eq("üres megjegyzés → null", r.ertek.megjegyzes, null);
    eq("ismétlés alapból nincs", r.ertek.ismetles, "nincs");
    eq("ismetlesIg nincs-nél null", r.ertek.ismetlesIg, null);
    eq("idők megmaradnak", [r.ertek.tol, r.ertek.ig], ["13:00", "16:00"]);
  }
  eq("üres kocsi", hiba({ jarmuKod: " " }), "Válassz kocsit.");
  eq("nem aktív kocsi", hiba({ jarmuKod: "XYZ" }, ["AOPU-427"]), "Ismeretlen vagy nem aktív kocsi.");
  eq("ismeretlen típus", hiba({ tipus: "ebéd" }) !== null, true);
  eq("hibás nap formátum", hiba({ nap: "2026-10-2" }), "Hibás nap.");
  eq("nem létező nap", hiba({ nap: "2026-02-30" }), "Hibás nap.");
  eq("hiányzó ig", hiba({ ig: "" }) !== null, true);
  eq("rossz időformátum", hiba({ tol: "7:00" }), "Az időt ÓÓ:PP alakban add meg.");
  eq("24:00 nem jó", hiba({ ig: "24:00" }), "Az időt ÓÓ:PP alakban add meg.");
  eq("ig = tol", hiba({ ig: "13:00" }), "A vége legyen később, mint a kezdete.");
  eq("ig < tol", hiba({ ig: "09:00" }), "A vége legyen később, mint a kezdete.");
  const e = ellenorizBejegyzes({ ...alap, egeszNap: true, tol: "13:00", ig: "09:00" });
  eq("egész nap: idők null, rossz idő nem számít", e.ok ? [e.ertek.tol, e.ertek.ig] : e.hiba, [null, null]);
  eq("hely túl hosszú", hiba({ hely: "x".repeat(121) }) !== null, true);
  eq("megjegyzés túl hosszú", hiba({ megjegyzes: "x".repeat(501) }) !== null, true);
  eq("hely 120 még jó", hiba({ hely: "x".repeat(120) }), null);
  eq("egyéb leírás nélkül", hiba({ tipus: "egyeb", hely: "", megjegyzes: "  " }), "Egyéb bejegyzésnél írd le, mi lesz (hely vagy megjegyzés).");
  eq("egyéb megjegyzéssel jó", hiba({ tipus: "egyeb", hely: "", megjegyzes: "telephelyi rakodás" }), null);
  const h = ellenorizBejegyzes({ ...alap, ismetles: "heti", ismetlesIg: "" });
  eq("heti, nyitott vég", h.ok ? [h.ertek.ismetles, h.ertek.ismetlesIg] : h.hiba, ["heti", null]);
  eq("heti, vége az első előtt", hiba({ ismetles: "heti", ismetlesIg: "2026-10-19" }), "Az ismétlés vége nem lehet az első alkalom előtt.");
  eq("heti, hibás vég", hiba({ ismetles: "heti", ismetlesIg: "2026-13-01" }), "Hibás ismétlés-vége dátum.");
  const n = ellenorizBejegyzes({ ...alap, ismetles: "nincs", ismetlesIg: "2026-12-01" });
  eq("nincs ismétlés → vég eldobva", n.ok ? n.ertek.ismetlesIg : n.hiba, null);
  eq("ismeretlen ismétlés → nincs", (() => { const x = ellenorizBejegyzes({ ...alap, ismetles: "havi" }); return x.ok ? x.ertek.ismetles : x.hiba; })(), "nincs");
  for (const t of ["szerviz", "gumis", "mosas", "muszaki", "tacho"]) eq(`típus ${t} elfogadva`, hiba({ tipus: t }), null);
}

// --- kibontás ---
const S = (x: Partial<BejegyzesSor> & { id: string }): BejegyzesSor => ({
  jarmuKod: "AOPU-427", tipus: "szerviz", nap: "2026-10-20", tol: null, ig: null, hely: null, megjegyzes: null, ismetles: "nincs", ismetlesIg: null, ...x,
});
const napok = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-26", "2026-10-27"];
{
  const egy = S({ id: "1" });
  const heti = S({ id: "2", jarmuKod: "NMZ-492", tipus: "mosas", nap: "2026-10-13", tol: "15:00", ig: "16:00", ismetles: "heti" });
  const hetiVeg = S({ id: "3", jarmuKod: "NMZ-492", nap: "2026-10-20", ismetles: "heti", ismetlesIg: "2026-10-27" });
  const kesobbi = S({ id: "4", nap: "2026-11-02", ismetles: "heti" });
  const reggel = S({ id: "5", tol: "07:00", ig: "09:00" });
  const r = bejegyzesekNapokra([egy, heti, hetiVeg, kesobbi, reggel], napok);
  eq("egyszeri csak a saját napján", Object.keys(r["AOPU-427"]), ["2026-10-20"]);
  eq("rendezés: egész nap elöl", r["AOPU-427"]["2026-10-20"].map((b) => b.id), ["1", "5"]);
  eq("alkalom kitöltve", r["AOPU-427"]["2026-10-20"][0].alkalom, "2026-10-20");
  eq("heti: kezdet előtti ablakban is a 7 naponkénti napokon", Object.keys(r["NMZ-492"]).sort(), ["2026-10-20", "2026-10-27"]);
  eq("10.20.: egész napos elöl, aztán a mosás", r["NMZ-492"]["2026-10-20"].map((b) => b.id), ["3", "2"]);
  eq("10.27.: mosás + vég napján még a 3-as", r["NMZ-492"]["2026-10-27"].map((b) => b.id), ["3", "2"]);
  eq("vég után nincs", elofordulNapon(hetiVeg, "2026-11-03"), false);
  eq("kezdet előtt nincs", elofordulNapon(kesobbi, "2026-10-26"), false);
  eq("nem 7 naponként nincs", elofordulNapon(heti, "2026-10-21"), false);
  eq("DST-átlépésen át (10.25.) is 7 nap", elofordulNapon(heti, "2026-11-03"), true);
  eq("üres bemenet", bejegyzesekNapokra([], napok), {});
}

// --- távollét ---
{
  const t = tavolletekNapokra([
    { jarmuKod: "NMZ-492", nap: "2026-10-21", tipus: "szabadsag" },
    { jarmuKod: "NMZ-492", nap: "2026-10-22", tipus: "beteg" },
    { jarmuKod: "NMZ-492", nap: "2026-10-22", tipus: "szabadsag" },
    { jarmuKod: "JANI", nap: "2026-10-20", tipus: "szabadsag" },
    { jarmuKod: "JANI", nap: "2026-10-20", tipus: "beteg" },
  ]);
  eq("távollét napok", t, { "NMZ-492": { "2026-10-21": "szabadsag", "2026-10-22": "beteg" }, JANI: { "2026-10-20": "beteg" } });
}

// --- foglaltság ---
{
  eq("semmi → nem foglalt", napFoglalt([], null), false);
  eq("távollét → foglalt", napFoglalt([], "szabadsag"), true);
  eq("egész nap → foglalt", napFoglalt([S({ id: "1" })], null), true);
  eq("reggeli 07–09 → nem foglalt", napFoglalt([S({ id: "1", tol: "07:00", ig: "09:00" })], null), false);
  eq("pont 12:00-ig → nem foglalt", napFoglalt([S({ id: "1", tol: "08:00", ig: "12:00" })], null), false);
  eq("12:00 után is tart → foglalt", napFoglalt([S({ id: "1", tol: "11:00", ig: "12:30" })], null), true);
  eq("délutáni szerviz → foglalt", napFoglalt([S({ id: "1", tol: "13:00", ig: "16:00" })], null), true);
}

// --- feliratok, szín ---
eq("idő felirat", bejegyzesIdo({ tol: "13:00", ig: "16:00" }), "13:00–16:00");
eq("egész nap felirat", bejegyzesIdo({ tol: null, ig: null }), "egész nap");
eq("típus név", tipusNev("mosas"), "Mosás");
eq("kék", kocsiSzin("blue").c, "#2f6fa8");
eq("sárga", kocsiSzin("yellow").c, "#c99a1a");
eq("zöld és lila különbözik", kocsiSzin("green").c !== kocsiSzin("purple").c, true);
eq("ismeretlen → szürke", kocsiSzin("pink"), SZURKE_SZIN);
eq("null → szürke", kocsiSzin(null), SZURKE_SZIN);

console.log(`teszt-bejegyzes: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
