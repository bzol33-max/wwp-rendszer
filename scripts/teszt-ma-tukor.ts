// A Ma oldal kocsi-oszlopának „tükör” sorai — a GPS nem tervezett állásai a
// helyükön (lib/fuvarozas2/ma-tukor.ts). A minták a 2026-09-28-i éles nap:
// Gergő (Biharkeresztes → Szentendre, utána állás Szentendrén és Budapesten)
// és Micó (EUCARGO, Polgáron a GPS nem ismerte fel a felrakót).
// Futtatás: npx tsx scripts/teszt-ma-tukor.ts

import { tukorSorok, type TukorFuvar, type TukorMegallo, type TukorSor } from "@/lib/fuvarozas2/ma-tukor";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const ures = { ablak_tol: null, ablak_ig: null, gps_erkezes: null, gps_tavozas: null, sofor_kesz_at: null, varakozas_kezdete: null, varakozas_vege: null, tervezett_nap: "2026-09-28" };
const m = (sorszam: number, tipus: "felrako" | "lerako", cim: string, x: Partial<TukorMegallo> = {}): TukorMegallo => ({ ...ures, sorszam, tipus, cim_nyers: cim, ...x });
const t = (hhmm: string) => `2026-09-28 ${String(Number(hhmm.slice(0, 2)) - 2).padStart(2, "0")}:${hhmm.slice(3)}:00+00`; // Budapest → UTC
const d = (hhmm: string) => new Date(t(hhmm).replace(" ", "T").replace("+00", "Z"));
const most = d("16:50");

// Röviden: minden sor egy szöveg, hogy a sorrend egy pillantással látsszon.
const rovid = (s: TukorSor[]) => s.map((r) =>
  r.tipus === "fuvar" ? `# ${r.partner}` :
  r.tipus === "allas" ? `ÁLLÁS ${r.allas.percek}p ${r.allas.cim}` :
  `${r.felLe === "felrako" ? "Fel" : "Le"} ${r.varos} [${r.allapot}]${r.allas ? ` +állás ${r.allas.percek}p` : ""}`);

// --- Gergő
const gergo: TukorFuvar[] = [
  {
    id: "282", partner: "BB-Logistic", hivatkozas: "002300/26", jelleg: "ber", megallo_reszletek: null,
    megallok: [
      m(1, "felrako", "HU-4110 Biharkeresztes", { ablak_tol: t("07:00"), ablak_ig: t("10:00"), gps_erkezes: t("07:16"), gps_tavozas: t("09:24") }),
      m(2, "lerako", "HU-2000 Szentendre", { ablak_tol: t("12:00"), ablak_ig: t("15:00"), gps_erkezes: t("12:16"), gps_tavozas: t("12:50") }),
    ],
  },
  {
    id: "285", partner: "Fabrika 2000", hivatkozas: null, jelleg: "ber", megallo_reszletek: null,
    megallok: [
      m(1, "felrako", "BUDAPEST", { ablak_tol: t("14:00"), ablak_ig: t("18:00") }),
      m(2, "lerako", "NYÍREGYHÁZA", { tervezett_nap: "2026-09-29", ablak_tol: "2026-09-29 06:00:00+00", ablak_ig: "2026-09-29 10:00:00+00" }),
    ],
  },
];
const gergoAllasok = [
  { kezdet: d("12:52"), veg: d("13:53"), cim: "Szentendre, Dobogókői út 4, 2000 Magyarország", percek: 61, lat: 47.67, lon: 19.07 },
  { kezdet: d("14:40"), veg: d("16:48"), cim: "Budapest, Sörgyár u. 8, 1106 Magyarország", percek: 128, lat: 47.49, lon: 19.15 },
];
const g = tukorSorok({ fuvarok: gergo, allasok: gergoAllasok, eta: null, most, ma: "2026-09-28" });
eq("Gergő: sorrend", rovid(g), [
  "# BB-Logistic",
  "Fel Biharkeresztes [kesz]",
  "Le Szentendre [kesz]",
  "ÁLLÁS 61p Szentendre, Dobogókői út 4, 2000 Magyarország",
  "# Fabrika 2000",
  "Fel BUDAPEST [most]",
  "Le NYÍREGYHÁZA [hatra]",
].map((x) => x === "Fel BUDAPEST [most]" ? "Fel BUDAPEST [most] +állás 128p" : x));
const bp = g.find((r) => r.tipus === "megallo" && r.varos === "BUDAPEST");
eq("Gergő: Budapestnél rögzíthető az állás", bp && bp.tipus === "megallo" ? bp.allas?.rogzites : null, { megbizasId: "285", sorszam: 1, lat: 47.49, lon: 19.15 });
eq("Gergő: Budapest tény", bp && bp.tipus === "megallo" ? bp.teny : null, "áll 14:40 óta");
const bh = g.find((r) => r.tipus === "megallo" && r.varos.includes("Biharkeresztes"));
eq("Gergő: Biharkeresztes terv/tény/eltérés", bh && bh.tipus === "megallo" ? [bh.terv, bh.teny, bh.elteres] : null, ["07:00–10:00", "07:16–09:24", "ablakban"]);
const ny = g.find((r) => r.tipus === "megallo" && r.varos === "NYÍREGYHÁZA");
eq("Gergő: más napi terv a nap nevével", ny && ny.tipus === "megallo" ? ny.terv : null, "kedd 08:00–12:00");

