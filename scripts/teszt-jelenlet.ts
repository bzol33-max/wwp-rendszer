// A Jelenléti/üzenőfal modul számolásainak tesztje.
// Futtatás: npx tsx scripts/teszt-jelenlet.ts
//
// Miért fontos: ezek a függvények döntik el, mennyi egy dolgozó havi
// plusz/mínusz órája, és mikor jön vissza egy ismétlődő feladat. Egy
// elrontott nap csendben hamis egyenleget ad — nincs, ami jelezze.

import {
  honapHetei,
  kovetkezoEsedekesseg,
  marLathato,
  summarizeByDay,
  summarizeByWeek,
  vanNyitottSzakasz,
  type JelenletSession,
} from "@/lib/jelenlet/shared";

let ok = 0,
  bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

let idSzamlalo = 0;
function szakasz(
  work_date: string,
  arrival_time: string | null,
  departure_time: string | null,
  day_type: JelenletSession["day_type"] = "munka"
): JelenletSession {
  return {
    id: String(++idSzamlalo),
    employee_id: "1",
    work_date,
    arrival_time,
    departure_time,
    day_type,
    note: null,
  };
}

// --- Napi eltérés: a 9 órás mércéhez mérve ---

// Szaggatott nap: hazamegy 11:15-kor, visszajön 14:05-re (ez a tipikus eset).
const szaggatott = summarizeByDay([
  szakasz("2026-09-18", "07:02", "11:15"),
  szakasz("2026-09-18", "14:05", "18:10"),
]);
eq("szaggatott nap ledolgozott perce", szaggatott[0].workedMinutes, 253 + 245);
eq("szaggatott nap eltérése (−0:42)", szaggatott[0].diffMinutes, 253 + 245 - 540);
eq("szaggatott nap nem nyitott", szaggatott[0].nyitott, false);

// Pontosan 9 óra: nulla eltérés, nem null.
eq("pontosan 9 óra", summarizeByDay([szakasz("2026-09-17", "07:00", "16:00")])[0].diffMinutes, 0);

// --- Nyitva maradt nap: NEM számíthat bele az egyenlegbe ---

// Korábban a hiányos szakasz csendben kimaradt az összeadásból, és a nap
// úgy jelent meg, mintha ott se lett volna senki (−9:00).
const nyitva = summarizeByDay([szakasz("2026-09-16", "07:10", null)]);
eq("nyitott nap jelölve van", nyitva[0].nyitott, true);
eq("nyitott nap eltérése nincs kiszámolva", nyitva[0].diffMinutes, null);

// Egy lezárt és egy nyitott szakasz ugyanazon a napon: a nap akkor is
// nyitott, mert a második szakasz hossza ismeretlen.
const felig = summarizeByDay([
  szakasz("2026-09-15", "07:00", "11:00"),
  szakasz("2026-09-15", "13:00", null),
]);
eq("félig lezárt nap is nyitott", felig[0].nyitott, true);
eq("félig lezárt nap eltérése nincs", felig[0].diffMinutes, null);

// Érkezés nélküli (csak távozás) sor szintén hiányos.
eq("érkezés nélküli sor hiányos", vanNyitottSzakasz([szakasz("2026-09-14", null, "16:00")]), true);
eq("lezárt szakasz nem hiányos", vanNyitottSzakasz([szakasz("2026-09-14", "07:00", "16:00")]), false);

// --- Távollét: nem munkanap, nem ad eltérést ---
const szabi = summarizeByDay([szakasz("2026-09-16", null, null, "szabadsag")]);
eq("szabadság napja nem ad eltérést", szabi[0].diffMinutes, null);
eq("szabadság napja nem nyitott", szabi[0].nyitott, false);
eq("szabadság napjának típusa", szabi[0].dayType, "szabadsag");

// --- Heti összesítés ---

