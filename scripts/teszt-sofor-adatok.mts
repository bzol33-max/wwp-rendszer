// A sofőrnek szóló megbízás-adatok (lib/fuvarozas/sofor-adatok.ts) ellenőrzése.
//
// Futtatás:  npx tsx scripts/teszt-sofor-adatok.mts
//
// Amit véd:
//  1. A nyelvi modell hibás formájú válasza (hiányzó tömb, "null" szövegként,
//     rossz típus) SOHA ne dobjon kivételt — a sofőr-adat kiegészítés, a
//     megbízás felvitelét nem akaszthatja meg.
//  2. Több lerakónál mind bekerüljön a lerako mezőbe, a megállók
//     elválasztójával, hogy a bontsMegallokra ugyanannyi megállót lásson.
//  3. A részletek a meglévő megállókhoz VÁROS szerint párosuljanak — egy régi,
//     egylerakós sorhoz is a saját városának részlete jöjjön.
//
// A minták az élesben beolvasott megbízásokból valók: ÁB Speed 26/3814
// (két lerakó), Lösung Trans 2026/TO02093 (referencia, mega autó),
// Hajdúspedíció (helyszíni kontakt).

import {
  kontaktNev,
  kontaktTelefon,
  megalloReszlete,
  osszesFelrakoCime,
  osszesLerakoCime,
  soforAdatokKivonatbol,
  vanSoforAdat,
} from "@/lib/fuvarozas/sofor-adatok";
import { bontsMegallokra } from "@/lib/fuvarozas/varos";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

// --- 1. Hibatűrés ---------------------------------------------------------
for (const [nev, nyers] of [
  ["null", null],
  ["szöveg", "nem json"],
  ["üres objektum", {}],
  ["megallok nem tömb", { megallok: "Sopron" }],
  ["rossz típusú elemek", { megallok: [null, 5, { tipus: "atrako" }, { tipus: "lerako", cim: 12 }] }],
] as const) {
  const a = soforAdatokKivonatbol(nyers);
  eq(`${nev}: nem dob, üres referencia`, a.referencia, null);
  eq(`${nev}: nincs mit menteni`, vanSoforAdat(a), false);
}
eq(
  "a 'null' szöveg null",
  soforAdatokKivonatbol({ referencia: "null", jarmuEloiras: "  ", megallok: [] }),
  { megallok: [], referencia: null, jarmuEloiras: null }
);
eq("rossz ISO nap eldobva", soforAdatokKivonatbol({ megallok: [{ tipus: "lerako", nap: "24.09.2026" }] }).megallok[0].nap, null);

// --- 2. ÁB Speed 26/3814: két lerakó --------------------------------------
const abSpeed = soforAdatokKivonatbol({
  referencia: "Transporeon 1153460",
  jarmuEloiras: null,
  megallok: [
    { tipus: "felrako", ceg: "Huncargo Raktár", cim: "9400 Sopron, Szappanfőző krt. 14.", nap: "2026-09-23", ido: null, kontakt: null },
    { tipus: "lerako", ceg: "Reál Alfi Ker Kft", cim: "3527 Miskolc, Besenyői u. 8.", nap: "2026-09-24", ido: null, kontakt: null },
    { tipus: "lerako", ceg: "Coop", cim: "4030 Debrecen, Diószegi u. 22/C", nap: "2026-09-24", ido: null, kontakt: null },
  ],
});
const lerako = osszesLerakoCime(abSpeed);
eq("ÁB Speed: mindkét lerakó a mezőben", lerako, "3527 Miskolc, Besenyői u. 8.; 4030 Debrecen, Diószegi u. 22/C");
eq("ÁB Speed: a bontás két megállót lát", bontsMegallokra(lerako).length, 2);
eq("ÁB Speed: van mit menteni", vanSoforAdat(abSpeed), true);
eq(
  "egy lerakónál nincs összefűzés",
  osszesLerakoCime(soforAdatokKivonatbol({ megallok: [{ tipus: "lerako", cim: "4031 Debrecen, Nyomdász utca 7." }] })),
  null
);
eq(
  "cím nélküli lerakónál nincs összefűzés (nem veszhet el megálló)",
  osszesLerakoCime(soforAdatokKivonatbol({ megallok: [{ tipus: "lerako", cim: "Miskolc" }, { tipus: "lerako", ceg: "Coop" }] })),
  null
);
eq(
  "a címen belüli pontosvessző nem bont új megállót",
  bontsMegallokra(
    osszesLerakoCime(soforAdatokKivonatbol({ megallok: [{ tipus: "lerako", cim: "Miskolc; Besenyői u. 8." }, { tipus: "lerako", cim: "Debrecen" }] }))
  ).length,
  2
);

