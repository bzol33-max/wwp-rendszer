// A szabadság-igénylés számolásainak tesztje.
// Futtatás: npx tsx scripts/teszt-szabadsag.ts
//
// Miért fontos: ezek a függvények döntik el, hány napot fogyaszt egy kérés
// (hétvége nélkül), kivel ütközik, és mennyi marad a keretből jóváhagyás
// után. Egy elrontott nap csendben hamis szabadság-egyenleget ad, és a
// torlódást sem jelzi — nincs, ami szóljon.

import {
  igenyUtkozesei,
  keretJovahagyasUtan,
  munkanapok,
  rovidNevek,
  szabadsagRacs,
  szabadsagSzin,
  hetvege,
  type SzabadsagIgeny,
  type SzabadsagMerleg,
} from "@/lib/jelenlet/shared";

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

let idSzamlalo = 0;
function igeny(
  employee_id: string,
  tol: string,
  ig: string,
  allapot: SzabadsagIgeny["allapot"] = "kert",
  tipus: SzabadsagIgeny["tipus"] = "szabadsag"
): SzabadsagIgeny {
  return {
    id: String(++idSzamlalo),
    employee_id,
    employee_name: `Dolgozó ${employee_id}`,
    tol,
    ig,
    tipus,
    allapot,
    megjegyzes: null,
    bekuldte: null,
    bekuldve: "2026-10-01 08:00",
    dontes_at: null,
    dontes_by: null,
    dontes_oka: null,
  };
}

// --- hétvége ---
eq("szombat hétvége", hetvege("2026-10-03"), true);
eq("vasárnap hétvége", hetvege("2026-10-04"), true);
eq("péntek nem hétvége", hetvege("2026-10-02"), false);
eq("hétfő nem hétvége", hetvege("2026-10-05"), false);

// --- munkanapok egy szakaszban ---
eq("egy munkanap", munkanapok("2026-10-05", "2026-10-05"), ["2026-10-05"]);
eq("egy hétvégi nap nem munkanap", munkanapok("2026-10-03", "2026-10-03"), []);
eq(
  "hétfőtől péntekig öt nap",
  munkanapok("2026-10-05", "2026-10-09").length,
  5
);
// A két hetes szabadság 10 munkanap, nem 14: a két hétvége kimarad.
eq("két hét = 10 munkanap", munkanapok("2026-10-05", "2026-10-16").length, 10);
eq(
  "a hétvége tényleg kimarad",
  munkanapok("2026-10-05", "2026-10-16").includes("2026-10-10"),
  false
);
// Karácsonyi szakasz: dec. 21. hétfő – dec. 31. csütörtök, két hétvégi nap
// (26-27.) kimarad, tehát 9 munkanap.
eq("dec. 21–31. = 9 munkanap", munkanapok("2026-12-21", "2026-12-31").length, 9);
eq("visszafelé megadott szakasz üres", munkanapok("2026-10-09", "2026-10-05"), []);
// Évhatár: a szakasz átlóghat a következő évbe.
eq("évhatáron átnyúló szakasz", munkanapok("2026-12-30", "2027-01-04").length, 4);
// Szökőnap (2028. febr. 29. kedd) nem veszhet el.
eq(
  "szökőnap benne van",
  munkanapok("2028-02-28", "2028-03-01").includes("2028-02-29"),
  true
);

// --- éves rács ---
const SORREND = ["1", "2", "3"];
const racsIgenyek = [
  igeny("1", "2026-12-21", "2026-12-31"),
  igeny("2", "2026-12-22", "2026-12-24", "jovahagyva"),
  igeny("3", "2026-12-23", "2026-12-24"),
  igeny("1", "2026-11-02", "2026-11-03", "elutasitva"),
  igeny("2", "2026-11-09", "2026-11-10", "visszavonva"),
];
const racs = szabadsagRacs(racsIgenyek, SORREND);
eq("dec. 21. — egy ember", racs.get("2026-12-21")?.length, 1);
eq("dec. 22. — ketten", racs.get("2026-12-22")?.length, 2);
eq("dec. 23. — hárman", racs.get("2026-12-23")?.length, 3);
eq(
  "a csíkok sorrendje a dolgozó-sorrendet követi",
  racs.get("2026-12-23")?.map((b) => b.employeeId),
  ["1", "2", "3"]
);
eq(
  "a kért és a jóváhagyott állapot elkülönül",
  racs.get("2026-12-22")?.map((b) => b.allapot),
  ["kert", "jovahagyva"]
);
eq("hétvége nincs a rácsban", racs.has("2026-12-26"), false);
eq("elutasított igény nincs a rácsban", racs.has("2026-11-02"), false);
eq("visszavont igény nincs a rácsban", racs.has("2026-11-09"), false);

