// A Drive-import végpontok Bearer-titok ellenőrzésének tesztje.
//
// Futtatás:  npx tsx scripts/teszt-drive-guard.ts
//
// MIÉRT VAN EZ ITT? A drive-import és a drive-frissites végpont hitelesítés
// nélkül írt a fuvar-adatokba (Fuvarozás 2 átállás-ellenőrzés, B5). A közös
// guard (lib/fuvarozas/drive-sync-guard.ts) viselkedése: nincs titok → 503,
// rossz/hiányzó fejléc → 401, jó fejléc → átenged. Ez a teszt a route
// handleren ellenőrzi, hogy a guard TÉNYLEG be van kötve — a modul
// önmagában nem elég, ha egy route nem hívja. (2026-10-16, D2: a
// drive-import és a drive-frissites végpont törölve — 30 napja 0 hívás —,
// csak a drive-sync maradt; a teszt azt is őrzi, hogy ne térjenek vissza.)
//
// Szándékosan .ts (nem .mts): Node 22.22 + tsx alatt az .mts tesztek a
// „@/…" importok névvel exportált tagjait nem látják (CJS/ESM interop), a
// .ts változat viszont mindenhol fut.

import { existsSync, readFileSync } from "node:fs";
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
  new Request("http://teszt/api/fuvarozas/drive-sync", {
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

// 2. A route handler tényleg a guardot hívja, MÉG a body beolvasása
//    előtt. A route-okat nem importáljuk (a teljes szerver-oldalt húznák be:
//    server-only, pg, googleapis), hanem a forrásukat ellenőrizzük — így a
//    teszt adatbázis és Next-futtatókörnyezet nélkül is fut.
const gyoker = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const nev of ["drive-import", "drive-frissites"]) {
  eq(`${nev}: törölve (D2)`, existsSync(path.join(gyoker, "app/api/fuvarozas", nev)), false);
}
for (const nev of ["drive-sync"]) {
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