// --- 3. Párosítás a meglévő megállókhoz -----------------------------------
// Új sor: a lerako mező már mindkét lerakót tartalmazza.
eq("új sor, 1. lerakó = Miskolc", megalloReszlete(abSpeed.megallok, "lerako", 0, 2, "3527 Miskolc, Besenyői u. 8.")?.ceg, "Reál Alfi Ker Kft");
eq("új sor, 2. lerakó = Coop", megalloReszlete(abSpeed.megallok, "lerako", 1, 2, "4030 Debrecen, Diószegi u. 22/C")?.ceg, "Coop");
// Régi sor: a mezőben csak az UTOLSÓ lerakó van (a modell eddig így adta).
eq("régi sor, egyetlen lerakó a városa szerint", megalloReszlete(abSpeed.megallok, "lerako", 0, 1, "4030 Debrecen, Diószegi u. 22/C")?.ceg, "Coop");
eq("felrakó a sajátját kapja", megalloReszlete(abSpeed.megallok, "felrako", 0, 1, "9400 Sopron, Szappanfőző krt14")?.ceg, "Huncargo Raktár");
eq("ismeretlen város, eltérő darabszám → nincs találat", megalloReszlete(abSpeed.megallok, "lerako", 0, 1, "Nyíregyháza"), null);
eq("részletek nélkül null", megalloReszlete(null, "lerako", 0, 1, "Debrecen"), null);
// Két azonos városú lerakó: a sorrend dönt.
const ketDebreceni = soforAdatokKivonatbol({
  megallok: [
    { tipus: "lerako", ceg: "A Kft", cim: "4030 Debrecen, Diószegi u. 22." },
    { tipus: "lerako", ceg: "B Kft", cim: "4031 Debrecen, Nyomdász u. 7." },
  ],
});
eq("két debreceni: az első az elsőé", megalloReszlete(ketDebreceni.megallok, "lerako", 0, 2, "4030 Debrecen, Diószegi u. 22.")?.ceg, "A Kft");
eq("két debreceni: a második a másodiké", megalloReszlete(ketDebreceni.megallok, "lerako", 1, 2, "4031 Debrecen, Nyomdász u. 7.")?.ceg, "B Kft");

// --- 4. Helyszíni kontakt -------------------------------------------------
eq("Hajdú kontakt: szám", kontaktTelefon("Baán József 06209353201"), "06209353201");
eq("Hajdú kontakt: név", kontaktNev("Baán József 06209353201"), "Baán József");
eq("tagolt szám", kontaktTelefon("Kiss Péter, +36 20 594 22 96"), "+36205942296");
eq("tagolt szám: név", kontaktNev("Kiss Péter, +36 20 594 22 96"), "Kiss Péter");
eq("szám nélkül nincs telefon", kontaktTelefon("Baán József"), null);
eq("üres kontakt", kontaktTelefon(null), null);

// --- EUCARGO (2026-09-25): 4 felrakó + 10 lerakó a kísérő levélből, megállónkénti rakománnyal
{
  const nyers = {
    megallok: [
      { tipus: "felrako", ceg: "Rau és Fiai Kft", cim: "4233 Balkány, Geszterédi u. 1.", kontakt: "30/9252165", rakomany: "2 t 1.fok Titus" },
      { tipus: "felrako", ceg: "Legény Péter", cim: "4080 Hajdúnánás, Pázsit u. 2", kontakt: "30/2193233", rakomany: "5 t 1.fok Primátor" },
      ...Array.from({ length: 12 }, (_, i) => ({ tipus: "lerako", ceg: `Lerakó ${i + 1}`, cim: `${2000 + i} Város${i + 1}, Fő u. ${i + 1}.`, rakomany: "1 t" })),
    ],
  };
  const a = soforAdatokKivonatbol(nyers);
  eq("14 megálló mind megmarad (a korlát 20)", a.megallok.length, 14);
  eq("megállónkénti rakomány", a.megallok[0].rakomany, "2 t 1.fok Titus");
  eq("több felrakó címe pontosvesszővel", osszesFelrakoCime(a), "4233 Balkány, Geszterédi u. 1.; 4080 Hajdúnánás, Pázsit u. 2");
  eq("egy felrakónál nincs összefűzés", osszesFelrakoCime({ ...a, megallok: a.megallok.slice(1) }), null);
  eq("csak rakomány is sofőr-adat", vanSoforAdat({ megallok: [{ tipus: "lerako", cim: "x", ceg: null, nap: null, ido: null, kontakt: null, rakomany: "3 t" }], referencia: null, jarmuEloiras: null }), true);
}

console.log(`\n${ok} rendben, ${bad} hiba`);
process.exit(bad ? 1 : 0);
