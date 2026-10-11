// Eredmény oldal tiszta számolása (lib/fuvarozas2/eredmeny-alap.ts).
// Futtatás: npx tsx scripts/teszt-eredmeny.ts

import { ezerFt, ingyenesMegbizok, napKulonbseg, negyHonap, partnerOsszesites, vizeses, vizesesOsszeg, type PartnerBemenet } from "@/lib/fuvarozas2/eredmeny-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// 1. Vízesés: a tervbeli Gergő-okt. számok (nem hozzárendelt nélkül).
{
  const v = vizeses({
    berBevetelFt: 1005000, eredmenyFt: 215516, nemHozzarendeltFt: 0,
    megbizasok: [
      { jelleg: "ber", uzemanyag: { ft: 180318 }, utdij: { ft: 200000 }, napiFix: { ft: 70000 } },
      { jelleg: "ber", uzemanyag: { ft: 100000 }, utdij: { ft: 166246 }, napiFix: { ft: 72920 } },
      { jelleg: "sajat", uzemanyag: { ft: 99999 }, utdij: { ft: 99999 }, napiFix: { ft: 99999 } },
    ],
  });
  eq("vízesés tételek", [v.bevetel, v.uzemanyag, v.utdij, v.napiFix, v.uresAllas, v.egyeb, v.fedezet], [1005000, 280318, 366246, 142920, 0, 0, 215516]);
}
// 2. Nem hozzárendelt + kézi egyéb maradékként, a vízesés mindig kijön.
{
  const v = vizeses({ berBevetelFt: 500000, eredmenyFt: 100000, nemHozzarendeltFt: 50000, megbizasok: [{ jelleg: "ber", uzemanyag: null, utdij: { ft: 200000 }, napiFix: { ft: 100000 } }] });
  eq("egyéb = maradék", [v.uresAllas, v.egyeb], [50000, 50000]);
  eq("összeg kijön", v.bevetel - v.uzemanyag - v.utdij - v.napiFix - v.uresAllas - v.egyeb, v.fedezet);
  const o = vizesesOsszeg(v, v);
  eq("összevonás", [o.bevetel, o.fedezet, o.egyeb], [1000000, 200000, 100000]);
}
// 3. Csak saját fuvar → nincs bér-költség.
{
  const v = vizeses({ berBevetelFt: 0, eredmenyFt: -30000, nemHozzarendeltFt: 30000, megbizasok: [{ jelleg: "sajat", uzemanyag: { ft: 1 }, utdij: null, napiFix: { ft: 1 } }] });
  eq("saját nem számít", [v.uzemanyag, v.napiFix, v.uresAllas, v.egyeb, v.fedezet], [0, 0, 30000, 0, -30000]);
}
// 4. Partnerek.
{
  const m: PartnerBemenet[] = [];
  for (let i = 0; i < 15; i++) m.push({ partner: "HAPP", jelleg: "ber", nap: `2026-08-${String(10 + i).padStart(2, "0")}`, bevetelFt: 250000, eredmenyFt: i === 0 ? 14000 : 0 });
  for (let i = 0; i < 6; i++) m.push({ partner: "ÁB SPEED", jelleg: "ber", nap: `2026-10-0${i + 1}`, bevetelFt: 170000, eredmenyFt: -20000 });
  m.push({ partner: "Ghibli", jelleg: "ber", nap: "2026-09-18", bevetelFt: 218000, eredmenyFt: 135000 });
  m.push({ partner: "Ghibli", jelleg: "ber", nap: "2026-09-10", bevetelFt: 218000, eredmenyFt: 135000 });
  m.push({ partner: null, jelleg: "ber", nap: "2026-09-01", bevetelFt: null, eredmenyFt: null });
  m.push({ partner: "Well-Worn Pallet", jelleg: "sajat", nap: "2026-10-02", bevetelFt: null, eredmenyFt: null });
  const p = partnerOsszesites(m, "2026-10-11");
  eq("sorrend fedezet szerint", p.map((x) => x.partner), ["Ghibli", "HAPP", "Ismeretlen megbízó", "ÁB SPEED"]);
  eq("Ghibli", [p[0].db, p[0].bevetelFt, p[0].fedezetFt, p[0].utolso], [2, 436000, 270000, "2026-09-18"]);
  eq("HAPP elmaradt", [p[1].db, p[1].elmaradt, p[1].utolso], [15, true, "2026-08-24"]);
  eq("ÁB SPEED nem elmaradt", p[3].elmaradt, false);
  eq("saját kimarad", p.some((x) => x.partner === "Well-Worn Pallet"), false);
  const ing = ingyenesMegbizok(p);
  eq("legrosszabb", ing.legrosszabb?.partner, "ÁB SPEED");
  eq("nullszaldó", ing.nullszaldo.map((x) => x.partner), ["HAPP"]);
  eq("nincs negatív → senki", ingyenesMegbizok(p.filter((x) => x.partner !== "ÁB SPEED")).legrosszabb, null);
}
// 4b. Átváltatlan EUR-bevétel: külön összegezve, és nem ad hamis „ingyen” riasztást.
{
  const m: PartnerBemenet[] = [];
  for (let i = 0; i < 4; i++) m.push({ partner: "EUR Kft", jelleg: "ber", nap: `2026-10-0${i + 1}`, bevetelFt: null, eredmenyFt: null, bevetelEur: 900 });
  m.push({ partner: "EUR Kft", jelleg: "ber", nap: "2026-10-08", bevetelFt: 350000, eredmenyFt: -5000, bevetelEur: 900 });
  for (let i = 0; i < 3; i++) m.push({ partner: "Veszteseg Bt", jelleg: "ber", nap: `2026-10-0${i + 1}`, bevetelFt: 100000, eredmenyFt: -10000 });
  const p = partnerOsszesites(m, "2026-10-11");
  const eur = p.find((x) => x.partner === "EUR Kft")!;
  eq("átváltatlan EUR összeg", [eur.db, eur.bevetelFt, eur.fedezetFt, eur.atvaltatlanEur, eur.atvaltatlanDb], [5, 350000, -5000, 3600, 4]);
  const ing = ingyenesMegbizok(p);
  eq("átváltatlan EUR-os megbízó nem „ingyenes”", ing.legrosszabb?.partner, "Veszteseg Bt");
  eq("átváltatlan EUR-os nem nullszaldó", ing.nullszaldo.some((x) => x.partner === "EUR Kft"), false);
  eq("Ft-os megbízónál 0 átváltatlan", [p.find((x) => x.partner === "Veszteseg Bt")!.atvaltatlanEur], [0]);
}
// 5. Formázás és dátumok.
eq("ezerFt", [ezerFt(215516), ezerFt(-122400), ezerFt(0), ezerFt(1240000, false), ezerFt(-4490000)], ["+216 e", "−122 e", "0 e", "1,24 M", "−4,49 M"]);
eq("napKulonbseg", napKulonbseg("2026-09-02", "2026-10-11"), 39);
eq("négy hónap", negyHonap("2026-10-11").map((h) => [h.kezdet, h.veg, h.cimke]), [
  ["2026-07-01", "2026-07-31", "július"], ["2026-08-01", "2026-08-31", "augusztus"], ["2026-09-01", "2026-09-30", "szeptember"], ["2026-10-01", "2026-10-31", "okt. 1–11."],
]);
eq("négy hónap évváltás", negyHonap("2026-02-03").map((h) => h.kezdet), ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);

console.log(`teszt-eredmeny: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
