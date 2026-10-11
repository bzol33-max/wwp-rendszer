// Az élő ETA-lánc szabályai (szünet, napi keret, kapunyitás, tanult rakodás).
// Futtatás: npx tsx scripts/teszt-eta-lanc.ts

import { etaPontossagStat, megalloTavozas, rakodasMedian, soforAllapotSzakaszokbol, tanultRakodas, vezetSzaballyal, type SoforAllapot } from "@/lib/fuvarozas/eta-lanc";
import type { IdovonalSzakasz } from "@/lib/fuvarozas/idovonal";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const t = (s: string) => new Date(s);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

// 1. Rövid út: nincs szünet.
{
  const a: SoforAllapot = { folyamatosPerc: 0, napiPerc: 0 };
  const r = vezetSzaballyal(t("2026-10-12T05:00:00Z"), 90, a);
  eq("90 perc, szünet nélkül", [hhmm(r.erkezes), r.szunetDb, r.pihenoDb], ["06:30", 0, 0]);
  eq("állapot nő", a, { folyamatosPerc: 90, napiPerc: 90 });
}
// 2. Micó: 07:20-tól 6 óra menet → 4,5 óra után 45 perc szünet: 14:05 (szünet nélkül 13:20 lett volna).
{
  const a: SoforAllapot = { folyamatosPerc: 0, napiPerc: 0 };
  const r = vezetSzaballyal(t("2026-10-12T05:20:00Z"), 360, a);
  eq("6 óra: 1 szünet", [hhmm(r.erkezes), r.szunetDb], ["12:05", 1]);
  eq("szünet után 90 perc folyamatos", a, { folyamatosPerc: 90, napiPerc: 360 });
}
// 3. Már 4 órát vezetett: 60 perces útnál 30 perc után szünet.
{
  const a: SoforAllapot = { folyamatosPerc: 240, napiPerc: 240 };
  const r = vezetSzaballyal(t("2026-10-12T10:00:00Z"), 60, a);
  eq("közbeeső szünet", [hhmm(r.erkezes), r.szunetDb], ["11:45", 1]);
}
// 4. Napi keret: 8 óra után 3 óra út → 1 óra, 11 óra pihenő, 2 óra.
{
  const a: SoforAllapot = { folyamatosPerc: 0, napiPerc: 480 };
  const r = vezetSzaballyal(t("2026-10-12T14:00:00Z"), 180, a);
  eq("napi pihenő beszúrva", [r.erkezes.toISOString().slice(0, 16), r.pihenoDb], ["2026-10-13T04:00", 1]);
  eq("új napon 120 perc", a, { folyamatosPerc: 120, napiPerc: 120 });
}
// 5. Pontosan a határon nincs fölösleges szünet.
{
  const a: SoforAllapot = { folyamatosPerc: 200, napiPerc: 200 };
  const r = vezetSzaballyal(t("2026-10-12T08:00:00Z"), 70, a);
  eq("4,5 óra pont: nincs szünet", [hhmm(r.erkezes), r.szunetDb], ["09:10", 0]);
}
// 6. Nulla / negatív menetidő.
{
  const a: SoforAllapot = { folyamatosPerc: 10, napiPerc: 10 };
  eq("0 perc", hhmm(vezetSzaballyal(t("2026-10-12T08:00:00Z"), 0, a).erkezes), "08:00");
  eq("negatív = 0", hhmm(vezetSzaballyal(t("2026-10-12T08:00:00Z"), -5, a).erkezes), "08:00");
}

