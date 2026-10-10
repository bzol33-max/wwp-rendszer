// A fuvarlevél-fotó lezárás-döntésének tesztje (lib/fuvarozas/fuvarlevel-lezaras.ts), DB nélkül.
//
// Futtatás:  npx tsx scripts/teszt-fuvarlevel-lezaras.ts
//
// Valós minta (2026-10-10): bérfuvar után a kocsi következő saját fuvarjának
// kártyáján lefotózott bérfuvar-CMR lezárta a saját fuvart.

import { fotoLezarasDontes, type LezarasMegallo, type MasikFuvar } from "@/lib/fuvarozas/fuvarlevel-lezaras";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

const MA = "2026-10-10";
const felrakoKesz: LezarasMegallo = { sorszam: 1, tipus: "felrako", kesz: true };
const lerakoNyitott: LezarasMegallo = { sorszam: 2, tipus: "lerako", kesz: false };
const ketMegallo = [felrakoKesz, lerakoNyitott];
const index = (m: LezarasMegallo[], masik: MasikFuvar[] = [], nap = MA) => fotoLezarasDontes(m, nap, masik).megalloIndex;
const figy = (m: LezarasMegallo[], masik: MasikFuvar[] = [], nap = MA) => fotoLezarasDontes(m, nap, masik).figyelmeztetes;

// 1. A fuvar saját megállói.
eq("csak az utolsó lerakó nyitott → lezárja (index = sorszam−1)", index(ketMegallo), 1);
eq("csak az utolsó lerakó nyitott → nincs figyelmeztetés", figy(ketMegallo), null);
eq("sorszám szerint rendez (fordított bemenet)", index([lerakoNyitott, felrakoKesz]), 1);
eq("a valódi sorokból számol: 3 sor, a 3. a lerakó → 2", index([felrakoKesz, { sorszam: 2, tipus: "lerako", kesz: true }, { sorszam: 3, tipus: "lerako", kesz: false }]), 2);
eq("nyitott korábbi megálló → nem zár", index([{ ...felrakoKesz, kesz: false }, lerakoNyitott]), null);
eq("nyitott korábbi megálló → figyelmeztet", typeof figy([{ ...felrakoKesz, kesz: false }, lerakoNyitott]), "string");
eq("utolsó már kész → nincs teendő, nincs figyelmeztetés", fotoLezarasDontes([felrakoKesz, { ...lerakoNyitott, kesz: true }], MA, []), { megalloIndex: null, figyelmeztetes: null });
eq("nincs megálló → semmi", fotoLezarasDontes([], MA, []), { megalloIndex: null, figyelmeztetes: null });
eq("az utolsó nem lerakó → nem zár", index([{ sorszam: 1, tipus: "felrako", kesz: false }]), null);

// 2. A kocsi többi fuvarja.
const berFolyamatban: MasikFuvar = { id: "301", nap: MA, allapot: "folyamatban", nyitottLerako: true };
eq("ugyanaznapi, elindult bérfuvar nyitott lerakóval → a saját NEM zárul", index(ketMegallo, [berFolyamatban]), null);
eq("… és a figyelmeztetés megnevezi a másik fuvart", (figy(ketMegallo, [berFolyamatban]) ?? "").includes("#301"), true);
eq("korábbi napi, tervezett fuvar nyitott lerakóval → nem zár", index(ketMegallo, [{ id: "290", nap: "2026-10-09", allapot: "tervezett", nyitottLerako: true }]), null);
eq("korábbi napi, ellenőrzésre váró nyitott lerakóval → nem zár", index(ketMegallo, [{ id: "290", nap: "2026-10-09", allapot: "ellenorzesre_var", nyitottLerako: true }]), null);
eq("ugyanaznapi, még el sem indult (tervezett) fuvar → zár (a bérfuvar saját fotója nem akad meg a következő sajáton)", index(ketMegallo, [{ id: "302", nap: MA, allapot: "tervezett", nyitottLerako: true }]), 1);
eq("a másik fuvar lerakója kész → zár", index(ketMegallo, [{ ...berFolyamatban, nyitottLerako: false }]), 1);
eq("a másik fuvar már teljesített → zár", index(ketMegallo, [{ ...berFolyamatban, allapot: "teljesitve" }]), 1);
eq("a másik fuvar későbbi napi → zár", index(ketMegallo, [{ ...berFolyamatban, nap: "2026-10-11" }]), 1);
eq("ismeretlen/üres másik-lista → zár (régi viselkedés)", index(ketMegallo, []), 1);

console.log(`\nFuvarlevél-fotó lezárás teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
