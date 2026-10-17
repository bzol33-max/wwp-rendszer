// Fuvarozás 2. kör · Kocsi-sáv tiszta logika (lib/fuvarozas2/kocsi-sav-alap.ts).
// Spec: docs/fuvarozas-2-kor-terv.md „Kocsi-sáv (Dev A)” 1–8. szabály.
// Futtatás: npx tsx scripts/teszt-2kor-kocsi-sav.ts

import { kocsiSav, napCimke, type KocsiSavBemenet } from "@/lib/fuvarozas2/kocsi-sav-alap";
import type { TukorSor, TukorAllas } from "@/lib/fuvarozas2/ma-tukor";
import type { NapCella, Res, HetiFuvar } from "@/lib/fuvarozas2/tervezes-het-alap";
import type { Kihasznaltsag } from "@/lib/fuvarozas2/kihasznaltsag-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// ── Fixture-építők ───────────────────────────────────────────────────────────
type Megallo = Extract<TukorSor, { tipus: "megallo" }>;
const fuvarSor = (fuvarId: string, partner: string, jelleg: "ber" | "sajat" = "ber"): TukorSor =>
  ({ tipus: "fuvar", fuvarId, partner, hivatkozas: null, jelleg });
const megallo = (fuvarId: string, allapot: Megallo["allapot"], varos: string, extra: Partial<Megallo> = {}): TukorSor => ({
  tipus: "megallo", fuvarId, felLe: "lerako", varos, terv: null, teny: null, elteres: null, allapot,
  kiemelt: null, allas: null, ceg: null, kontaktNev: null, telefon: null, ...extra,
});
const allas: TukorAllas = { percek: 42, cim: "Debrecen, Határ út", tol: "10:05", ig: "10:47", folyamatban: false, rogzites: null };
const allasSor: TukorSor = { tipus: "allas", allas };

const P = { szakoly: { lat: 47.77, lon: 21.93 }, bp: { lat: 47.5, lon: 19.04 }, tata: { lat: 47.65, lon: 18.32 } };
const hf = (id: string, nap: string): HetiFuvar =>
  ({ id, cim: id, felVaros: "Szakoly", leVaros: "Tata", fel: P.szakoly, le: P.tata, felNap: nap, leNap: nap, sajat: false });
const res = (kulcs: string, nap: string, honnan: string, km: number, kocsi = "AOPU-427"): Res =>
  ({ kulcs, kocsi, sofor: "Gergő", nap, honnan, hova: "Szakoly", a: P.bp, b: P.szakoly, km, ft: km * 300, haza: true });
const cella = (nap: string, szabad: boolean, fuvarok: HetiFuvar[] = [], resek: Res[] = []): NapCella => ({ nap, fuvarok, resek, szabad });

const het: Kihasznaltsag & { berBevetelFt: number } = {
  bevetelPerNap: 47000, fedezetPerNap: -95000, uresKmSzazalek: 16.4, fizetosNapArany: 0.6,
  kmKoltsegFt: 310000, fedezetFt: -475000, berBevetelFt: 235000,
};

// 2026-10-12 hétfő … 2026-10-17 szombat; ma = 2026-10-15 csütörtök.
const MA = "2026-10-15";
const HET = "2026-10-12";
const alapCellak = (): NapCella[] => [
  cella("2026-10-12", false, [hf("a", "2026-10-12")]),
  cella("2026-10-13", false, [hf("b", "2026-10-13")]),
  cella("2026-10-14", true),
  cella("2026-10-15", false, [hf("c", "2026-10-15")]),
  cella("2026-10-16", false, [hf("d", "2026-10-16")]),
  cella("2026-10-17", true),
];

function bemenet(r: Partial<KocsiSavBemenet> = {}): KocsiSavBemenet {
  return {
    kod: "AOPU-427", sofor: "Gergő", helykitolto: null,
    allapot: { szoveg: "úton · 72 km/h", szin: "mint", hely: "M3, Füzesabony" },
    hetiSor: "Tachó: ma még 2 ó 40 p · hét 31/56 ó",
    sorok: [], holnap: [], het: null, ma: MA, hetKezdet: HET, cellak: [], resek: [],
    ...r,
  };
}