// --- ütközés ---
const utk = igenyUtkozesei(racsIgenyek[0], racsIgenyek);
eq("dec. 21–31. két emberrel ütközik", utk.length, 2);
eq(
  "a 2-es dolgozóval három napon",
  utk.find((u) => u.employeeId === "2")?.napok,
  ["2026-12-22", "2026-12-23", "2026-12-24"]
);
eq(
  "a 3-as dolgozóval két napon",
  utk.find((u) => u.employeeId === "3")?.napok.length,
  2
);
// Aki egyedül van, annak nincs ütközése — és a saját másik igénye sem az.
const magaban = igeny("1", "2026-07-06", "2026-07-07");
eq("egyedül álló kérésnek nincs ütközése", igenyUtkozesei(magaban, [magaban]), []);
const sajatMasik = igeny("1", "2026-12-21", "2026-12-22");
eq(
  "a saját másik igénye nem ütközés",
  igenyUtkozesei(sajatMasik, [sajatMasik, racsIgenyek[0]]),
  []
);
// Elutasított igény nem ütközik: a nap felszabadult.
eq(
  "elutasított igénnyel nincs ütközés",
  igenyUtkozesei(igeny("3", "2026-11-02", "2026-11-03"), [racsIgenyek[3]]),
  []
);

// --- keret jóváhagyás után ---
function merleg(keret: number | null, kivett: number): SzabadsagMerleg {
  return {
    employeeId: "1",
    name: "Dolgozó 1",
    keret,
    fordulonap: "2026-08-31",
    kivett,
    kert: 0,
    maradek: keret === null ? null : Math.max(0, keret - kivett),
  };
}
eq(
  "15 napos keretből 10 kivéve, 3 napot kér: 2 marad",
  keretJovahagyasUtan(merleg(15, 10), igeny("1", "2026-10-05", "2026-10-07")),
  2
);
eq(
  "a hétvégét nem számolja bele",
  keretJovahagyasUtan(merleg(15, 10), igeny("1", "2026-10-02", "2026-10-05")),
  3
);
eq(
  "keret-túllépés negatív számot ad (nem tiltás, jelzés)",
  keretJovahagyasUtan(merleg(2, 0), igeny("1", "2026-10-05", "2026-10-09")),
  -3
);
eq(
  "betegszabadság nem fogyaszt keretet",
  keretJovahagyasUtan(merleg(15, 10), igeny("1", "2026-10-05", "2026-10-09", "kert", "beteg")),
  5
);
eq(
  "beállított keret nélkül nem nyilatkozunk",
  keretJovahagyasUtan(merleg(null, 0), igeny("1", "2026-10-05", "2026-10-07")),
  null
);
eq(
  "hiányzó mérleg esetén sem",
  keretJovahagyasUtan(undefined, igeny("1", "2026-10-05", "2026-10-07")),
  null
);

// --- rövid nevek és betűjelek a rács celláihoz ---
// A valódi csapat: két Gábor van, őket a családnév választja el.
const CSAPAT = [
  "Vadon Gábor",
  "Bodogán Gabi",
  "Vadon Gergő",
  "Takács Miklós",
  "Oszlánszki Tamás",
  "Varga János",
];
const rn = rovidNevek(CSAPAT);
eq("egyedi keresztnév marad keresztnév", rn[0].rovid, "Gábor");
eq("Bodogán Gabi rövid neve Gabi", rn[1].rovid, "Gabi");
eq("Vadon Gergő rövid neve Gergő", rn[2].rovid, "Gergő");
eq("minden rövid név különbözik", new Set(rn.map((r) => r.rovid)).size, CSAPAT.length);
eq("minden betűjel különbözik", new Set(rn.map((r) => r.betu)).size, CSAPAT.length);
eq("a betűjel rövid marad", Math.max(...rn.map((r) => r.betu.length)), 2);

// Két ugyanolyan keresztnév: a családnév azonosít.
const ketGabor = rovidNevek(["Vadon Gábor", "Bodogán Gábor"]);
eq("két Gábort a családnév választja el", ketGabor.map((r) => r.rovid), ["Vadon", "Bodogán"]);
eq("és a betűjelük is más", ketGabor.map((r) => r.betu), ["Va", "Bo"]);

// Azonos kezdetű rövid nevek: a betűjel addig hosszabbodik, amíg elválik.
const hasonlo = rovidNevek(["Nagy Tamás", "Kis Tamara"]);
eq("Tamás és Tamara betűjele elválik", new Set(hasonlo.map((r) => r.betu)).size, 2);

// Egy tagú név (ahogy a bérjegyzéken is előfordulhat) nem dobhat hibát.
eq("egy tagú név", rovidNevek(["Gabi"])[0].rovid, "Gabi");

// Hétnél több dolgozó: a szín körbefordul, de nem lesz üres.
eq("8. dolgozó színe körbefordul", szabadsagSzin(7), szabadsagSzin(0));
eq("minden index ad színt", [0, 3, 6, 12].every((i) => szabadsagSzin(i).startsWith("bg-")), true);

console.log(`\nSzabadság teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
