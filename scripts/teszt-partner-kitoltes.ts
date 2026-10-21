// Partner-törzs automatikus kitöltése (lib/fuvarozas2/partner-kitoltes-alap.ts).
// Futtatás: npx tsx scripts/teszt-partner-kitoltes.ts

import { cimSzep } from "@/lib/fuvarozas2/cim-formazas";
import { kitoltesTerv, emailLista, fizetesiNapSzamlakbol, hianyzoMezok, partnerSzamlai, type KitoltesPartner, type KitoltesSzamla } from "@/lib/fuvarozas2/partner-kitoltes-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const ures: KitoltesPartner = {
  id: "1", nev: "HAPP Kft.", nevvaltozatok: ['"HAPP" Kft.'], adoszam: null, szamlazasi_cim: null, postazasi_cim: null,
  szamlazasi_email: null, fizetesi_hatarido_nap: null, papir_bekuldesi_hatarido_nap: null, posta_nem_kell: false, szamla_email_nem_kell: false,
};
const xml = (adoszam: string, email: string, telepules = "Márkó", cim = "Iparos utca 10.", irsz = "8441") =>
  `<szamla><vevo><nev>"HAPP" Kft.</nev><cim><orszag>HU</orszag><irsz>${irsz}</irsz><telepules>${telepules}</telepules><cim>${cim}</cim></cim><email>${email}</email><adoszam>${adoszam}</adoszam></vevo></szamla>`;
const sz = (n: string, kelt: string, hat: string, x: string, vevo = '"HAPP" Kft.'): KitoltesSzamla =>
  ({ szamlaszam: n, vevo_nev: vevo, kiallitas_datum: kelt, fizetesi_hatarido: hat, raw_xml: x });

const happSzamlak = [
  sz("WLLWR-2026-281", "2026-09-01", "2026-10-31", xml("12497883-2-19", "finance@happ.eu, burkus.arpad@happ.eu")),
  sz("WLLWR-2026-250", "2026-08-01", "2026-09-29", xml("12497883-2-19", "finance@happ.eu")),
  sz("WLLWR-2026-100", "2026-03-01", "2026-03-31", xml("12497883-2-19", "finance@happ.eu")),
];
const happJav = [
  { mezo: "postazasi_cim", ertek: "H-8441 Márkó, Iparos utca 10.", forras: "megbizas_pdf", forras_leiras: "Fuvarmegbízás_0000132894.pdf" },
  { mezo: "postazasi_cim", ertek: "8441 Márkó, Iparos utca 10.", forras: "szamla", forras_leiras: "WLLWR-2026-281" },
  { mezo: "papir_bekuldesi_hatarido_nap", ertek: "3", forras: "megbizas_pdf", forras_leiras: "Fuvarmegbízás_0000132894.pdf" },
  { mezo: "fizetesi_hatarido_nap", ertek: "60", forras: "megbizas_pdf", forras_leiras: "Fuvarmegbízás_0000132894.pdf" },
];

const terv = kitoltesTerv(ures, happSzamlak, happJav);
eq("HAPP: minden hiányzó mező kitöltve", terv.map((k) => [k.mezo, k.ertek, k.forras]), [
  ["adoszam", "12497883-2-19", "szamla"],
  ["szamlazasi_cim", "8441 Márkó, Iparos utca 10.", "szamla"],
  ["postazasi_cim", "8441 Márkó, Iparos utca 10.", "megbizas_pdf"],
  ["szamlazasi_email", "finance@happ.eu, burkus.arpad@happ.eu", "szamla"],
  ["fizetesi_hatarido_nap", 60, "megbizas_pdf"],
  ["papir_bekuldesi_hatarido_nap", 3, "megbizas_pdf"],
]);

eq("meglévő adatot nem ír felül", kitoltesTerv({ ...ures, szamlazasi_email: "x@y.hu", fizetesi_hatarido_nap: 30 }, happSzamlak, happJav).map((k) => k.mezo),
  ["adoszam", "szamlazasi_cim", "postazasi_cim", "papir_bekuldesi_hatarido_nap"]);
eq("nem kér postát → nincs postacím", kitoltesTerv({ ...ures, posta_nem_kell: true }, happSzamlak, []).some((k) => k.mezo === "postazasi_cim"), false);
eq("saját cégünk → semmi", kitoltesTerv({ ...ures, nev: "Well-Worn Pallet Kft.", nevvaltozatok: [] }, happSzamlak, happJav), []);

// Két különböző PDF-postacím → a számla vevőcíme (vagy semmi), nem találgat.
eq("ellentmondó PDF-címek → számla", kitoltesTerv(ures, happSzamlak, [
  { mezo: "postazasi_cim", ertek: "9662 Tompaládony, Ifjúság u.20.", forras: "megbizas_pdf", forras_leiras: "a.pdf" },
  { mezo: "postazasi_cim", ertek: "9625 Gór, Széchenyi utca 58.", forras: "megbizas_pdf", forras_leiras: "b.pdf" },
]).find((k) => k.mezo === "postazasi_cim"), { mezo: "postazasi_cim", ertek: "8441 Márkó, Iparos utca 10.", forras: "szamla", leiras: "WLLWR-2026-281" });