// ── 5. napCimke ─────────────────────────────────────────────────────────────
eq("napCimke: ma", napCimke("2026-10-15", "2026-10-15"), "ma");
eq("napCimke: holnap", napCimke("2026-10-16", "2026-10-15"), "holnap");
eq("napCimke: csütörtök", napCimke("2026-10-22", "2026-10-15"), "Cs 10.22.");
eq("napCimke: hétfő", napCimke("2026-10-19", "2026-10-15"), "H 10.19.");
eq("napCimke: kedd", napCimke("2026-10-20", "2026-10-15"), "K 10.20.");
eq("napCimke: szerda", napCimke("2026-10-21", "2026-10-15"), "Sze 10.21.");
eq("napCimke: péntek", napCimke("2026-10-23", "2026-10-15"), "P 10.23.");
eq("napCimke: szombat (holnapután)", napCimke("2026-10-17", "2026-10-15"), "Szo 10.17.");
eq("napCimke: vasárnap", napCimke("2026-10-18", "2026-10-15"), "V 10.18.");
// Feltevés: a tegnap nem kap külön szót, csak a rövid alakot.
eq("napCimke: múltbeli nap (tegnap)", napCimke("2026-10-14", "2026-10-15"), "Sze 10.14.");
eq("napCimke: hónapváltás → holnap", napCimke("2026-11-01", "2026-10-31"), "holnap");
eq("napCimke: hónapváltás, holnapután, nullával töltve", napCimke("2026-11-02", "2026-10-31"), "H 11.02.");
eq("napCimke: évváltás → holnap", napCimke("2027-01-01", "2026-12-31"), "holnap");
eq("napCimke: szökőnap → holnap", napCimke("2028-02-29", "2028-02-28"), "holnap");
eq("napCimke: február vége → március 1. holnap", napCimke("2027-03-01", "2027-02-28"), "holnap");
// Óraátállítás (2026-10-25, 2027-03-28) nem tolhatja el a napot.
eq("napCimke: őszi óraátállítás napja holnap", napCimke("2026-10-25", "2026-10-24"), "holnap");
eq("napCimke: őszi óraátállítás után holnap", napCimke("2026-10-26", "2026-10-25"), "holnap");
eq("napCimke: tavaszi óraátállítás napja holnap", napCimke("2027-03-28", "2027-03-27"), "holnap");
eq("napCimke: tavaszi óraátállítás napja rövid alak", napCimke("2027-03-28", "2027-03-26"), "V 03.28.");
eq("napCimke: egy év múlva ugyanaz a hónap.nap — nem 'ma'", napCimke("2027-10-15", "2026-10-15"), "P 10.15.");

// ── Alapmezők, uzemel, allapot, hely, tacho ─────────────────────────────────
{
  const s = kocsiSav(bemenet());
  eq("kod", s.kod, "AOPU-427");
  eq("sofor", s.sofor, "Gergő");
  eq("uzemel: helykitolto null → true", s.uzemel, true);
  eq("helykitolto null", s.helykitolto, null);
  eq("allapot.szoveg", s.allapot?.szoveg, "úton · 72 km/h");
  eq("allapot.szin", s.allapot?.szin, "mint");
  eq("hely = allapot.hely", s.hely, "M3, Füzesabony");
  eq("tacho = hetiSor", s.tacho, "Tachó: ma még 2 ó 40 p · hét 31/56 ó");
  eq("üres bemenet: futo null", s.futo, null);
  eq("üres bemenet: kovetkezoFuvar null", s.kovetkezoFuvar, null);
  eq("üres bemenet: hetSzamok null", s.hetSzamok, null);
  eq("üres bemenet: szabad null", s.szabad, null);
  eq("üres bemenet: ajanlatHref", s.ajanlatHref, "/fuvarozas2/tervezes?het=2026-10-12");
}
{
  const s = kocsiSav(bemenet({ allapot: null, hetiSor: null }));
  eq("allapot null → allapot null", s.allapot, null);
  eq("allapot null → hely null", s.hely, null);
  eq("hetiSor null → tacho null", s.tacho, null);
}
{
  const s = kocsiSav(bemenet({ allapot: { szoveg: "nincs élő GPS-adat", szin: "amber", hely: null } }));
  eq("allapot hely null → hely null", s.hely, null);
  eq("allapot amber szín", s.allapot?.szin, "amber");
}