// Megálló: kapunyitás előtt vár.
{
  const a: SoforAllapot = { folyamatosPerc: 200, napiPerc: 300 };
  const r = megalloTavozas(t("2026-10-12T05:10:00Z"), t("2026-10-12T06:00:00Z"), 40, a);
  eq("várakozás ablakig + rakodás", [hhmm(r.kezdes), hhmm(r.tavozas), r.varakozasPerc], ["06:00", "06:40", 50]);
  eq("≥45 perc várakozás szünet", a.folyamatosPerc, 0);
}
{
  const a: SoforAllapot = { folyamatosPerc: 200, napiPerc: 300 };
  const r = megalloTavozas(t("2026-10-12T05:40:00Z"), t("2026-10-12T06:00:00Z"), 40, a);
  eq("20 perc várakozás nem szünet", [r.varakozasPerc, a.folyamatosPerc], [20, 200]);
}
{
  const a: SoforAllapot = { folyamatosPerc: 100, napiPerc: 100 };
  const r = megalloTavozas(t("2026-10-12T08:00:00Z"), t("2026-10-12T00:00:00Z"), 30, a);
  eq("nyitott ablak (nap eleje): nincs várás", [hhmm(r.kezdes), hhmm(r.tavozas), r.varakozasPerc], ["08:00", "08:30", 0]);
  eq("ablak nélkül", hhmm(megalloTavozas(t("2026-10-12T08:00:00Z"), null, 30, a).tavozas), "08:30");
}
{
  const a: SoforAllapot = { folyamatosPerc: 100, napiPerc: 500 };
  megalloTavozas(t("2026-10-12T16:00:00Z"), t("2026-10-13T05:00:00Z"), 30, a);
  eq("éjszakányi várakozás = napi pihenő", a, { folyamatosPerc: 0, napiPerc: 0 });
}

// Sofőr-állapot a GPS-szakaszokból.
{
  const v = (perc: number) => ({ tipus: "vezetes", idotartamSec: perc * 60 }) as unknown as IdovonalSzakasz;
  const al = (perc: number) => ({ tipus: "allas", idotartamSec: perc * 60 }) as unknown as IdovonalSzakasz;
  eq("üres nap", soforAllapotSzakaszokbol([]), { folyamatosPerc: 0, napiPerc: 0 });
  eq("szünet nullázza a folyamatosat", soforAllapotSzakaszokbol([v(120), al(50), v(60), al(10), v(30)]), { folyamatosPerc: 90, napiPerc: 210 });
  eq("most is áll ≥45 perce", soforAllapotSzakaszokbol([v(95), al(59)]), { folyamatosPerc: 0, napiPerc: 95 });
}

// Tanult rakodás: leghosszabb egyező hely nyer, legalább 3 minta.
{
  const tanult = [
    { hely: "Debrecen", perc: 40, minta: 6 },
    { hely: "BMW HU Plant Debrecen", perc: 95, minta: 4 },
    { hely: "Nádudvar", perc: 25, minta: 3 },
    { hely: "Tata", perc: 70, minta: 2 },
  ];
  eq("BMW a Debrecen helyett", tanultRakodas("Debrecen", "BMW HU Plant Debrecen, BMW Körút 1", tanult), 95);
  eq("csak város", tanultRakodas("Debrecen", "4031 Debrecen, Határ út 1", tanult), 40);
  eq("ékezet-független", tanultRakodas("Nadudvar", null, tanult), 25);
  eq("kevés minta: null", tanultRakodas("Tata", "Tata", tanult), null);
  eq("nincs egyezés", tanultRakodas("Tompaládony", "Tompaládony, Fő u.", tanult), null);
  eq("részszó nem egyezik", tanultRakodas("Tatabánya", "Tatabánya", tanult), null);
}
eq("medián páratlan", rakodasMedian([30, 90, 40]), { perc: 40, minta: 3 });
eq("medián páros", rakodasMedian([30, 40, 50, 60]), { perc: 45, minta: 4 });
eq("éjszakázás kiszűrve", rakodasMedian([30, 40, 50, 800]), { perc: 40, minta: 3 });

// Pontosság-statisztika.
{
  eq("kevés minta: nincs sáv", etaPontossagStat([{ horizontPerc: 10, hibaPerc: 5 }]), []);
  const m = [-10, -4, 0, 3, 6, 8, 12, 20, 25, 40].map((h) => ({ horizontPerc: 60, hibaPerc: h }));
  eq("30–90 perc sáv", etaPontossagStat(m), [{ sav: "30–90 perccel előtte", minta: 10, p50: 10, p80: 25, eltolodas: 8 }]);
  const vegyes = [...m, ...[1, 2, 3, 4, 5].map((h) => ({ horizontPerc: 15, hibaPerc: -h }))];
  eq("két sáv, sorrendben", etaPontossagStat(vegyes).map((x) => [x.sav, x.minta, x.eltolodas]), [["30 percen belül", 5, -3], ["30–90 perccel előtte", 10, 8]]);
}

console.log(`eta-lánc: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
