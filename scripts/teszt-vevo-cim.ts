// Vevő címe a Számlázz.hu XML-ből (lib/szamlak/vevo-cim.ts). Futtatás: npx tsx scripts/teszt-vevo-cim.ts
import { teljesCim, vevoCimXmlbol } from "@/lib/szamlak/vevo-cim";
let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}
const XML = `<szamla><vevo>
        <id>174119028</id>
        <nev>HungarEat Kft</nev>
        <cim>
                        <orszag>Magyarorsz&#225;g</orszag>
                        <irsz>1024</irsz>
            <telepules>Budapest</telepules>
            <cim>R&#243;mer Fl&#243;ris utca 8.</cim>
        </cim>
        <email>x@y.hu</email></vevo><alap/></szamla>`;
eq("teljes", vevoCimXmlbol(XML), "1024 Budapest, Rómer Flóris utca 8.");
eq("levágott XML (substr)", vevoCimXmlbol(XML.slice(XML.indexOf("<vevo>"), XML.indexOf("<email>"))), "1024 Budapest, Rómer Flóris utca 8.");
eq("utca nélkül", vevoCimXmlbol("<vevo><cim><irsz>4234</irsz><telepules>Szakoly</telepules><cim></cim></cim></vevo>"), "4234 Szakoly");
eq("nincs vevő", vevoCimXmlbol("<szamla/>"), null);
eq("null", vevoCimXmlbol(null), null);
eq("üres cím", vevoCimXmlbol("<vevo><cim><irsz></irsz><telepules></telepules><cim></cim></cim></vevo>"), null);
eq("teljesCim", [teljesCim("Debrecen"), teljesCim("4211 Ebes, Zsong-völgy 2."), teljesCim(null)], [false, true, false]);
console.log(`vevo-cim: ${ok} ok, ${bad} hiba`);
if (bad) process.exit(1);