// ── 1. futo ─────────────────────────────────────────────────────────────────
// Gergő tipikus napja: reggel kész fuvar (#301), most úton a #310-zel, délután #311 még hátra.
const napSorok: TukorSor[] = [
  fuvarSor("301", "Duvenbeck", "ber"),
  megallo("301", "kesz", "Szakoly", { felLe: "felrako", teny: "06:10–07:02" }),
  megallo("301", "kesz", "Nyíregyháza", { teny: "08:15–09:00", elteres: "ablakban" }),
  allasSor,
  fuvarSor("310", "Kühne + Nagel", "ber"),
  megallo("310", "kesz", "Debrecen", { felLe: "felrako", teny: "10:05–10:47" }),
  megallo("310", "kovetkezo", "Tata", { felLe: "lerako", terv: "13:00–15:00", teny: "ETA 13:20", elteres: "ablakban" }),
  megallo("310", "hatra", "Tompaládony"),
  fuvarSor("311", "Saját — raklap", "sajat"),
  megallo("311", "hatra", "Budapest", { felLe: "felrako" }),
];
{
  const s = kocsiSav(bemenet({ sorok: napSorok }));
  eq("futo: első nem-kész fuvar a #310", s.futo?.fuvarId, "310");
  eq("futo: partner a fuvar-sorból", s.futo?.partner, "Kühne + Nagel");
  eq("futo: jelleg", s.futo?.jelleg, "ber");
  eq("futo: keszDb", s.futo?.keszDb, 1);
  eq("futo: osszDb (az állás-sor nem megálló)", s.futo?.osszDb, 3);
  eq("futo: kovetkezo teljes", s.futo?.kovetkezo, {
    felLe: "lerako", varos: "Tata", terv: "13:00–15:00", teny: "ETA 13:20", elteres: "ablakban", kesik: false,
  });
  eq("futo esetén kovetkezoFuvar null", s.kovetkezoFuvar, null);
}
// „most” és „kovetkezo” együtt: a „most” nyer, akkor is, ha a „kovetkezo” előbb áll.
{
  const sorok: TukorSor[] = [
    fuvarSor("320", "Waberer's"),
    megallo("320", "kovetkezo", "Győr", { felLe: "lerako" }),
    megallo("320", "most", "Komárom", { felLe: "felrako", teny: "ott 11:20 óta", elteres: "késik 35 p", kiemelt: "kesik" }),
    megallo("320", "most", "Tatabánya"),
  ];
  const s = kocsiSav(bemenet({ sorok }));
  eq("most+kovetkezo: a „most” a következő", s.futo?.kovetkezo?.varos, "Komárom");
  eq("most+kovetkezo: első „most” (nem a második)", s.futo?.kovetkezo?.felLe, "felrako");
  eq("kiemelt kesik → kesik true", s.futo?.kovetkezo?.kesik, true);
  eq("eltérés átvéve", s.futo?.kovetkezo?.elteres, "késik 35 p");
  eq("tény átvéve", s.futo?.kovetkezo?.teny, "ott 11:20 óta");
  eq("terv null átvéve", s.futo?.kovetkezo?.terv, null);
  eq("keszDb 0", s.futo?.keszDb, 0);
  eq("osszDb 3", s.futo?.osszDb, 3);
}
// kiemelt „varakozik” nem késés.
{
  const s = kocsiSav(bemenet({ sorok: [fuvarSor("1", "X"), megallo("1", "most", "Tata", { kiemelt: "varakozik" })] }));
  eq("kiemelt varakozik → kesik false", s.futo?.kovetkezo?.kesik, false);
}
// Minden kész → futo null; holnapi fuvar → kovetkezoFuvar.
{
  const sorok: TukorSor[] = [
    fuvarSor("301", "Duvenbeck"), megallo("301", "kesz", "Szakoly"), megallo("301", "kesz", "Nyíregyháza"),
    fuvarSor("302", "Kühne + Nagel"), megallo("302", "kesz", "Debrecen"),
  ];
  const holnap = [{ partner: "Waberer's", utvonal: "Szakoly → Győr" }, { partner: "DHL", utvonal: "Győr → Budapest" }];
  const s = kocsiSav(bemenet({ sorok, holnap }));
  eq("minden kész → futo null", s.futo, null);
  eq("futo null + holnap → holnap[0]", s.kovetkezoFuvar, { partner: "Waberer's", utvonal: "Szakoly → Győr" });
}
// Csak „hatra” megállók (még el sem indult a nap): nincs futó (a szabály csak most/kovetkezo-t néz).
{
  const s = kocsiSav(bemenet({ sorok: [fuvarSor("9", "X"), megallo("9", "hatra", "Tata"), megallo("9", "hatra", "Győr")] }));
  eq("csak hatra → futo null", s.futo, null);
}
// Fuvar-sor megálló nélkül → nem futó; üres holnap → kovetkezoFuvar null.
{
  const s = kocsiSav(bemenet({ sorok: [fuvarSor("8", "X")], holnap: [] }));
  eq("fuvar-sor megálló nélkül → futo null", s.futo, null);
  eq("üres holnap → kovetkezoFuvar null", s.kovetkezoFuvar, null);
}
// Csak állás-sor → futo null.
eq("csak állás-sor → futo null", kocsiSav(bemenet({ sorok: [allasSor] })).futo, null);
// Fuvar-sor nélküli megállók: partner "", jelleg "ber".
{
  const s = kocsiSav(bemenet({ sorok: [megallo("400", "kesz", "Szakoly"), megallo("400", "kovetkezo", "Budapest", { felLe: "lerako" })] }));
  eq("fuvar-sor nélkül: fuvarId", s.futo?.fuvarId, "400");
  eq("fuvar-sor nélkül: partner üres", s.futo?.partner, "");
  eq("fuvar-sor nélkül: jelleg ber", s.futo?.jelleg, "ber");
  eq("fuvar-sor nélkül: 1/2", [s.futo?.keszDb, s.futo?.osszDb], [1, 2]);
}
// Saját fuvar jelleg átvétele.
{
  const s = kocsiSav(bemenet({ sorok: [fuvarSor("500", "WWP raklap", "sajat"), megallo("500", "most", "Balkány", { felLe: "felrako" })] }));
  eq("saját jelleg", s.futo?.jelleg, "sajat");
  eq("saját partner", s.futo?.partner, "WWP raklap");
}
// Több futásra alkalmas fuvar: az ELSŐ (sorrend szerint) nyer, akkor is, ha a második „most”.
{
  const sorok: TukorSor[] = [
    fuvarSor("A", "Első"), megallo("A", "kovetkezo", "Tata"),
    fuvarSor("B", "Második"), megallo("B", "most", "Győr"),
  ];
  const s = kocsiSav(bemenet({ sorok }));
  eq("több fuvar: az első nyer", s.futo?.fuvarId, "A");
  eq("több fuvar: partner az elsőé", s.futo?.partner, "Első");
}
// Összefésült megállók: a fuvar megállói nem egymás után állnak (közös napi sorrend).
{
  const sorok: TukorSor[] = [
    fuvarSor("A", "Alfa"), fuvarSor("B", "Béta"),
    megallo("A", "kesz", "Szakoly"), megallo("B", "kesz", "Balkány"),
    megallo("A", "kesz", "Debrecen"), megallo("B", "kovetkezo", "Budapest"), megallo("A", "hatra", "Tata"),
  ];
  const s = kocsiSav(bemenet({ sorok }));
  // Feltevés: a „hatra” is a fuvar összes megállójába számít; A-nak nincs most/kovetkezo → B a futó.
  eq("összefésült: B a futó", s.futo?.fuvarId, "B");
  eq("összefésült: B 1/2 kész", [s.futo?.keszDb, s.futo?.osszDb], [1, 2]);
  eq("összefésült: B partner (fuvar-sor a megállók előtt)", s.futo?.partner, "Béta");
}
// A fuvar-sor a megállói UTÁN áll — a partner akkor is onnan jön.
{
  const s = kocsiSav(bemenet({ sorok: [megallo("Z", "most", "Tata"), fuvarSor("Z", "Zéta", "sajat")] }));
  eq("fuvar-sor a megálló után: partner", s.futo?.partner, "Zéta");
  eq("fuvar-sor a megálló után: jelleg", s.futo?.jelleg, "sajat");
}

