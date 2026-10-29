// Fuvarozás 2. kör · fülszerkezet (lib/fuvarozas2/fulek-szerkezet.ts).
// Spec: docs/fuvarozas-2-kor-terv.md „Navigáció (Dev C)” és „Tesztek”.
// Futtatás: npx tsx scripts/teszt-2kor-navigacio.ts

import { FOFULEK, aktivFofulKulcs } from "@/lib/fuvarozas2/fulek-szerkezet";
import type { Fofül, Alful } from "@/lib/fuvarozas2/fulek-szerkezet";

let ok = 0, bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else { bad++; console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`); }
}

const fofulek: Fofül[] = FOFULEK;
const osszesAlful: Alful[] = fofulek.flatMap((f) => f.alfulek);

// Három főfül, ebben a sorrendben. (A ⚙ Rendszer külön ikon, nem a FOFULEK eleme — feltevés, mint eddig.)
eq("főfül-kulcsok sorrendben", fofulek.map((f) => f.kulcs), ["kocsik", "megbizasok", "penz"]);
eq("főfül-címkék", fofulek.map((f) => f.label), ["Kocsik", "Megbízások", "Pénz"]);

const alfulek = (kulcs: string) => (fofulek.find((f) => f.kulcs === kulcs)?.alfulek ?? []).map((a) => [a.href, a.label]);
eq("Kocsik alfülei", alfulek("kocsik"), [
  ["/fuvarozas2", "Ma + hét"], ["/fuvarozas2/timocom", "Ajánlat"],
]);
eq("Megbízások alfülei változatlanok", alfulek("megbizasok"), [
  ["/fuvarozas2/megbizasok", "Lista"], ["/fuvarozas2/levelek", "Levelek"], ["/fuvarozas2/partnerek", "Partnerek"],
]);
eq("Pénz alfülei", alfulek("penz"), [
  ["/fuvarozas2/eredmeny", "Áttekintés"], ["/fuvarozas2/kimutatas", "Kimutatás"], ["/fuvarozas2/koltsegek", "Költségek"],
]);

// A 8 href mind szerepel, pontosan egyszer; más nincs. (Redesign 5: a Ma és a Hét egy fül, a
// /fuvarozas2/tervezes már csak a Bejövő megbízások döntése — fül nélkül, a Kocsik alá sorolva.)
const REGI = [
  "/fuvarozas2", "/fuvarozas2/timocom",
  "/fuvarozas2/megbizasok", "/fuvarozas2/levelek", "/fuvarozas2/partnerek",
  "/fuvarozas2/eredmeny", "/fuvarozas2/kimutatas", "/fuvarozas2/koltsegek",
];
for (const href of REGI) eq(`${href} pontosan egyszer`, osszesAlful.filter((a) => a.href === href).length, 1);
eq("összesen 8 alfül", osszesAlful.length, 8);
eq("nincs ismeretlen href", osszesAlful.map((a) => a.href).filter((h) => !REGI.includes(h)), []);
eq("a tervezés nem fül", osszesAlful.some((a) => a.href === "/fuvarozas2/tervezes"), false);
eq("a tervezés a Kocsik főfül alá tartozik", aktivFofulKulcs(fofulek, "/fuvarozas2/tervezes"), "kocsik");
eq("a kocsi lapja a Kocsik főfül alá tartozik", aktivFofulKulcs(fofulek, "/fuvarozas2/kocsi/AOPU-427"), "kocsik");

// csakFuvarozas pontosan az Ajánlat, Áttekintés, Kimutatás alfüleken.
eq("csakFuvarozas pontosan a 3 alfülön",
  osszesAlful.filter((a) => a.csakFuvarozas === true).map((a) => a.label),
  ["Ajánlat", "Áttekintés", "Kimutatás"]);
eq("csakFuvarozas hrefjei",
  osszesAlful.filter((a) => a.csakFuvarozas === true).map((a) => a.href),
  ["/fuvarozas2/timocom", "/fuvarozas2/eredmeny", "/fuvarozas2/kimutatas"]);
// A többi (Ma + hét, Lista, Levelek, Partnerek, Költségek) mindenki számára látható: a jelölés hiányzik vagy false.
eq("a többi alfül nem csakFuvarozas",
  osszesAlful.filter((a) => !a.csakFuvarozas).map((a) => a.label),
  ["Ma + hét", "Lista", "Levelek", "Partnerek", "Költségek"]);

// Az „elszamolas” hatókör (fuvarozás-jog nélkül) szűrése, ahogy a fulek.tsx csinálja: a Kocsik főfül
// a Ma + hét alfüllel marad, a Pénz a Költségekkel, a Megbízások teljes.
{
  const lathato = fofulek
    .map((f) => ({ kulcs: f.kulcs, alfulek: f.alfulek.filter((a) => !a.csakFuvarozas).map((a) => a.label) }))
    .filter((f) => f.alfulek.length > 0);
  eq("fuvarozás-jog nélkül látható", lathato, [
    { kulcs: "kocsik", alfulek: ["Ma + hét"] },
    { kulcs: "megbizasok", alfulek: ["Lista", "Levelek", "Partnerek"] },
    { kulcs: "penz", alfulek: ["Költségek"] },
  ]);
}

// Minden alfül a /fuvarozas2 alatt, és egyik főfül sem üres.
eq("minden href /fuvarozas2-vel kezdődik", osszesAlful.every((a) => a.href === "/fuvarozas2" || a.href.startsWith("/fuvarozas2/")), true);
eq("nincs üres főfül", fofulek.every((f) => f.alfulek.length > 0), true);
eq("főfül-kulcsok egyediek", new Set(fofulek.map((f) => f.kulcs)).size, fofulek.length);

console.log(`teszt-2kor-navigacio: ${ok} ok, ${bad} hiba`);
if (bad > 0) process.exit(1);
