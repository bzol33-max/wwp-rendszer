// A Drive-import végpontok Bearer-titok ellenőrzésének tesztje.
//
// Futtatás:  npx tsx scripts/teszt-drive-guard.ts
//
// MIÉRT VAN EZ ITT? A drive-import és a drive-frissites végpont hitelesítés
// nélkül írt a fuvar-adatokba (Fuvarozás 2 átállás-ellenőrzés, B5). A közös
// guard (lib/fuvarozas/drive-sync-guard.ts) viselkedése: nincs titok → 503,
// rossz/hiányzó fejléc → 401, jó fejléc → átenged. Ez a teszt mindhárom
// route handleren ellenőrzi, hogy a guard TÉNYLEG be van kötve — a modul
// önmagában nem elég, ha egy route nem hívja.
//
// Szándékosan .ts (nem .mts): Node 22.22 + tsx alatt az .mts tesztek a
// „@/…" importok névvel exportált tagjait nem látják (CJS/ESM interop), a
// .ts változat viszont mindenhol fut.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { requireDriveSyncSecret } from "@/lib/fuvarozas/drive-sync-guard";

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

const keres = (auth?: string) =>
  new Request("http://teszt/api/fuvarozas/drive-import", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });

// 1. A guard önmagában.
delete process.env.DRIVE_SYNC_SECRET;
eq("nincs titok → 503", requireDriveSyncSecret(keres("Bearer akarmi"))?.status, 503);

process.env.DRIVE_SYNC_SECRET = "teszt-titok";
eq("hiányzó fejléc → 401", requireDriveSyncSecret(keres())?.status, 401);
eq("rossz titok → 401", requireDriveSyncSecret(keres("Bearer rossz"))?.status, 401);
eq("nem Bearer séma → 401", requireDriveSyncSecret(keres("teszt-titok"))?.status, 401);
eq("jó titok → átenged", requireDriveSyncSecret(keres("Bearer teszt-titok")), null);

// 2. A három route handler tényleg a guardot hívja: rossz titokkal 401-et
//    kell adniuk MIELŐTT a body-hoz vagy az adatbázishoz nyúlnának (a body
//    itt szándékosan üres/érvénytelen — ha a guard nem futna előbb, 400 jönne).
// 2. A három route handler tényleg a guardot hívja, MÉG a body beolvasása
//    előtt. A route-okat nem importáljuk (a teljes szerver-oldalt húznák be:
//    server-only, pg, googleapis), hanem a forrásukat ellenőrizzük — így a
//    teszt adatbázis és Next-futtatókörnyezet nélkül is fut.
const gyoker = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const nev of ["drive-sync", "drive-import", "drive-frissites"]) {
  const forras = readFileSync(path.join(gyoker, "app/api/fuvarozas", nev, "route.ts"), "utf8");
  const guardHely = forras.indexOf("requireDriveSyncSecret(req)");
  const bodyHely = forras.search(/req\.json\(\)|futtatRendszerkent\(/);
  eq(`${nev}: importálja a guardot`, forras.includes('from "@/lib/fuvarozas/drive-sync-guard"'), true);
  eq(`${nev}: hívja a guardot`, guardHely > -1, true);
  eq(`${nev}: a guard a body/munka ELŐTT fut`, guardHely > -1 && bodyHely > -1 && guardHely < bodyHely, true);
  eq(`${nev}: a guard eredményét visszaadja`, /if \(tiltas\) return tiltas;/.test(forras), true);
}

console.log(`\nDrive-guard teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
