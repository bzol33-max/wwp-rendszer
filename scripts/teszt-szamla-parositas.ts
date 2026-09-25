// Fuvarszámla ↔ megbízás párosítás tesztje, a 2026-09-25-i valós esetekkel.
// Futtatás: npx tsx scripts/teszt-szamla-parositas.ts
//
//   WLLWR-2026-320 (ÁB Speed)  — rendelésszám = pozíciószám → párosult.
//   WLLWR-2026-313 (ÁJ-TRANS)  — „ÁJ/2026/09/1279” mindkét oldalon, mégsem
//     párosult: a Számlázz.hu az Á-t &#193;-ként küldte, és a rendelésszámot
//     nem dekódoltuk (javítva: szamlazzhu-client.ts).
//   WLLWR-2026-319 (FLOTT-TRANS) — a számlán a Járatszám (260923XX01), a
//     megbízáson pozíciószámként a megbízás sorszáma (2026/01201).
//   Hajdúspedíció — a megbízáson nincs szám: tartalék-kör.

import { kiegAlap, parositKiegSzamlakat, parositSzamlakat, partnerEgyezik, szamKulcs, utvonalEgyezik, type ParositasFuvar, type ParositasSzamla } from "@/lib/fuvarozas/szamla-parositas";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const fuvar = (f: Partial<ParositasFuvar> & { id: string }): ParositasFuvar => ({
  partnerNevek: [], szamok: [], nyersSzoveg: null, fuvardij: null, penznem: "Ft",
  felrakasNap: null, lerakasNap: null, felrako: null, lerako: null, ...f,
});
const szamla = (s: Partial<ParositasSzamla> & { szamlaszam: string }): ParositasSzamla => ({
  vevoNev: "", rendelesszam: null, netto: null, penznem: "HUF", teljesitesNap: null, kiallitasNap: null, tetelekSzoveg: null, ...s,
});

// --- segédfüggvények
eq("szamKulcs ékezet/perjel", szamKulcs("ÁJ/2026/09/1279"), "aj2026091279");
eq("szamKulcs szóközök", szamKulcs("R16 / 2546 / 3003"), szamKulcs("R16/2546/3003"));
eq("partner: ÁB SPEED Kft. ~ ÁB Speed Szállítmányozási Kft.", partnerEgyezik("ÁB SPEED Kft.", ["ÁB Speed Szállítmányozási Kft."]), true);
eq("partner: FLOTT-TRANS KFT ~ Flott-Trans Kft.", partnerEgyezik("FLOTT-TRANS KFT", ["Flott-Trans Kft."]), true);
eq("partner: HAJDÚSPEDICIÓ Kft. ~ Hajdúspedíció Kft.", partnerEgyezik("HAJDÚSPEDICIÓ Kft.", ["Hajdúspedíció Kft."]), true);
eq("partner: ÁJ-TRANS ≠ FLOTT-TRANS", partnerEgyezik("ÁJ-TRANS Kft.", ["Flott-Trans Kft."]), false);
eq("útvonal: Nyírbátor-Budapest", utvonalEgyezik("Közuti Árufuvarozás; Nyírbátor-Budapest", "Unilever Magyarország Kft., 4300, Nyírbátor, Tancsics u. 2-4", "Budapest (BILK) EURÓPA U. 6. 'H' Épület"), true);
eq("útvonal: fordított irány is a városokat nézi", utvonalEgyezik("Közuti Árufuvarozás; Debrecen-Füzesabony", "3390 Füzesabony, Kerecsendi út 123", "4000 Debrecen, Határ út 1."), true);
eq("útvonal: más város nem", utvonalEgyezik("Közuti Árufuvarozás; Nyírbátor-Budapest", "3390 Füzesabony, Kerecsendi út 123", "4000 Debrecen, Határ út 1."), false);