// Két különböző adószámú „hasonló nevű” cég számlái → a számlákból semmi.
eq("két adószám → számlából semmi", kitoltesTerv(ures, [...happSzamlak, sz("X-1", "2026-09-10", "2026-10-10", xml("99999999-2-01", "masik@ceg.hu"), "HAPP Kft.")], []), []);

// Ha a partnernek már van adószáma, csak az ő adószámú számlái számítanak.
eq("adószámmal szűr", partnerSzamlai({ nev: "HAPP Kft.", nevvaltozatok: [], adoszam: "12497883-2-19" },
  [...happSzamlak, sz("X-1", "2026-09-10", "2026-10-10", xml("99999999-2-01", "masik@ceg.hu"), "HAPP Kft.")]).length, 3);

// E-mail lista
eq("hibás cím kiesik", emailLista("invoice@loesung@trans.hu"), null);
eq("több cím, duplikátum, vessző a végén", emailLista("cmr@hrtsped.hu,melinda.beder@hrtsped.hu,CMR@hrtsped.hu,"), "cmr@hrtsped.hu, melinda.beder@hrtsped.hu");
eq("üres", emailLista(""), null);

// Fizetési napok: 0 (készpénz) kimarad, a medián a szokásos értékre kerekít.
const napos = (napok: number[]) => napok.map((n, i) => sz(`S-${i}`, "2026-01-01", new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10), ""));
eq("59/60/61/56 → 60", fizetesiNapSzamlakbol(napos([59, 60, 61, 56, 58])), 60);
eq("csak készpénz → 0 (készpénz)", fizetesiNapSzamlakbol(napos([0, 0])), 0);
eq("nincs számla → null", fizetesiNapSzamlakbol([]), null);
eq("vegyes: a 0 kimarad", fizetesiNapSzamlakbol(napos([0, 30, 30])), 30);
eq("20/21/31 → 21 (nem szokásos)", fizetesiNapSzamlakbol(napos([20, 21, 31])), 21);
eq("44/45 → 45", fizetesiNapSzamlakbol(napos([44, 45])), 45);

// Hiány-számítás
eq("hiány: nem kér e-mailt", hianyzoMezok({ ...ures, szamla_email_nem_kell: true }).includes("szamlazasi_email"), false);
eq("hiány: üres string is hiány", hianyzoMezok({ ...ures, adoszam: "  " }).includes("adoszam"), true);

// A megbízáson már kiolvasott adatok (PÁNTYA #330, 2026-10-21): új partner, nincs számla, nincs javaslat.
const pantya = { ...ures, nev: "PÁNTYA Teherfuvarozó és Szolgáltató Kft.", nevvaltozatok: [] };
eq("megbízás-mezőből postacím és fizetés", kitoltesTerv(pantya, [], [], [{ id: "330", postazasi_cim: "4030 Debrecen, Olajfa u. 12.", fizetesi_hatarido_nap: 30 }]).map((k) => [k.mezo, k.ertek]),
  [["postazasi_cim", "4030 Debrecen, Olajfa u. 12."], ["fizetesi_hatarido_nap", 30]]);
eq("ellentmondó megbízások → semmi", kitoltesTerv(pantya, [], [], [
  { id: "2", postazasi_cim: "4030 Debrecen, Olajfa u. 12.", fizetesi_hatarido_nap: 30 },
  { id: "1", postazasi_cim: "1111 Budapest, Fő u. 1.", fizetesi_hatarido_nap: 60 }]), []);
eq("írásmód-eltérés nem ellentmondás", kitoltesTerv(pantya, [], [], [
  { id: "2", postazasi_cim: "4030 Debrecen, Olajfa utca 12.", fizetesi_hatarido_nap: null },
  { id: "1", postazasi_cim: "H-4030 Debrecen, Olajfa u. 12.", fizetesi_hatarido_nap: null }]).length, 1);
eq("a PDF-javaslat elsőbb", kitoltesTerv(pantya, [], [{ mezo: "fizetesi_hatarido_nap", ertek: "45", forras: "megbizas_pdf", forras_leiras: "a.pdf" }],
  [{ id: "330", postazasi_cim: null, fizetesi_hatarido_nap: 30 }]).map((k) => k.ertek), [45]);

// Címek egységes alakra
eq("fordított cím", cimSzep("Újtelep utca 41 8445 Csehbánya"), "8445 Csehbánya, Újtelep utca 41");
eq("csupa nagybetű", cimSzep("3300 EGER, KISTÁLYAI U.12."), "3300 Eger, Kistályai U.12.");
eq("H- előtag", cimSzep("H-5600 BÉKÉSCSABA, Őszi utca 6241/35 hrsz."), "5600 Békéscsaba, Őszi utca 6241/35 hrsz.");
eq("vessző nélkül", cimSzep("1222 Budapest Pannónia utca 9."), "1222 Budapest, Pannónia utca 9.");
eq("külföldi", cimSzep("DE 85386 ECHING, FREISINGER STRASSE 7"), "DE 85386 Eching, Freisinger Strasse 7");
eq("rendben lévő változatlan", cimSzep("1601 Budapest, Pf. 131"), "1601 Budapest, Pf. 131");

console.log(`teszt-partner-kitoltes: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
