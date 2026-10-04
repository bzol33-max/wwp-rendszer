// Minden szerver-akció jogosultság-ellenőrzésének statikus tesztje.
//
// Futtatás:  npx tsx scripts/teszt-akcio-jogok.ts
//
// MIÉRT VAN EZ ITT? Egy "use server" fájl MINDEN exportja kívülről, közvetlen
// POST-tal hívható akció — akkor is, ha a felület csak egy védett oldalról
// hívja, vagy csak egy másik szerverfüggvény belső segédjének készült. Az
// audit (2026-10-04) 37 ilyen exportot talált ellenőrzés nélkül: bármely
// bejelentkezett fiók (dolgozó, mobil) kiolvashatta a számlákat és a
// fuvardíjakat. Ez a teszt végigmegy az összes "use server" fájlon, és
// megköveteli, hogy minden exportált függvény törzse (vagy egy általa hívott,
// ugyanabban a fájlban lévő segédfüggvény) jogosultság-ellenőrzést hívjon.
// Kivétel csak az ENGEDETT listán lehet, indoklással.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const GYOKER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Ellenőrzés nélkül is rendben lévő exportok — mindegyikhez indoklás. */
const ENGEDETT: Record<string, string> = {
  "lib/auth/actions.ts:login": "a bejelentkezés maga, munkamenet előtt fut",
  "lib/auth/actions.ts:logout": "a saját munkamenet törlése",
  "lib/fuvarozas/actions.ts:getGazolajAr": "nyilvános NAV-üzemanyagár, gyorsítótárazva",
  "lib/fuvarozas2/sajat-fuvar.ts:hianyzoMezok": "tiszta függvény, adatot nem ér el",
  "lib/fuvarozas2/tervezes.ts:hetKezdete": "tiszta függvény, adatot nem ér el",
};

const GUARD =
  /\b(require(Admin|Session|EditPermission|ViewPermission|AnyViewPermission|AnyEditPermission|SajatVagyModulJog)|verifySession|fuvarIratGuard)\s*\(/;

function fajlok(mappa: string): string[] {
  const ki: string[] = [];
  for (const nev of readdirSync(mappa)) {
    const teljes = path.join(mappa, nev);
    if (statSync(teljes).isDirectory()) ki.push(...fajlok(teljes));
    else if (/\.tsx?$/.test(nev)) ki.push(teljes);
  }
  return ki;
}

let ok = 0;
let bad = 0;
const hasznaltKivetel = new Set<string>();

for (const teljes of [...fajlok(path.join(GYOKER, "lib")), ...fajlok(path.join(GYOKER, "app"))]) {
  const forras = readFileSync(teljes, "utf8");
  if (!/^\s*["']use server["']/.test(forras)) continue;
  const rel = path.relative(GYOKER, teljes);
  const sf = ts.createSourceFile(rel, forras, ts.ScriptTarget.Latest, true);

  const helyi = new Map<string, string>();
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name && s.body) helyi.set(s.name.text, s.body.getText());
  }

  for (const s of sf.statements) {
    if (!ts.isFunctionDeclaration(s) || !s.name) continue;
    if (!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const nev = s.name.text;
    const kulcs = `${rel}:${nev}`;
    const torzs = s.body?.getText() ?? "";
    let vedett = GUARD.test(torzs);
    if (!vedett) {
      for (const [seged, segedTorzs] of helyi) {
        if (new RegExp(`\\b${seged}\\s*\\(`).test(torzs) && GUARD.test(segedTorzs)) vedett = true;
      }
    }
    if (vedett) {
      ok++;
    } else if (ENGEDETT[kulcs]) {
      ok++;
      hasznaltKivetel.add(kulcs);
    } else {
      bad++;
      console.log(`  HIBA  ${kulcs}: nincs jogosultság-ellenőrzés (require*Permission / requireSession)`);
    }
  }
}

for (const kulcs of Object.keys(ENGEDETT)) {
  if (!hasznaltKivetel.has(kulcs)) {
    bad++;
    console.log(`  HIBA  elavult kivétel az ENGEDETT listán: ${kulcs}`);
  }
}

console.log(`\nAkció-jogosultság teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