// --- a valós esetek
const fuvarok: ParositasFuvar[] = [
  fuvar({ id: "234", partnerNevek: ["ÁB Speed Szállítmányozási Kft.", "ÁB SPEED Kft."], szamok: ["26/3814"], fuvardij: 300000,
    felrakasNap: "2026-09-23", lerakasNap: "2026-09-24", felrako: "Huncargo Raktár 9400 Sopron,Szappanfőző krt14", lerako: "Coop 4030 Debrecen,Diószegi u . 22 /C" }),
  fuvar({ id: "225", partnerNevek: ["ÁJ-TRANS Kft."], szamok: ["ÁJ/2026/09/1279"], fuvardij: 80000,
    felrakasNap: "2026-09-21", lerakasNap: "2026-09-21", felrako: "3390 Füzesabony Kerecsendi út 123", lerako: "4000 Debrecen" }),
  fuvar({ id: "140", partnerNevek: ["Flott-Trans Kft.", "FLOTT-TRANS KFT"], szamok: ["2026/01201"], fuvardij: 135000,
    nyersSzoveg: "Felrakóhely: Unilever Magyarország Kft., 4300, Nyírbátor, Tancsics u. 2-4 Járatszám: 260923XX01\nMegjegyzés: RAKSZ: 161109809",
    felrakasNap: "2026-09-22", lerakasNap: "2026-09-22", felrako: "Unilever Magyarország Kft., 4300, Nyírbátor, Tancsics u. 2-4", lerako: "Budapest (BILK) EURÓPA U. 6. 'H' Épület" }),
  fuvar({ id: "137", partnerNevek: ["Hajdúspedíció Kft."], szamok: [null], fuvardij: 250000,
    felrakasNap: "2026-09-18", lerakasNap: "2026-09-21", felrako: "4541 Nyírjákó, Fő út 1.", lerako: "9200 Mosonmagyaróvár, Gabonarakpart 5." }),
];
const szamlak: ParositasSzamla[] = [
  szamla({ szamlaszam: "WLLWR-2026-320", vevoNev: "ÁB SPEED Kft.", rendelesszam: "26/3814", netto: 300000, teljesitesNap: "2026-09-24", tetelekSzoveg: "Közuti Árufuvarozás Sopron-Miskolc-Debrecen" }),
  szamla({ szamlaszam: "WLLWR-2026-313", vevoNev: "ÁJ-TRANS Kft.", rendelesszam: "ÁJ/2026/09/1279", netto: 80000, teljesitesNap: "2026-09-22", tetelekSzoveg: "Közuti Árufuvarozás Füzesabony – Debrecen" }),
  szamla({ szamlaszam: "WLLWR-2026-319", vevoNev: "FLOTT-TRANS KFT", rendelesszam: "260923XX01", netto: 135000, teljesitesNap: "2026-09-24", tetelekSzoveg: "Közuti Árufuvarozás Nyírbátor-Budapest" }),
  // Példa (a valós Hajdú-számla összege/tétele itt feltételezett): rendelésszám nélkül.
  szamla({ szamlaszam: "WLLWR-2026-310", vevoNev: "HAJDÚSPEDICIÓ Kft.", rendelesszam: null, netto: 250000, teljesitesNap: "2026-09-22", tetelekSzoveg: "Közuti Árufuvarozás Nyírjákó-Mosonmagyaróvár" }),
  // Raklapos/más vevő számlája — nem szabad semmihez párosítani.
  szamla({ szamlaszam: "WLLWR-2026-311", vevoNev: "LOGO TREK Kft.", rendelesszam: "LT-5521", netto: 135000, teljesitesNap: "2026-09-22", tetelekSzoveg: "Közuti Árufuvarozás Nyírbátor-Budapest" }),
];
const eredmeny = parositSzamlakat(fuvarok, szamlak).map((p) => `${p.fuvarId}=${p.szamlaszam}:${p.mod}`).sort();
eq("valós esetek", eredmeny, [
  "137=WLLWR-2026-310:partner_osszeg_datum_utvonal",
  "140=WLLWR-2026-319:irat_szoveg",
  "225=WLLWR-2026-313:szam",
  "234=WLLWR-2026-320:szam",
]);

// --- kétértelmű tartalék: két azonos fuvar egy számlára → egyiket sem párosítja
const ketto = parositSzamlakat(
  [fuvarok[3], { ...fuvarok[3], id: "999" }],
  [szamlak[3]],
);
eq("kétértelmű tartalék nem párosít", ketto, []);

// --- a tartalékhoz mind a négy kell: más összeg → nincs pár
eq("tartalék: eltérő összeg", parositSzamlakat([fuvarok[3]], [{ ...szamlak[3], netto: 240000 }]), []);
eq("tartalék: eltérő útvonal", parositSzamlakat([fuvarok[3]], [{ ...szamlak[3], tetelekSzoveg: "Közuti Árufuvarozás Nyírjákó-Győr" }]), []);
eq("tartalék: régi dátum", parositSzamlakat([fuvarok[3]], [{ ...szamlak[3], teljesitesNap: "2026-08-01" }]), []);
eq("tartalék: már használt számla nem", parositSzamlakat([fuvarok[3]], [{ ...szamlak[3], hasznalt: true }]), []);