// ── 2. kovetkezoFuvar ───────────────────────────────────────────────────────
{
  const s = kocsiSav(bemenet({ sorok: napSorok, holnap: [{ partner: "DHL", utvonal: "Tata → Győr" }] }));
  eq("futó van + holnap → kovetkezoFuvar null", s.kovetkezoFuvar, null);
  eq("üres sorok + holnap → holnap[0]",
    kocsiSav(bemenet({ holnap: [{ partner: "DHL", utvonal: "Tata → Győr" }] })).kovetkezoFuvar, { partner: "DHL", utvonal: "Tata → Győr" });
}

// ── 3. hetSzamok ────────────────────────────────────────────────────────────
{
  const s = kocsiSav(bemenet({ het }));
  eq("hetSzamok a kihasználtság számaiból", s.hetSzamok, { bevetelFt: 235000, uresSzazalek: 16.4, fedezetPerNap: -95000 });
  eq("hetSzamok: null-ok átvéve (nem számolja újra)",
    kocsiSav(bemenet({ het: { ...het, uresKmSzazalek: null, fedezetPerNap: null, berBevetelFt: 0 } })).hetSzamok,
    { bevetelFt: 0, uresSzazalek: null, fedezetPerNap: null });
  // A bevetelPerNap/fedezetFt eltérő értéke nem hat: a fedezetPerNap-et nem a fedezetFt-ből számolja.
  eq("hetSzamok: nem számol újra",
    kocsiSav(bemenet({ het: { ...het, fedezetFt: 999, bevetelPerNap: 1, fedezetPerNap: 12345 } })).hetSzamok?.fedezetPerNap, 12345);
  eq("het null → hetSzamok null", kocsiSav(bemenet({ het: null })).hetSzamok, null);
}