// --- Micó: Polgáron állt, de a GPS nem jelzett érkezést (a sofőr jelölte késznek)
const mico: TukorFuvar[] = [{
  id: "281", partner: "EUCARGO 2008 Kft.", hivatkozas: "2026.09.25.02", jelleg: "ber",
  megallo_reszletek: [{ tipus: "lerako", cim: "5100 Jászberény, Ipari út 3", ceg: "Jászberényi Raktár", nap: null, ido: null, kontakt: "Kovács Anna 30 123 4567" }],
  megallok: [
    m(1, "felrako", "4233 Balkány, Geszterédi u. 1", { ablak_tol: t("07:00"), ablak_ig: t("07:00"), gps_erkezes: t("06:40"), gps_tavozas: t("07:00") }),
    m(2, "felrako", "4080 Hajdúnánás, Pázsit u. 2", { ablak_tol: t("08:00"), ablak_ig: t("08:00"), gps_erkezes: t("08:18"), gps_tavozas: t("08:43") }),
    m(3, "felrako", "4090 Polgár, Pap tanya", { ablak_tol: t("09:30"), ablak_ig: t("09:30"), sofor_kesz_at: t("10:25") }),
    m(4, "lerako", "5100 Jászberény, Ipari út 3", { ablak_tol: t("17:00"), ablak_ig: t("17:00") }),
    m(5, "lerako", "2947 Ete, Kossuth Lajos utca 42", { tervezett_nap: "2026-09-29" }),
  ],
}];
const micoAllasok = [{ kezdet: d("09:29"), veg: d("10:25"), cim: "Polgár, Magyarország", percek: 57, lat: 47.87, lon: 21.12 }];
const mi = tukorSorok({ fuvarok: mico, allasok: micoAllasok, eta: d("17:35"), most, ma: "2026-09-28" });
eq("Micó: Polgár állása a megállónál, nem külön sor", rovid(mi), [
  "# EUCARGO 2008 Kft.",
  "Fel Balkány [kesz]",
  "Fel Hajdúnánás [kesz]",
  "Fel Polgár [kesz] +állás 57p",
  "Le Jászberény [kovetkezo]",
  "Le Ete [hatra]",
]);
const hn = mi.find((r) => r.tipus === "megallo" && r.varos === "Hajdúnánás");
eq("Micó: késés az ablakhoz", hn && hn.tipus === "megallo" ? hn.elteres : null, "+18 p");
const jb = mi.find((r) => r.tipus === "megallo" && r.varos === "Jászberény");
eq("Micó: következő — ETA, várható késés, kontakt", jb && jb.tipus === "megallo" ? [jb.teny, jb.elteres, jb.ceg, jb.telefon] : null, ["ETA 17:35", "+35 p várható", "Jászberényi Raktár", "06301234567"]);

// --- Állás két kész megálló között (nincs városegyezés): külön sor, a helyén
const koztes = tukorSorok({
  fuvarok: [{ id: "1", partner: "X", hivatkozas: null, jelleg: "ber", megallo_reszletek: null, megallok: [
    m(1, "felrako", "Debrecen", { gps_erkezes: t("07:00"), gps_tavozas: t("08:00") }),
    m(2, "lerako", "Szolnok", { gps_erkezes: t("11:00"), gps_tavozas: t("11:30") }),
  ] }],
  allasok: [{ kezdet: d("09:10"), veg: d("09:55"), cim: "M4 pihenő, Püspökladány", percek: 45, lat: null, lon: null }],
  eta: null, most, ma: "2026-09-28",
});
eq("Köztes állás a két megálló között", rovid(koztes), ["# X", "Fel Debrecen [kesz]", "ÁLLÁS 45p M4 pihenő, Püspökladány", "Le Szolnok [kesz]"]);

