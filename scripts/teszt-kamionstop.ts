// Kamionstop (190/2008. Korm. r. 2. §): tilalmi ablakok és átugrás (lib/fuvarozas2/kamionstop.ts).
// Futtatás: npx tsx scripts/teszt-kamionstop.ts

import { helyi, napEltol, tilalmiAblakok, tilalmonAtugrik, valos } from "@/lib/fuvarozas2/kamionstop";
import { munkaszunetiNap, torvenyesUnnep, torvenyesUnnepE } from "@/lib/jelenlet/shared";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const H = "hétvégi kamionstop";
const NY = "nyári hétvégi kamionstop (szombat 15:00-tól)";
const A = (tol: string, ig: string, okSz: string) => ({ tol, ig, ok: okSz });

// Törvényes ünnep vs. áthelyezett pihenőnap
eq("dec. 24. 2026: munkaszüneti (áthelyezett)", munkaszunetiNap("2026-12-24") !== null, true);
eq("dec. 24. 2026: nem törvényes ünnep", torvenyesUnnepE("2026-12-24"), false);
eq("dec. 25.: törvényes ünnep", torvenyesUnnep("2026-12-25"), "Karácsony");
eq("nagypéntek 2026: törvényes", torvenyesUnnepE("2026-04-03"), true);

// Sima októberi hétvége (téli időszak, b) pont)
eq("okt. 10–11.: szombat 22 – vasárnap 22", tilalmiAblakok("2026-10-05", "2026-10-11"), [A("2026-10-10T22:00", "2026-10-11T22:00", H)]);
eq("hétköznapokon nincs ablak", tilalmiAblakok("2026-10-12", "2026-10-16"), []);

// Okt. 23. péntek, téli időszak: a (2) nem él (nem vasárnap előtti nap) → két ablak, szombat napközben szabad.
eq("okt. 23. (péntek) + hétvége", tilalmiAblakok("2026-10-19", "2026-10-25"), [
  A("2026-10-22T22:00", "2026-10-23T22:00", "Nemzeti ünnep (okt. 23.)"),
  A("2026-10-24T22:00", "2026-10-25T22:00", H),
]);
eq("okt. 24. szombat 10:00 indulás: szabad", tilalmonAtugrik("2026-10-24T10:00", 300), { erkezes: "2026-10-24T15:00", varakozasPerc: 0, ablak: null });

// Nyári szombat (a) aa) pont): szombat 15:00-tól
eq("júl. 4–5.: szombat 15 – vasárnap 22", tilalmiAblakok("2026-06-29", "2026-07-05"), [A("2026-07-04T15:00", "2026-07-05T22:00", NY)]);
eq("nyári szombat: 14:00-tól 2 óra → 15:00 megáll, vasárnap 23:00", tilalmonAtugrik("2026-07-04T14:00", 120), {
  erkezes: "2026-07-05T23:00", varakozasPerc: 31 * 60, ablak: A("2026-07-04T15:00", "2026-07-05T22:00", NY),
});
// Június 30. még téli: jún. 27. szombat 22:00-tól
eq("jún. 27–28. (téli időszak)", tilalmiAblakok("2026-06-27", "2026-06-28"), [A("2026-06-27T22:00", "2026-06-28T22:00", H)]);
// Nyári ledolgozós szombat (2026-08-08): nincs 15:00-ás kezdés, óvatosan szombat 22-től
eq("aug. 8. ledolgozós szombat", tilalmiAblakok("2026-08-08", "2026-08-09"), [A("2026-08-08T22:00", "2026-08-09T22:00", H)]);

// Aug. 20. csütörtök + aug. 21. áthelyezett pihenőnap: a pihenőnap NEM tilalom
eq("aug. 20. 2026 + hétvége", tilalmiAblakok("2026-08-17", "2026-08-23"), [
  A("2026-08-19T22:00", "2026-08-20T22:00", "Államalapítás ünnepe (aug. 20.)"),
  A("2026-08-22T15:00", "2026-08-23T22:00", NY),
]);
eq("aug. 21. (áthelyezett pihenőnap) napközben szabad", tilalmonAtugrik("2026-08-21T06:00", 480), { erkezes: "2026-08-21T14:00", varakozasPerc: 0, ablak: null });
eq("jan. 2. 2026 (áthelyezett pihenőnap) szabad", tilalmonAtugrik("2026-01-02T08:00", 600), { erkezes: "2026-01-02T18:00", varakozasPerc: 0, ablak: null });

// 2. § (2): nyári pénteki ünnep → folyamatos csütörtök 22:00 – vasárnap 22:00
eq("aug. 20. 2027 (péntek): folyamatos", tilalmiAblakok("2027-08-19", "2027-08-22"), [
  A("2027-08-19T22:00", "2027-08-22T22:00", `Államalapítás ünnepe (aug. 20.) + ${NY}`),
]);
eq("aug. 20. 2022 (szombat): folyamatos", tilalmiAblakok("2022-08-19", "2022-08-21"), [
  A("2022-08-19T22:00", "2022-08-21T22:00", `Államalapítás ünnepe (aug. 20.) + ${NY}`),
]);

// Karácsony 2026: péntek–szombat ünnep + vasárnap → egy ablak; dec. 24. napközben szabad
eq("karácsony 2026", tilalmiAblakok("2026-12-21", "2026-12-27"), [
  A("2026-12-24T22:00", "2026-12-27T22:00", `Karácsony (dec. 25.) + Karácsony (dec. 26.) + ${H}`),
]);
eq("túlnyúló ablak teljes hosszban", tilalmiAblakok("2026-12-27", "2026-12-27")[0].tol, "2026-12-24T22:00");
eq("dec. 24. reggel 8 óra vezetés: 16:00", tilalmonAtugrik("2026-12-24T08:00", 480).varakozasPerc, 0);
eq("dec. 24. 20:00, 4 óra → dec. 28. 00:00", tilalmonAtugrik("2026-12-24T20:00", 240), {
  erkezes: "2026-12-28T00:00", varakozasPerc: 3 * 24 * 60, ablak: A("2026-12-24T22:00", "2026-12-27T22:00", `Karácsony (dec. 25.) + Karácsony (dec. 26.) + ${H}`),
});