// ── 4. szabad + 6. ajanlatHref ──────────────────────────────────────────────
{
  // Szerda szabad, de múlt; ma (csüt) foglalt; péntek foglalt; szombat szabad → szombat.
  const s = kocsiSav(bemenet({ cellak: alapCellak() }));
  eq("szabad: múltbeli szabad nap kimarad, szombat a következő", s.szabad,
    { nap: "2026-10-17", cimke: "Szo 10.17.", honnan: null, resKulcs: null, km: null });
  eq("szabad cella, nincs rés → href rés nélkül", s.ajanlatHref, "/fuvarozas2/tervezes?het=2026-10-12");
}
{
  // Ma szabad → „ma”.
  const c = alapCellak(); c[3] = cella("2026-10-15", true);
  const s = kocsiSav(bemenet({ cellak: c }));
  eq("szabad ma → cimke ma", [s.szabad?.nap, s.szabad?.cimke], ["2026-10-15", "ma"]);
}
{
  // Holnap (péntek) rés, szombat szabad → a korábbi (péntek, rés) nyer.
  const r = res("AOPU-427:1", "2026-10-16", "Budapest", 276);
  const c = alapCellak(); c[4] = cella("2026-10-16", false, [hf("d", "2026-10-16")], [r]);
  const s = kocsiSav(bemenet({ cellak: c, resek: [r] }));
  eq("rés holnap, szabad holnapután → rés nyer", s.szabad,
    { nap: "2026-10-16", cimke: "holnap", honnan: "Budapest", resKulcs: "AOPU-427:1", km: 276 });
  eq("ajanlatHref résre, kódolt kulccsal", s.ajanlatHref, "/fuvarozas2/tervezes?het=2026-10-12&res=AOPU-427%3A1");
}
{
  // Szabad nap korábban, rés később → a szabad nap nyer (null mezőkkel).
  const r = res("AOPU-427:2", "2026-10-17", "Tata", 310);
  const c = alapCellak(); c[3] = cella("2026-10-15", true); c[5] = cella("2026-10-17", false, [], [r]);
  const s = kocsiSav(bemenet({ cellak: c, resek: [r] }));
  eq("szabad korábban, rés később → szabad nyer", s.szabad,
    { nap: "2026-10-15", cimke: "ma", honnan: null, resKulcs: null, km: null });
  eq("szabad nyer → href rés nélkül", s.ajanlatHref, "/fuvarozas2/tervezes?het=2026-10-12");
}
{
  // Rés és szabad cella UGYANAZON a napon → a rés adatai.
  const r = res("AOPU-427:0", "2026-10-17", "Budapest", 276);
  const c = alapCellak(); c[5] = cella("2026-10-17", true, [], [r]);
  const s = kocsiSav(bemenet({ cellak: c, resek: [r] }));
  eq("rés + szabad ugyanazon a napon → rés adatai", s.szabad,
    { nap: "2026-10-17", cimke: "Szo 10.17.", honnan: "Budapest", resKulcs: "AOPU-427:0", km: 276 });
}
{
  // Két rés ugyanarra a napra → a legelső (a resek tömb sorrendjében).
  const r1 = res("AOPU-427:3", "2026-10-16", "Nádudvar", 210);
  const r2 = res("AOPU-427:4", "2026-10-16", "Tompaládony", 380);
  const c = alapCellak(); c[4] = cella("2026-10-16", false, [hf("d", "2026-10-16")], [r1, r2]);
  const s = kocsiSav(bemenet({ cellak: c, resek: [r1, r2] }));
  eq("két rés egy napon → a legelső", [s.szabad?.resKulcs, s.szabad?.honnan, s.szabad?.km], ["AOPU-427:3", "Nádudvar", 210]);
}
{
  // Múltbeli rés kimarad.
  const rMult = res("AOPU-427:0", "2026-10-13", "Tata", 300);
  const c = alapCellak(); c[1] = cella("2026-10-13", false, [hf("b", "2026-10-13")], [rMult]);
  const s = kocsiSav(bemenet({ cellak: c, resek: [rMult] }));
  eq("múltbeli rés kimarad → szombati szabad nap", [s.szabad?.nap, s.szabad?.resKulcs], ["2026-10-17", null]);
}
{
  // Nincs szabad nap és rés ma vagy később → null.
  const c = alapCellak(); c[5] = cella("2026-10-17", false, [hf("e", "2026-10-17")]);
  const s = kocsiSav(bemenet({ cellak: c }));
  eq("nincs szabad / rés → szabad null", s.szabad, null);
  eq("szabad null → href rés nélkül", s.ajanlatHref, "/fuvarozas2/tervezes?het=2026-10-12");
}
{
  // Üres cellák (a betöltő időtúllépése): rés hiába van → null.
  // Feltevés: csak a cellak napjai jönnek szóba; cella nélküli rés nem ad szabad napot.
  const s = kocsiSav(bemenet({ cellak: [], resek: [res("AOPU-427:0", "2026-10-16", "Budapest", 276)] }));
  eq("üres cellák → szabad null", s.szabad, null);
}
{
  // ajanlatHref kódolás: speciális karakterek a kulcsban, és a hetKezdet átvétele.
  const kulcs = "NMZ-492:0 & Győr/Bp?x=1#é";
  const r = res(kulcs, "2026-10-19", "Győr", 150, "NMZ-492");
  const s = kocsiSav(bemenet({ kod: "NMZ-492", ma: "2026-10-19", hetKezdet: "2026-10-19", cellak: [cella("2026-10-19", false, [], [r])], resek: [r] }));
  eq("ajanlatHref encodeURIComponent", s.ajanlatHref, `/fuvarozas2/tervezes?het=2026-10-19&res=${encodeURIComponent(kulcs)}`);
  eq("ajanlatHref kódolt alak szó szerint", s.ajanlatHref,
    "/fuvarozas2/tervezes?het=2026-10-19&res=NMZ-492%3A0%20%26%20Gy%C5%91r%2FBp%3Fx%3D1%23%C3%A9");
}
{
  // Hétváltás közelében: a cellák a jövő hétről (vasárnapi ma), hónapváltással a címkében.
  const s = kocsiSav(bemenet({ ma: "2026-11-01", hetKezdet: "2026-11-02", cellak: [cella("2026-11-02", false, [hf("x", "2026-11-02")]), cella("2026-11-03", true)] }));
  eq("hónapváltás: szabad kedd címke", [s.szabad?.nap, s.szabad?.cimke], ["2026-11-03", "K 11.03."]);
  eq("hetKezdet a hrefben", s.ajanlatHref, "/fuvarozas2/tervezes?het=2026-11-02");
}

