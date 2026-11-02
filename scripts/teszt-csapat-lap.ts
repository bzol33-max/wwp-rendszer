// A /jelenlet „Csapat” lap tiszta segédjeinek tesztje.
// Futtatás: npx tsx scripts/teszt-csapat-lap.ts
//
// Miért fontos: a rács celláinak állapota (szabadság / kért / beteg / ledolgozott /
// nyitott) dönti el, mit lát az iroda egy pillantásra — egy elcsúszott hét vagy egy
// rossz cella csendben hamis képet ad a csapatról.

import { summarizeByDay, type JelenletSession, type SzabadsagMerleg } from "@/lib/jelenlet/shared";
import {
  cella,
  eltolIso,
  formatIdo,
  hetCimke,
  hetekNapjai,
  hetfoIso,
  maiLetszam,
  maradCimke,
  napDatumCimke,
  tartomanyEvei,
} from "@/lib/jelenlet/csapat-lap";

let ok = 0,
  bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

let id = 0;
function szakasz(
  work_date: string,
  arrival_time: string | null,
  departure_time: string | null,
  day_type: JelenletSession["day_type"] = "munka",
  employee_id = "e1"
): JelenletSession {
  return { id: String(++id), employee_id, work_date, arrival_time, departure_time, day_type, note: null };
}
const nap = (szakaszok: JelenletSession[]) => summarizeByDay(szakaszok)[0];

// --- hetek ---
eq("hétfő: szerdából", hetfoIso("2026-10-21"), "2026-10-19");
eq("hétfő: vasárnapból", hetfoIso("2026-10-25"), "2026-10-19");
eq("hétfő: évhatáron", hetfoIso("2027-01-01"), "2026-12-28");
eq("eltolás hónaphatáron", eltolIso("2026-10-30", 3), "2026-11-02");
const hetek = hetekNapjai("2026-10-19", 4);
eq("4 hét", hetek.length, 4);
eq("hetenként 7 nap", hetek.every((h) => h.length === 7), true);
eq("2. hét hétfője", hetek[1][0], "2026-10-26");
eq("4. hét vasárnapja", hetek[3][6], "2026-11-15");
eq("hét-cím egy hónapon belül", hetCimke("2026-10-19"), "43. hét · okt. 19–25.");
eq("hét-cím hónaphatáron", hetCimke("2026-10-26"), "44. hét · okt. 26. – nov. 1.");
eq("nap-cím", napDatumCimke("2026-11-02"), "hétfő, nov. 2.");
eq("évek: egy év", tartomanyEvei("2026-10-19", "2026-11-15"), [2026]);
eq("évek: évváltás", tartomanyEvei("2026-12-28", "2027-01-24"), [2026, 2027]);
eq("idő formázása", formatIdo(530), "8:50");
eq("idő formázása: kerek óra", formatIdo(480), "8:00");

