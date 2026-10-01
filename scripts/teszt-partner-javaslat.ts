// Partner-adat javaslatok (lib/fuvarozas2/partner-javaslat-alap.ts).
// Futtatás: npx tsx scripts/teszt-partner-javaslat.ts

import { javaslatokKiolvasasbol, vevoCimSzamlaXmlbol, hihetoCim } from "@/lib/fuvarozas2/partner-javaslat-alap";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

// Flexlog, 2026-09-29 (poz F26/3682/4173): a cím a fejlécben, a feltételek a szövegben.
eq("Flexlog: minden mező", javaslatokKiolvasasbol({
  megbizoNev: "FLEXLOG KFT", postazasiCim: "1106 Budapest, Jászberényi út 45.", szamlazasiEmail: "SZAMLAZAS@FLEXLOG.HU",
  papirHataridoNap: 15, fizetesiHataridoNap: "30",
}, ["Flexlog Kft."]), [
  { mezo: "postazasi_cim", ertek: "1106 Budapest, Jászberényi út 45." },
  { mezo: "szamlazasi_email", ertek: "szamlazas@flexlog.hu" },
  { mezo: "papir_bekuldesi_hatarido_nap", ertek: "15" },
  { mezo: "fizetesi_hatarido_nap", ertek: "30" },
]);
eq("a mi címünk nem javaslat", javaslatokKiolvasasbol({ megbizoNev: "Flexlog Kft.", postazasiCim: "H-4234 SZAKOLY Rákóczi utca 26" }, ["Flexlog Kft."]), []);
eq("más megbízó → semmi", javaslatokKiolvasasbol({ megbizoNev: "Duvenbeck Kft.", postazasiCim: "1106 Budapest, Jászberényi út 45." }, ["Flexlog Kft."]), []);
eq("mi vagyunk a megbízó → semmi", javaslatokKiolvasasbol({ megbizoNev: "Well-Worn Pallet Kft.", postazasiCim: "1106 Budapest, Jászberényi út 45." }, ["Flexlog Kft."]), []);
eq("megbízó nélkül a cím jöhet", javaslatokKiolvasasbol({ postazasiCim: "1106 Budapest, Jászberényi út 45." }, ["Flexlog Kft."]).length, 1);
eq("hibás e-mail és nap kiszűrve", javaslatokKiolvasasbol({ szamlazasiEmail: "nincs", papirHataridoNap: 0, fizetesiHataridoNap: 900 }, ["X"]), []);
eq("cím szám nélkül nem hihető", hihetoCim("Budapest"), false);

// Számlázz.hu számla-XML vevő blokk
eq("XML: vevő címe", vevoCimSzamlaXmlbol(
  "<szamla><vevo><nev>Flexlog Kft.</nev><cim><orszag>Magyarország</orszag><irsz>1106</irsz><telepules>Budapest</telepules><cim>Jászberényi &#250;t 45.</cim></cim></vevo></szamla>"
), "1106 Budapest, Jászberényi út 45.");
eq("XML: külön postázási cím az elsőbb", vevoCimSzamlaXmlbol(
  "<szamla><vevo><nev>X</nev><cim><irsz>4000</irsz><telepules>Debrecen</telepules><cim>Fő u. 1.</cim></cim><postazasicim><irsz>1106</irsz><telepules>Budapest</telepules><cim>Jászberényi út 45.</cim></postazasicim></vevo></szamla>"
), "1106 Budapest, Jászberényi út 45.");
eq("XML: lapos vevő mezők", vevoCimSzamlaXmlbol("<szamla><vevo><nev>X</nev><irsz>4000</irsz><telepules>Debrecen</telepules><cim>Fő u. 1.</cim></vevo></szamla>"), "4000 Debrecen, Fő u. 1.");
eq("XML: nincs vevő", vevoCimSzamlaXmlbol("<szamla></szamla>"), null);

console.log(`\nPartner-javaslat teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