// ── 7. nem üzemelő kocsi ────────────────────────────────────────────────────
{
  const r = res("JANI:0", "2026-10-16", "Budapest", 276, "JANI");
  const c = alapCellak(); c[4] = cella("2026-10-16", true, [], [r]);
  const s = kocsiSav(bemenet({
    kod: "JANI", sofor: "Jani", helykitolto: "nem üzemel (szerviz)",
    sorok: napSorok, holnap: [{ partner: "DHL", utvonal: "Tata → Győr" }], het, cellak: c, resek: [r],
  }));
  eq("nem üzemel: uzemel false", s.uzemel, false);
  eq("nem üzemel: helykitolto átvéve", s.helykitolto, "nem üzemel (szerviz)");
  eq("nem üzemel: futo null", s.futo, null);
  eq("nem üzemel: kovetkezoFuvar null", s.kovetkezoFuvar, null);
  eq("nem üzemel: hetSzamok null", s.hetSzamok, null);
  eq("nem üzemel: szabad null", s.szabad, null);
  eq("nem üzemel: ajanlatHref rés nélkül (szabad null)", s.ajanlatHref, "/fuvarozas2/tervezes?het=2026-10-12");
  eq("nem üzemel: kod/sofor", [s.kod, s.sofor], ["JANI", "Jani"]);
}
{
  // Üres string helykitöltő: nem null → nem üzemel (szó szerinti szabály).
  eq("helykitolto '' → uzemel false", kocsiSav(bemenet({ helykitolto: "" })).uzemel, false);
}