// --- cellák ---
const MA = "2026-10-21"; // szerda
const alap = { ma: MA, aktiv: true };
eq(
  "jóváhagyott szabadság",
  cella({ ...alap, iso: "2026-10-20", bejegyzes: { tipus: "szabadsag", allapot: "jovahagyva" } }).tipus,
  "szabadsag"
);
eq(
  "kért szabadság",
  cella({ ...alap, iso: "2026-10-28", bejegyzes: { tipus: "szabadsag", allapot: "kert" } }).felirat,
  "k"
);
eq(
  "beteg",
  cella({ ...alap, iso: "2026-10-20", bejegyzes: { tipus: "beteg", allapot: "jovahagyva" } }).felirat,
  "B"
);
eq(
  "szabadság a jelenléti napból is (kérés nélkül)",
  cella({ ...alap, iso: "2026-10-20", nap: nap([szakasz("2026-10-20", null, null, "szabadsag")]) }).felirat,
  "Sz"
);
eq("hétvége", cella({ ...alap, iso: "2026-10-24" }).tipus, "hetvege");
eq("ünnep (okt. 23.)", cella({ ...alap, iso: "2026-10-23" }), { tipus: "unnep", felirat: "Ü", cim: "Nemzeti ünnep" });
eq(
  "áthelyezett pihenőnap is ünnep",
  cella({ ...alap, ma: "2026-12-01", iso: "2026-12-24" }).felirat,
  "Ü"
);
eq(
  "ledolgozott idő",
  cella({ ...alap, iso: "2026-10-20", nap: nap([szakasz("2026-10-20", "07:00", "15:50")]) }).felirat,
  "8:50"
);
eq(
  "több szakasz összeadva",
  cella({
    ...alap,
    iso: "2026-10-20",
    nap: nap([szakasz("2026-10-20", "07:00", "11:00"), szakasz("2026-10-20", "13:00", "17:30")]),
  }).felirat,
  "8:30"
);
eq(
  "ledolgozós szombat munkanap: üres múlt = hiányzó",
  cella({ ...alap, ma: "2026-08-10", iso: "2026-08-08" }).tipus,
  "hianyzik"
);
eq(
  "múltbeli üres munkanap, jelenléti dolgozó: hiányzik",
  cella({ ...alap, iso: "2026-10-20" }).tipus,
  "hianyzik"
);
eq(
  "múltbeli üres munkanap, sofőr: üres",
  cella({ ...alap, aktiv: false, iso: "2026-10-20" }).tipus,
  "ures"
);
eq("ma még nincs bejegyzés: nem hiányzó", cella({ ...alap, iso: MA }).tipus, "ures");
eq("jövő munkanap", cella({ ...alap, iso: "2026-10-22" }).tipus, "jovo");
eq(
  "ma bent van",
  cella({ ...alap, iso: MA, nap: nap([szakasz(MA, "07:05", null)]) }).felirat,
  "bent"
);
eq(
  "múltbeli nyitott nap",
  cella({ ...alap, iso: "2026-10-20", nap: nap([szakasz("2026-10-20", "07:00", null)]) }).tipus,
  "nyitott"
);
eq(
  "hétvégi munka látszik",
  cella({ ...alap, iso: "2026-10-17", nap: nap([szakasz("2026-10-17", "08:00", "12:00")]) }).felirat,
  "4:00"
);

// --- Marad ---
function merleg(keret: number | null, maradek: number | null): SzabadsagMerleg {
  return { employeeId: "e1", name: "Teszt Elek", keret, fordulonap: null, kivett: 0, kert: 0, maradek };
}
eq("marad: 5/21", maradCimke(merleg(21, 5)).szoveg, "5/21");
eq("marad: bőven", maradCimke(merleg(21, 5)).keves, false);
eq("marad: 3 még narancs", maradCimke(merleg(21, 3)).keves, true);
eq("marad: túllépve is narancs", maradCimke(merleg(21, -2)).keves, true);
eq("marad: nincs keret", maradCimke(merleg(null, null)), { szoveg: "—", keves: false, cim: "Nincs keret beállítva" });
eq("marad: nincs mérleg", maradCimke(undefined).szoveg, "—");

// --- mai létszám ---
const racs = new Map([[MA, [{ employeeId: "e3", tipus: "szabadsag" as const, allapot: "jovahagyva" as const }]]]);
eq(
  "bent / távol",
  maiLetszam(
    ["e1", "e2", "e3", "e4"],
    MA,
    [szakasz(MA, "07:00", null, "munka", "e1"), szakasz(MA, "07:00", "12:00", "munka", "e2"), szakasz(MA, null, null, "beteg", "e4")],
    racs
  ),
  { bent: 1, tavol: 2 }
);
eq(
  "kért szabadság még nem távol",
  maiLetszam(["e1"], MA, [], new Map([[MA, [{ employeeId: "e1", tipus: "szabadsag", allapot: "kert" }]]])),
  { bent: 0, tavol: 0 }
);

console.log(`${ok} OK, ${bad} hiba`);
if (bad > 0) process.exit(1);