// 2026. szept. 14-18. egy ISO-hét (38.). Két lezárt nap, egy szabadság, egy
// nyitott nap: a heti összeg CSAK a két lezárt napból áll.
const hetiNapok = summarizeByDay([
  szakasz("2026-09-14", "07:00", "17:10"), // +1:10 = +70
  szakasz("2026-09-15", "07:05", "16:00"), // −0:05 = −5
  szakasz("2026-09-16", null, null, "szabadsag"),
  szakasz("2026-09-17", "06:50", null), // nyitva
]);
const hetek = summarizeByWeek(hetiNapok);
eq("egy hétbe kerültek", hetek.length, 1);
eq("heti eltérés csak a lezárt napokból", hetek[0].diffMinutes, 70 - 5);
eq("heti ledolgozott napok", hetek[0].workedDays, 2);
eq("heti szabadságnapok", hetek[0].szabadsagDays, 1);
eq("heti nyitott napok", hetek[0].nyitottDays, 1);
eq("a hét sorszáma", hetek[0].week.week, 38);

// Két különböző hét nem folyik össze.
const ketHet = summarizeByWeek(
  summarizeByDay([szakasz("2026-09-11", "07:00", "16:00"), szakasz("2026-09-14", "07:00", "16:00")])
);
eq("két külön hét", ketHet.length, 2);

// --- Ismétlődő feladat: mikor jön vissza ---

// A ritmus az ELŐZŐ kiadási dátumhoz igazodik, nem a készre jelentéshez —
// különben a heti feladat minden késéssel arrébb csúszna.
eq("heti: +7 nap", kovetkezoEsedekesseg("2026-09-15", "heti", "2026-09-18"), "2026-09-22");
eq("kétheti: +14 nap", kovetkezoEsedekesseg("2026-09-08", "ketheti", "2026-09-18"), "2026-09-22");
eq("havi: +1 hónap", kovetkezoEsedekesseg("2026-09-15", "havi", "2026-09-18"), "2026-10-15");
eq("egyszeri nem ismétlődik", kovetkezoEsedekesseg("2026-09-15", "egyszeri", "2026-09-18"), null);

// Késve jelentették készre: addig lépteti, amíg a mai nap utánra nem ér.
eq("késve is a jövőbe lép", kovetkezoEsedekesseg("2026-09-01", "heti", "2026-09-18"), "2026-09-22");

// Hónapvégi csúszás: jan. 31. + 1 hónap febr. 28., nem márc. 3.
eq("hónapvég nem fordul át", kovetkezoEsedekesseg("2026-01-31", "havi", "2026-02-01"), "2026-02-28");

// --- Láthatóság: 3 nappal az esedékesség előtt ---
eq("ma esedékes látszik", marLathato("2026-09-20", "2026-09-20"), true);
eq("lejárt feladat látszik", marLathato("2026-09-10", "2026-09-20"), true);
eq("3 nap múlva esedékes látszik", marLathato("2026-09-23", "2026-09-20"), true);
eq("4 nap múlva esedékes még nem", marLathato("2026-09-24", "2026-09-20"), false);

// --- Havi naptár: a megjelenített hetek ---

// 2026. szeptember 1. kedd, 30. vasárnap — a rács az augusztus 31-i hétfőtől
// az október 4-i vasárnapig tart, öt teljes héttel.
const szept = honapHetei(2026, 9);
eq("öt hét szeptemberben", szept.length, 5);
eq("hétfővel kezd", szept[0][0], "2026-08-31");
eq("vasárnappal zár", szept[4][6], "2026-10-04");
eq("minden hét 7 napos", szept.every((h) => h.length === 7), true);
eq("a hónap első napja a helyén", szept[0][1], "2026-09-01");
eq("a hónap utolsó napja a helyén", szept[4][2], "2026-09-30");

// Olyan hónap, ami épp hétfővel kezdődik: nem lóghat be fölösleges hét.
// 2026. június 1. hétfő.
const junius = honapHetei(2026, 6);
eq("hétfővel kezdődő hónap első napja a rács eleje", junius[0][0], "2026-06-01");

// Szökőév februárja (2028): 29 nap, a rács nem veszíthet napot.
const februar = honapHetei(2028, 2);
const osszesNap = februar.flat();
eq("szökőnap benne van", osszesNap.includes("2028-02-29"), true);
eq("márciusba lóg át", osszesNap.includes("2028-03-01"), true);

// Évforduló: december rácsa átlóg a következő évbe.
const december = honapHetei(2026, 12);
eq("december átlóg januárba", december.flat().includes("2027-01-01"), true);

console.log(`\nJelenlét teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
