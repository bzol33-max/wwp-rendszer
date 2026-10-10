// A 11.2 leképező tábla (régi fül → új allapot) tesztje — a
// lib/fuvarozas/backfill-allapot.ts tiszta függvényén, DB nélkül.
//
// Futtatás:  npx tsx scripts/teszt-backfill-allapot.ts

import { regiHelyUjAllapot, sajatNaptarFek, becsultElhagyvaAt, type BackfillBemenet } from "@/lib/fuvarozas/backfill-allapot";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

const MA = "2026-09-19";
const MOST = new Date("2026-09-19T12:00:00+02:00");
const alap: BackfillBemenet = {
  tipus: "sajat", // = Bér fuvarok fül (jelleg 'ber')
  datum_iso: "2026-09-19",
  lerakas_datum_iso: null,
  postazva: false,
  postazva_at: null,
  teljesitve: false,
  szamla_szam: null,
  ellenorzott: true,
  fotoVan: false,
  papirok_beerkeztek_at: null,
  statusz: "uj",
};
const sor = (p: Partial<BackfillBemenet>) => regiHelyUjAllapot({ ...alap, ...p }, MA, MOST);

// Bér fuvar (tipus='sajat'), folyamatban fül.
eq("bér: ellenorzott=false → ellenorzesre_var", sor({ ellenorzott: false }).allapot, "ellenorzesre_var");
eq("bér: jövőbeli felrakás → tervezett", sor({ datum_iso: "2026-09-21" }).allapot, "tervezett");
eq("bér: mai felrakás → folyamatban", sor({}).allapot, "folyamatban");
eq("bér: ellenorzott=false a jövő elé megy", sor({ ellenorzott: false, datum_iso: "2026-09-21" }).allapot, "ellenorzesre_var");
// Számla/Posta fül.
eq("bér: lerakás elmúlt, fotó nincs → teljesitve", sor({ datum_iso: "2026-09-15" }).allapot, "teljesitve");
eq("bér: teljesitve jelölő, fotó van → szamlazhato", sor({ teljesitve: true, fotoVan: true }).allapot, "szamlazhato");
eq("bér: számlaszám, nincs postázva → szamlazva", sor({ datum_iso: "2026-09-10", szamla_szam: "W-1" }).allapot, "szamlazva");
eq("bér: számla + postázva 2 perce (ablakon belül) → postazva", sor({ datum_iso: "2026-09-10", szamla_szam: "W-1", postazva: true, postazva_at: new Date(MOST.getTime() - 2 * 60000) }).allapot, "postazva");
eq("bér: számla + postázva 1 órája → lezart", sor({ datum_iso: "2026-09-10", szamla_szam: "W-1", postazva: true, postazva_at: new Date(MOST.getTime() - 3600000) }).allapot, "lezart");
eq("bér: postázva számla NÉLKÜL → nem lezárt (S1), teljesitve", sor({ datum_iso: "2026-09-10", postazva: true, postazva_at: new Date(MOST.getTime() - 3600000) }).allapot, "teljesitve");
// Saját fuvar (tipus='ber').
eq("saját: jövő → tervezett", sor({ tipus: "ber", datum_iso: "2026-09-21" }).allapot, "tervezett");
eq("saját: ma → folyamatban", sor({ tipus: "ber" }).allapot, "folyamatban");
eq("saját: elmúlt, fotó nélkül → teljesitve (fotóra vár)", sor({ tipus: "ber", datum_iso: "2026-09-17" }).allapot, "teljesitve");
eq("saját: elmúlt, szállítólevél-fotóval → lezart (12. él)", sor({ tipus: "ber", datum_iso: "2026-09-17", fotoVan: true }).allapot, "lezart");
eq("saját: ellenorzott=false → ellenorzesre_var", sor({ tipus: "ber", ellenorzott: false, datum_iso: "2026-09-21" }).allapot, "ellenorzesre_var");
// 029: saját fuvar tény nélkül a naptártól nem lép előre (követő trigger tükre).
const tenyNelkul = { tipus: "ber", elozoAllapot: "tervezett", megalloTenyVan: false } as const;
eq("029 saját: múlt nap, tény nélkül, Kocsira adom (ellenorzott) → tervezett marad", sor({ ...tenyNelkul, datum_iso: "2026-09-17" }).allapot, "tervezett");
eq("029 saját: mai nap, tény nélkül → tervezett marad (nem ugrik a bérfuvar elé)", sor({ ...tenyNelkul }).allapot, "tervezett");
eq("029 saját: ellenőrzésre váró, ellenorzott=true lesz, múlt nap → tervezett", sor({ ...tenyNelkul, elozoAllapot: "ellenorzesre_var", datum_iso: "2026-09-17" }).allapot, "tervezett");
eq("029 saját: ellenőrzésre váró, ellenorzott=false, múlt nap → ellenorzesre_var", sor({ ...tenyNelkul, elozoAllapot: "ellenorzesre_var", ellenorzott: false, datum_iso: "2026-09-17" }).allapot, "ellenorzesre_var");
eq("029 saját: folyamatban tény nélkül, múlt nap → nem teljesül magától", sor({ ...tenyNelkul, elozoAllapot: "folyamatban", datum_iso: "2026-09-17" }).allapot, "folyamatban");
eq("029 saját: megálló-ténnyel, múlt nap → teljesitve (változatlan)", sor({ ...tenyNelkul, megalloTenyVan: true, datum_iso: "2026-09-17" }).allapot, "teljesitve");
eq("029 saját: megálló-ténnyel, ma → folyamatban (változatlan)", sor({ ...tenyNelkul, megalloTenyVan: true }).allapot, "folyamatban");
eq("029 saját: teljesitve jelölő → teljesitve (változatlan)", sor({ ...tenyNelkul, teljesitve: true }).allapot, "teljesitve");
eq("029 saját: fotóval, múlt nap → lezart (változatlan)", sor({ ...tenyNelkul, fotoVan: true, datum_iso: "2026-09-17" }).allapot, "lezart");
eq("029 saját: jövő nap → tervezett (változatlan)", sor({ ...tenyNelkul, datum_iso: "2026-09-21" }).allapot, "tervezett");
eq("029 saját: elindult fuvar datum későbbre, tény nélkül → hátra (változatlan)", sor({ ...tenyNelkul, elozoAllapot: "folyamatban", datum_iso: "2026-09-21" }).allapot, "tervezett");
eq("029 bér: múlt nap, tény nélkül → teljesitve (változatlan)", sor({ elozoAllapot: "tervezett", megalloTenyVan: false, datum_iso: "2026-09-15" }).allapot, "teljesitve");
eq("029 bér: ma, tény nélkül → folyamatban (változatlan)", sor({ elozoAllapot: "tervezett", megalloTenyVan: false }).allapot, "folyamatban");
eq("029 előző állapot nélkül (backfill) → régi szabály", sor({ tipus: "ber", datum_iso: "2026-09-17", megalloTenyVan: false }).allapot, "teljesitve");
eq("029 fék: lezárt előzmény nem számít", sajatNaptarFek("teljesitve", "teljesitve", { tipus: "ber", teljesitve: false, szamla_szam: null, fotoVan: false, ellenorzott: true, megalloTenyVan: false }), "teljesitve");
// Törölt: az állapot ugyanaz, mint törlés nélkül.
eq("törölt sor állapota független a törléstől", sor({ statusz: "torolt", datum_iso: "2026-09-21" }).allapot, "tervezett");
// Régi fül jelentése.
eq("regiHely átadva", sor({ datum_iso: "2026-09-10", szamla_szam: "W-1" }).regiHely, "szamla_posta");
// Becsült elhagyás.
eq("elhagyva: teljesitve_at nyer", becsultElhagyvaAt({ teljesitve_at: "2026-09-10T10:00:00Z", lerakas_datum_iso: null, datum_iso: "2026-09-10", created_at: "2026-09-01T00:00:00Z" }).becsult, false);
const b = becsultElhagyvaAt({ teljesitve_at: null, lerakas_datum_iso: "2026-09-12", datum_iso: "2026-09-10", created_at: "2026-09-01T00:00:00Z" });
eq("elhagyva: lerakás 18:00 becsült", [b.becsult, b.at.toISOString()], [true, "2026-09-12T16:00:00.000Z"]);

console.log(`\nBackfill-leképezés teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
