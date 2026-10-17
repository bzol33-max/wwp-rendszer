// Hét B1: a becslő motor foglalt időszakai (bejegyzés, távollét) és a bejegyzés-megálló.
// Spec: docs/het-b1-terv.md. Futtatás: npx tsx scripts/teszt-het-foglalt.ts

import { utemterv, type UtemFuvar, type UtemMegallo, type UtemParam } from "@/lib/fuvarozas2/heti-utemterv-alap";
import { bejegyzesFoglalas, tavolletFoglalas } from "@/lib/fuvarozas2/bejegyzes-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const P = (foglalt?: { tol: string; ig: string }[]): UtemParam => ({
  napKezdes: "06:00", szunetUtanPerc: 270, szunetPerc: 45, napiMaxPerc: 540, napiPihenoPerc: 660, tilalmak: [], ...(foglalt ? { foglalt } : {}),
});
const M = (nap: string, tol: string | null, rakodasPerc: number, varos = "X", tipus: "felrako" | "lerako" = "felrako"): UtemMegallo =>
  ({ tipus, varos, nap, ablakTol: tol ? `${nap}T${tol}` : null, ablakIg: tol ? `${nap}T${tol}` : null, rakodasPerc });
const F = (id: string, megallok: UtemMegallo[], raallasPerc: number, szakaszPerc: number[] = [], km = 0): UtemFuvar => ({
  id, cim: id, jelleg: "sajat", dijFt: null, megallok,
  szakaszok: szakaszPerc.map((perc) => ({ perc, km, becsles: false })),
  raallas: { perc: raallasPerc, km, becsles: false },
});
const K = (ido: string) => ({ ido, folyamatosPerc: 0, napiPerc: 0 });
const napok = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
const m0 = (r: ReturnType<typeof utemterv>, fi: number, mi = 0) => {
  const m = r.fuvarok[fi].megallok[mi];
  return [m.erkezes.slice(11), m.kezdes.slice(11), m.tavozas.slice(11), m.varakozasPerc];
};

// a) Indulás foglalt időszakban → a végén indul.
{
  const r = utemterv([F("a", [M("2026-10-20", null, 60)], 60)], K("2026-10-20T05:00"), P([{ tol: "2026-10-20T05:00", ig: "2026-10-20T09:00" }]), napok);
  eq("a) indulás a foglalt végén", m0(r, 0), ["10:00", "10:00", "11:00", 0]);
}
// b) Menet közben foglalt időszak: megáll, kivárja, utána folytatja; nem kamionstop.
{
  const r = utemterv([F("b", [M("2026-10-20", null, 30)], 180)], K("2026-10-20T11:00"), P([{ tol: "2026-10-20T12:00", ig: "2026-10-20T13:00" }]), napok);
  eq("b) érkezés a kivárással", m0(r, 0), ["15:00", "15:00", "15:30", 0]);
  eq("b) nem kamionstop", r.napok[1].kamionstop, null);
  eq("b) vezetés aznap 180", r.napok[1].vezetesPerc, 180);
}
// c) A rakodás nem nyúlhat a foglalt időszakba → utána kezd.
{
  const r = utemterv([F("c", [M("2026-10-20", null, 60)], 30)], K("2026-10-20T12:00"), P([{ tol: "2026-10-20T13:00", ig: "2026-10-20T14:00" }]), napok);
  eq("c) rakodás a foglalt után", m0(r, 0), ["12:30", "14:00", "15:00", 90]);
}
// d) Távollét (egész nap) → a fuvar másnap reggel indul.
{
  const r = utemterv([F("d", [M("2026-10-21", null, 60)], 60)], K("2026-10-20T06:00"), P([tavolletFoglalas("2026-10-21", "06:00")]), napok);
  eq("d) távollét után másnap 06:00", r.fuvarok[0].megallok[0].erkezes, "2026-10-22T07:00");
}
// e) Bejegyzés-megálló (13:00–16:00) a két fuvar között: a következő fuvar utána indul.
{
  const fuv = [
    F("A", [M("2026-10-20", null, 30, "Kisvárda")], 60),
    F("bej:1:2026-10-20", [M("2026-10-20", "13:00", 180, "Nyíregyháza")], 45),
    F("B", [M("2026-10-20", null, 30, "Debrecen")], 60),
  ];
  const r = utemterv(fuv, K("2026-10-20T06:00"), P(), napok);
  eq("e) A kész 07:30", r.fuvarok[0].megallok[0].tavozas, "2026-10-20T07:30");
  eq("e) bejegyzés: odaér 08:15, 13:00–16:00", m0(r, 1), ["08:15", "13:00", "16:00", 285]);
  eq("e) bejegyzés tartalék +285", r.fuvarok[1].legszukebbTartalek, 285);
  eq("e) B a szerviz után: 17:00", r.fuvarok[2].megallok[0].erkezes, "2026-10-20T17:00");
}
// f) Késés a bejegyzéshez: odaérés 13:30 → tartalék −30, a szerviz 3 órája attól számít.
{
  const r = utemterv([F("bej:2:2026-10-20", [M("2026-10-20", "13:00", 180)], 90)], K("2026-10-20T12:00"), P(), napok);
  eq("f) késés −30", r.fuvarok[0].legszukebbTartalek, -30);
  eq("f) 13:30–16:30", m0(r, 0), ["13:30", "13:30", "16:30", 0]);
}
// g) Egész napos bejegyzés foglalása: a nap 00:00-tól a másnapi napkezdésig; időponthoz kötött: tól–ig.
eq("g) egész nap", bejegyzesFoglalas({ tol: null, ig: null, alkalom: "2026-10-22" }, "06:00"), { tol: "2026-10-22T00:00", ig: "2026-10-23T06:00" });
eq("g) idős", bejegyzesFoglalas({ tol: "07:00", ig: "09:00", alkalom: "2026-10-22" }, "06:00"), { tol: "2026-10-22T07:00", ig: "2026-10-22T09:00" });
// h) Egymásba érő foglalt időszakok: mindkettőn át.
{
  const r = utemterv([F("h", [M("2026-10-20", null, 30)], 30)], K("2026-10-20T08:00"),
    P([{ tol: "2026-10-20T08:00", ig: "2026-10-20T10:00" }, { tol: "2026-10-20T09:30", ig: "2026-10-20T11:00" }]), napok);
  eq("h) 11:00-kor indul", r.fuvarok[0].megallok[0].erkezes, "2026-10-20T11:30");
}
// i) Foglalt nélkül változatlan (üres tömb = nincs paraméter).
{
  const f = [F("i", [M("2026-10-20", "10:00", 60)], 120)];
  eq("i) üres foglalt = nincs", JSON.stringify(utemterv(f, K("2026-10-20T06:00"), P([]), napok)), JSON.stringify(utemterv(f, K("2026-10-20T06:00"), P(), napok)));
}

console.log(`teszt-het-foglalt: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
