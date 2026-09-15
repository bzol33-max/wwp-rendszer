// A Duvenbeck-értelmező regressziós tesztje.
//
// Futtatás:  npx tsx scripts/teszt-duvenbeck.mts
//
// MIÉRT VAN EZ ITT? Az első változat valódi megbízásokon "átment", de élesben
// egyetlen megállót sem ismert fel — mert a mintáit egy MÁSIK PDF-olvasó
// szövegére írtam, nem arra, amit a rendszerben futó `pdf-parse` ad. A kettő
// máshogy tördeli ugyanazt az oldalt.
//
// A scripts/teszt-minta/ fájlok ezért a pdf-parse VALÓDI sortördelését
// másolják — kitalált cégnevekkel, címekkel és összegekkel, mert a repó
// nyilvános, és igazi megbízás nem kerülhet bele. Ha a Duvenbeck megváltoztatja
// a sablont, ezek a minták frissítendők egy friss pdf-parse kimenetről.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseDuvenbeck, megalloCimek } from "@/lib/fuvarozas/duvenbeck";

const mintaDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "teszt-minta");
const minta = (nev: string) => parseDuvenbeck(readFileSync(path.join(mintaDir, `${nev}.txt`), "utf8"));

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) {
    ok++;
  } else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}

const mb = minta("duvenbeck-megbizas")!;
eq("megbízás: típus", mb.tipus, "megbizas");
eq("megbízás: azonosító és verzió", [mb.megbizasId, mb.verzio], ["1111111", 1]);
eq("megbízás: Út ID (Reise ID) — a számlázási kulcs", mb.reiseId, "8888888");
eq("megbízás: Túra ID", mb.turaId, "9999999");
eq("megbízás: ár (európai tizedesvessző, ezres pont)", [mb.fuvardij, mb.penznem], [1234, "EUR"]);
eq("megbízás: súly", mb.sulyKg, 1000);
eq("megbízás: rendszám", mb.rendszamJeloltek, ["ABC123"]);
eq("megbízás: számla/POD cím", mb.szamlaCim, "minta-szamla@duvenbeck.de");
eq("megbízás: felrakó a hasábos tördelésből", megalloCimek(mb, "felrako"), "Minta Logisztika Kft., Proba utca 1, 1111 Mintavaros");
eq("megbízás: lerakó", megalloCimek(mb, "lerako"), "Fogado Raktar Zrt., Masik utca 2, 2222 Masikvaros");
eq("megbízás: pontosan 2 megálló (a saját és a megbízó irányítószáma nem az)", mb.megallok.length, 2);
eq("megbízás: felrakási ablak", [mb.megallok[0].ablakTol, mb.megallok[0].ablakIg],
  [{ datum: "2026-02-01", ido: "08:00" }, { datum: "2026-02-01", ido: "10:00" }]);
eq("megbízás: lerakási ablak", [mb.megallok[1].ablakTol, mb.megallok[1].ablakIg],
  [{ datum: "2026-02-02", ido: "07:00" }, { datum: "2026-02-02", ido: "15:00" }]);

const rl = minta("duvenbeck-rakomanylista")!;
eq("rakománylista: típus", rl.tipus, "rakomanylista");
eq("rakománylista: ugyanarra a megbízásra hivatkozik", rl.megbizasId, mb.megbizasId);
eq("rakománylista: ugyanaz az Út ID — ez fűzi össze a párt", rl.reiseId, mb.reiseId);
eq("rakománylista: saját azonosító", rl.rakomanylistaId, "2222222");
eq("rakománylista: bordero", rl.bordero, "S0099887766");
eq("rakománylista: nincs rajta ár", rl.fuvardij, null);
eq("rakománylista: felrakó", megalloCimek(rl, "felrako"), "Minta Logisztika Kft., Proba utca 1, 1111 Mintavaros");
eq("rakománylista: lerakó (az irány nem fordul meg)", megalloCimek(rl, "lerako"), "Fogado Raktar Zrt., Masik utca 2, 2222 Masikvaros");
eq("rakománylista: a kapukód és a vevői hivatkozás nem rendszám", rl.rendszamJeloltek, ["ABC123"]);

const tort = minta("duvenbeck-megbizas-tort-cegnev")!;
eq("tört cégnév: inkább cégnév nélkül, mint rossz megállóhoz rendelve",
  [megalloCimek(tort, "felrako"), megalloCimek(tort, "lerako")],
  ["Proba utca 1, 1111 Mintavaros", "Masik utca 2, 2222 Masikvaros"]);

eq("nem Duvenbeck-irat", parseDuvenbeck("Egyeb fuvarlevel\n1111 Budapest\nHU"), null);

console.log(`${ok} rendben, ${bad} hiba`);
process.exit(bad ? 1 : 0);