// ── 8. tisztaság ────────────────────────────────────────────────────────────
{
  const r = res("AOPU-427:1", "2026-10-16", "Budapest", 276);
  const c = alapCellak(); c[4] = cella("2026-10-16", false, [hf("d", "2026-10-16")], [r]);
  const b = bemenet({ sorok: napSorok, holnap: [{ partner: "DHL", utvonal: "x" }], het, cellak: c, resek: [r] });
  const elotte = JSON.stringify(b);
  const s1 = kocsiSav(b);
  const s2 = kocsiSav(b);
  eq("determinisztikus", JSON.stringify(s1), JSON.stringify(s2));
  eq("a bemenetet nem módosítja", JSON.stringify(b), elotte);
  // A dátum a `ma` bemenetből: messzi múltbeli / jövőbeli „ma” is helyes (nem Date.now()).
  const m = kocsiSav(bemenet({ ma: "2031-05-06", hetKezdet: "2031-05-05", cellak: [cella("2031-05-06", false), cella("2031-05-07", true)] }));
  eq("ma bemenetből: 2031 holnap", [m.szabad?.nap, m.szabad?.cimke], ["2031-05-07", "holnap"]);
  const m2 = kocsiSav(bemenet({ ma: "2020-01-01", hetKezdet: "2019-12-30", cellak: [cella("2020-01-01", true)] }));
  eq("ma bemenetből: 2020 ma", m2.szabad?.cimke, "ma");
}

console.log(`teszt-2kor-kocsi-sav: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