// Húsvét 2026 (ápr. 5.): nagypéntek külön, szombat napközben szabad, vasárnap+hétfő együtt
eq("húsvét 2026", tilalmiAblakok("2026-04-01", "2026-04-07"), [
  A("2026-04-02T22:00", "2026-04-03T22:00", "Nagypéntek (ápr. 3.)"),
  A("2026-04-04T22:00", "2026-04-06T22:00", `${H} + Húsvéthétfő (ápr. 6.)`),
]);
eq("pünkösd 2026", tilalmiAblakok("2026-05-23", "2026-05-25"), [A("2026-05-23T22:00", "2026-05-25T22:00", `${H} + Pünkösdhétfő (máj. 25.)`)]);

// Átugrás
const okt = A("2026-10-10T22:00", "2026-10-11T22:00", H);
eq("indulás ablakon belül: vár a végéig", tilalmonAtugrik("2026-10-11T10:00", 120), { erkezes: "2026-10-12T00:00", varakozasPerc: 720, ablak: okt });
eq("vezetés átlépi a kezdetet", tilalmonAtugrik("2026-10-10T20:00", 180), { erkezes: "2026-10-11T23:00", varakozasPerc: 1440, ablak: okt });
eq("pont a kezdetre ér: nem vár", tilalmonAtugrik("2026-10-10T20:00", 120), { erkezes: "2026-10-10T22:00", varakozasPerc: 0, ablak: null });
eq("pont az ablak végén indul", tilalmonAtugrik("2026-10-11T22:00", 60), { erkezes: "2026-10-11T23:00", varakozasPerc: 0, ablak: null });
eq("0 perc vezetés: azonnal", tilalmonAtugrik("2026-10-11T10:00", 0), { erkezes: "2026-10-11T10:00", varakozasPerc: 0, ablak: null });

// Óraátállítás (okt. 25. 2026, 03:00 → 02:00): az ablak falióra szerint ugyanaz, valós hossza 25 óra
eq("okt. 24–25. ablak (DST)", tilalmiAblakok("2026-10-24", "2026-10-25"), [A("2026-10-24T22:00", "2026-10-25T22:00", H)]);
eq("DST hétvége: 1500 perc várakozás", tilalmonAtugrik("2026-10-24T21:00", 120), {
  erkezes: "2026-10-25T23:00", varakozasPerc: 1500, ablak: A("2026-10-24T22:00", "2026-10-25T22:00", H),
});
eq("márc. 29. 2026 (nyári időre át): 1380 perc", tilalmonAtugrik("2026-03-28T21:00", 120).varakozasPerc, 1380);
// Két ablakon át (okt. 23. és a DST-hétvége)
eq("hosszú vezetés két ablakon át", tilalmonAtugrik("2026-10-22T20:00", 3000), {
  erkezes: "2026-10-26T22:00", varakozasPerc: 1440 + 1500, ablak: A("2026-10-22T22:00", "2026-10-23T22:00", "Nemzeti ünnep (okt. 23.)"),
});

// valos/helyi oda-vissza a két óraátállítási napon (QA: helyi() UTC 00:00–01:00 márc. utolsó vasárnapján hibázott)
eq("márc. 29. 01:30 oda-vissza", helyi(valos("2026-03-29T01:30")), "2026-03-29T01:30");
const utc = (s: string) => Date.parse(`${s}:00Z`) / 60000;
eq("márc. 29. 00:59 UTC = 01:59 helyi", helyi(utc("2026-03-29T00:59")), "2026-03-29T01:59");
eq("márc. 29. 01:00 UTC = 03:00 helyi", helyi(utc("2026-03-29T01:00")), "2026-03-29T03:00");
eq("okt. 25. 00:59 UTC = 02:59 helyi (nyári)", helyi(utc("2026-10-25T00:59")), "2026-10-25T02:59");
eq("okt. 25. 01:00 UTC = 02:00 helyi (téli)", helyi(utc("2026-10-25T01:00")), "2026-10-25T02:00");
for (const nap of ["2026-03-29", "2026-10-25"]) {
  const rossz: string[] = [];
  for (let n = napEltol(nap, -1); n <= napEltol(nap, 1); n = napEltol(n, 1)) {
    for (let p = 0; p < 1440; p += 15) {
      const s = `${n}T${String(Math.floor(p / 60)).padStart(2, "0")}:${String(p % 60).padStart(2, "0")}`;
      if (n === "2026-03-29" && s.slice(11, 13) === "02") continue; // nem létező helyi óra
      if (helyi(valos(s)) !== s) rossz.push(s);
    }
  }
  eq(`${nap} ±1 nap: minden negyedóra oda-vissza`, rossz, []);
}
// Valós percenként végig a két napon: a helyi idő monoton (a tavaszi napon sosem lép vissza).
{
  const t0 = utc("2026-03-28T22:00");
  let elozo = helyi(t0), monoton = true;
  for (let v = t0 + 1; v < t0 + 1440; v++) { const h = helyi(v); if (h <= elozo) monoton = false; elozo = h; }
  eq("márc. 29.: a helyi idő valós percenként szigorúan nő", monoton, true);
}

console.log(`teszt-kamionstop: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