// --- Két állás ugyanoda: időrendben maradnak
const ket = tukorSorok({
  fuvarok: [{ id: "1", partner: "X", hivatkozas: null, jelleg: "ber", megallo_reszletek: null, megallok: [m(1, "lerako", "Győr")] }],
  allasok: [
    { kezdet: d("09:00"), veg: d("09:40"), cim: "A pihenő", percek: 40, lat: null, lon: null },
    { kezdet: d("11:00"), veg: d("11:30"), cim: "B kút", percek: 30, lat: null, lon: null },
  ],
  eta: null, most, ma: "2026-09-28",
});
eq("Két állás időrendben a nyitott megálló előtt", rovid(ket), ["ÁLLÁS 40p A pihenő", "ÁLLÁS 30p B kút", "# X", "Le Győr [kovetkezo]"]);

// --- Gergő 09-29: a korábban rögzített saját fuvar (#275) csak a már
// elkezdett RBT-fuvar (#284) UTÁN jön — a sorrendet a tény dönti, nem a sorszám.
const n29 = (x: Partial<TukorMegallo>) => ({ tervezett_nap: "2026-09-29", ...x });
const t29 = (hhmm: string) => t(hhmm).replace("2026-09-28", "2026-09-29");
const g29 = tukorSorok({
  fuvarok: [
    { id: "275", partner: "Fabrika 2000 Kft", hivatkozas: null, jelleg: "sajat", megallo_reszletek: null, megallok: [
      m(1, "felrako", "Szigetszentmiklós", n29({})),
      m(2, "lerako", "Tompaládony", n29({})),
    ] },
    { id: "284", partner: "RBT EUROPE Kft.", hivatkozas: "R16 / 2679 / 3168", jelleg: "ber", megallo_reszletek: null, megallok: [
      m(1, "felrako", "HAJDU HAJDUSÁGI ZRT, [H-4243] TÉGLÁS, Hrsz. 0135/9", n29({ gps_erkezes: t29("09:17"), gps_tavozas: t29("10:03") })),
      m(2, "lerako", "[H-1106] BUDAPEST X, Maglódi út 14/B.", n29({})),
    ] },
  ],
  allasok: [], eta: null, most: new Date("2026-09-29T09:00:00Z"), ma: "2026-09-29",
});
eq("Gergő 09-29: az elkezdett bér fuvar elöl, a saját utána", rovid(g29).filter((x) => x.startsWith("#")), ["# RBT EUROPE Kft.", "# Fabrika 2000 Kft"]);
eq("Gergő 09-29: Budapest a következő, a saját fuvar hátra", rovid(g29).filter((x) => !x.startsWith("#")).map((x) => x.replace(/^.* \[/, "[")), ["[kesz]", "[kovetkezo]", "[hatra]", "[hatra]"]);

// --- Micó 09-29: a második etei lerakón (Ady u.) áll 11:54 óta, az első
// (Kossuth u.) még nyitott. „Most” az, ahol áll; a Kossuth a következő, az
// ETA (célja Ete) oda kerül; a Császár hátra — ETA nélkül.
const e29 = tukorSorok({
  fuvarok: [{ id: "281", partner: "EUCARGO 2008 Kft.", hivatkozas: null, jelleg: "ber", megallo_reszletek: null, megallok: [
    m(9, "lerako", "2947 ETE KOSSUTH LAJOS UTCA 42.", n29({})),
    m(10, "lerako", "2947 ETE ADY ENDRE UTCA 27.", n29({ gps_erkezes: t29("11:54") })),
    m(11, "lerako", "2858 Császár, Petőfi Sándor utca 28.", n29({})),
  ] }],
  allasok: [], eta: new Date("2026-09-29T10:40:00Z"), etaCel: "ETE", most: new Date("2026-09-29T10:35:00Z"), ma: "2026-09-29",
});
const eSorok = e29.filter((r) => r.tipus === "megallo");
eq("Micó Ete: most ott áll, az első Ete a következő", eSorok.map((r) => r.tipus === "megallo" ? `${r.allapot} ${r.teny ?? "-"}` : ""), ["kovetkezo ETA 12:40", "most ott 11:54 óta", "hatra -"]);
const csaszarEta = tukorSorok({
  fuvarok: [{ id: "281", partner: "X", hivatkozas: null, jelleg: "ber", megallo_reszletek: null, megallok: [m(1, "lerako", "2858 Császár, Petőfi Sándor utca 28.", n29({}))] }],
  allasok: [], eta: new Date("2026-09-29T10:40:00Z"), etaCel: "Mezőlak", most: new Date("2026-09-29T10:35:00Z"), ma: "2026-09-29",
});
eq("más célú ETA nem kerül rossz megállóra", csaszarEta.find((r) => r.tipus === "megallo")?.tipus === "megallo" ? (csaszarEta.find((r) => r.tipus === "megallo") as { teny: string | null }).teny : "x", null);

console.log(`\nMa-tükör teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
