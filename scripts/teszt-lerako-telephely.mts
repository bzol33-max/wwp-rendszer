// A vevő-telephely szótár (lib/fuvarozas/lerako-telephelyek.ts) ellenőrzése.
//
// Futtatás:  npx tsx scripts/teszt-lerako-telephely.mts
//
// Amit véd: a szótár egyetlen haszna, hogy a csupasz városnevet PONTOS
// címre cseréli. Ha egy bejegyzés címe maga is csak `csak_varos`, a csere
// semmit nem old meg, viszont átírja az adatot — ezt fogjuk meg itt. A
// második szabály, hogy a csere után a listákon ugyanaz a városnév
// maradjon, mint előtte (a `varosNev` ezt adja), különben a fuvarlisták
// írásmódja egyik napról a másikra megváltozna.

import {
  KETSEGES_CIMEK,
  LERAKO_TELEPHELYEK,
  SAJAT_FUVAR_DB_TIPUS,
  lerakoTelephelyCime,
} from "@/lib/fuvarozas/lerako-telephelyek";
import { SAJAT_TELEPHELYEK } from "@/lib/fuvarozas/telephelyek";
import { bontsMegallokra, cimPontossaga, varosNev } from "@/lib/fuvarozas/varos";
import { readFileSync } from "node:fs";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

for (const h of LERAKO_TELEPHELYEK) {
  // 1) A cím legyen geokódolható pontosságú — enélkül a csere értelmetlen.
  eq(`${h.varos}: a cím pontos`, cimPontossaga(h.cim), "pontos");
  // 2) A csere ne írja át a listákon látszó városnevet.
  eq(`${h.varos}: a városnév nem változik`, varosNev(h.cim), h.varos);
  // 3) A cím EGYETLEN megálló legyen. A " + " a megálló-elválasztó
  //    (lib/fuvarozas/varos.ts), így egy "+"-t tartalmazó cégnév két hamis
  //    megállóvá esne szét — pont ezért nincs cégnév a címekben.
  eq(`${h.varos}: egyetlen megálló`, bontsMegallokra(h.cim).length, 1);
  // 4) Kötelező indoklás, hogy a bejegyzés később felülvizsgálható legyen.
  eq(`${h.varos}: van forrás`, h.forras.trim().length > 10, true);
}

// 5) Nincs két bejegyzés ugyanarra a városra.
{
  const varosok = LERAKO_TELEPHELYEK.map((h) => h.varos.toLowerCase());
  eq("nincs duplikált város", varosok.length, new Set(varosok).size);
}

// 6) A szótár ne ütközzön a MI saját telephelyeinkkel (Szakoly, Balkány):
//    ott a GPS-oldal saját helyként ismeri fel a megállást, egy vevő-cím
//    ugyanarra a városra összezavarná a két nyilvántartást.
{
  const sajatVarosok = new Set(SAJAT_TELEPHELYEK.map((t) => varosNev(t.cim).toLowerCase()));
  const utkozes = LERAKO_TELEPHELYEK.filter((h) => sajatVarosok.has(h.varos.toLowerCase())).map((h) => h.varos);
  eq("nincs ütközés a saját telephelyekkel", utkozes, []);
}

// 7) A kétes címek NEM kerülhetnek be a szótárba a városnevükkel.
{
  const szotarVarosok = new Set(LERAKO_TELEPHELYEK.map((h) => h.varos.toLowerCase()));
  const beszivargott = KETSEGES_CIMEK.filter((k) => szotarVarosok.has(varosNev(k.hely).toLowerCase())).map((k) => k.hely);
  eq("kétes cím nem szivárgott a szótárba", beszivargott, []);
}

// 8) A keresés viselkedése.
{
  eq("ismert város", lerakoTelephelyCime("Ózd"), "3600 Ózd, Kovács Hagyó Gyula út 7.");
  eq("szóközös, kisbetűs alak is talál", lerakoTelephelyCime("  ózd "), "3600 Ózd, Kovács Hagyó Gyula út 7.");
  eq("ismeretlen város", lerakoTelephelyCime("Debrecen"), null);
  eq("üres", lerakoTelephelyCime(""), null);
  eq("null", lerakoTelephelyCime(null), null);
  // Teljes cím NEM városnév — a szótár csak csupasz városnévre válaszol.
  eq("teljes cím nem talál", lerakoTelephelyCime("3600 Ózd, Kovács Hagyó Gyula út 7."), null);
}

// 9) Elcsúszás-őr: a scripts/migrate.mjs egyszer futó javítása ugyanezeket
//    a címeket írja be az éles adatbázisba, de .mjs lévén nem tudja
//    importálni ezt a modult — a lista ott kézzel van duplikálva. Ha itt
//    változik egy cím és ott nem, az adatbázisban a régi marad.
{
  const migrate = readFileSync(new URL("./migrate.mjs", import.meta.url), "utf8");
  const hianyzo = LERAKO_TELEPHELYEK.filter((h) => !migrate.includes(h.cim)).map((h) => h.cim);
  eq("minden cím szerepel a migrate.mjs-ben is", hianyzo, []);
}

// 10) A FORDÍTOTT ELNEVEZÉS ŐRE. A `fuvar_megbizasok.tipus` oszlop neve
//     történelmi okokból fordított a felülethez képest: 'ber' a "Saját
//     fuvarok" fül, 'sajat' a "Bér fuvarok" fül. Az első nekifutás pont
//     ezen bukott el — a javítás a rossz halmazon futott. Ez az eset
//     rögzíti a helyes irányt, és azt, hogy a migrate.mjs is így szűr.
{
  eq("saját fuvar DB-tipusa 'ber'", SAJAT_FUVAR_DB_TIPUS, "ber");
  const migrate = readFileSync(new URL("./migrate.mjs", import.meta.url), "utf8");
  eq(
    "a migrate a saját fuvarokra szűr",
    migrate.includes('const SAJAT_TIPUS = "ber"'),
    true
  );
}

console.log(`\n${ok} rendben, ${bad} hiba`);
process.exit(bad ? 1 : 0);