// --- útvonal nélküli számla (WLLWR-2026-315, valós): partner + összeg + dátum elég
const hajdu = fuvar({ id: "137", partnerNevek: ["Hajdúspedíció Kft."], szamok: [null], fuvardij: 245000,
  felrakasNap: "2026-09-18", lerakasNap: "2026-09-21", felrako: "1. Nyírjákó (Baromfi-Coop Kft.)", lerako: "1. Mosonmagyaróvár" });
const sz315 = szamla({ szamlaszam: "WLLWR-2026-315", vevoNev: "HAJDÚSPEDICIÓ Kft.", rendelesszam: null, netto: 245000, teljesitesNap: "2026-09-22", tetelekSzoveg: "Közúti árufuvarozás" });
eq("útvonal nélküli számla: párosul", parositSzamlakat([hajdu], [sz315]), [{ fuvarId: "137", szamlaszam: "WLLWR-2026-315", mod: "partner_osszeg_datum" }]);
eq("útvonal nélkül, de más összeg: nem", parositSzamlakat([hajdu], [{ ...sz315, netto: 240000 }]), []);
eq("útvonal nélkül, két azonos fuvar: nem", parositSzamlakat([hajdu, { ...hajdu, id: "998" }], [sz315]), []);
eq("van útvonal, de más: nem", parositSzamlakat([hajdu], [{ ...sz315, tetelekSzoveg: "Közúti árufuvarozás Nyírjákó-Győr" }]), []);

// --- irat-szöveg más partnernél nem számít
eq("irat-szöveg: más vevő", parositSzamlakat([fuvarok[2]], [{ ...szamlak[2], vevoNev: "LOGO TREK Kft." }]).length, 0);

// --- kiegészítő számla: WLLWR-2026-316 (Ghibli, „N26/22824 kieg.”, +250 € kiállási díj),
//     a fuvar a #135, fő számlája a WLLWR-2026-310.
eq("kiegAlap: kieg.", kiegAlap("N26/22824 kieg."), "N26/22824");
eq("kiegAlap: kiegészítő elöl", kiegAlap("kiegészítő 2026/01201"), "2026/01201");
eq("kiegAlap: pótdíj", kiegAlap("26/3814 pótdíj"), "26/3814");
eq("kiegAlap: sima szám", kiegAlap("N26/22824"), null);
eq("kiegAlap: üres", kiegAlap(null), null);
eq("kiegAlap: csak a szó", kiegAlap("kieg."), null);
const ghibli = { id: "135", partnerNevek: ["Ghibli Szállítmányozás"], szamok: ["N26/22824", null] };
const masik = { id: "134", partnerNevek: ["Ghibli Szállítmányozás"], szamok: ["N26/22795", null] };
const kiegSzamla = { szamlaszam: "WLLWR-2026-316", vevoNev: "GHIBLI KFT.", rendelesszam: "N26/22824 kieg." };
eq("kieg: a #135-höz", parositKiegSzamlakat([masik, ghibli], [kiegSzamla]), [{ fuvarId: "135", szamlaszam: "WLLWR-2026-316" }]);
eq("kieg: más vevő nem", parositKiegSzamlakat([ghibli], [{ ...kiegSzamla, vevoNev: "ÁB SPEED Kft." }]).length, 0);
eq("kieg: nem kieg. számla nem", parositKiegSzamlakat([ghibli], [{ ...kiegSzamla, rendelesszam: "N26/22824" }]).length, 0);
eq("kieg: két fuvaron ugyanaz a szám → nem egyértelmű", parositKiegSzamlakat([ghibli, { ...ghibli, id: "999" }], [kiegSzamla]).length, 0);
// A „kieg.” számla a fő párosításba nem kerül be (a hívó kiszűri) — de ha be is kerülne, a szám-kör nem venné:
eq("kieg: szám-kör kulcsa eltér", szamKulcs("N26/22824 kieg.") === szamKulcs("N26/22824"), false);

console.log(`\nSzámla-párosítás teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
