// A modul-jogosultság feloldásának tesztje (Fuvarozás 2 átállás, B8/E3).
//
// Futtatás:  npx tsx scripts/teszt-jogosultsag.ts
//
// MIÉRT VAN EZ ITT? A resolvePermission "hiányzó bejegyzés = teljes jog"
// szabálya miatt egy új modulkulcs, ami NEM kerül az OPT_IN_MODULES-ba,
// visszamenőleg minden meglévő felhasználónak megnyílik. Az új Fuvarozás 2
// kulcsoknál ("elszamolas", "rendszer") ez adatszivárgás lenne — ez a teszt
// azt őrzi, hogy opt-in maradnak, és hogy a tervezett fiókok (vezeto,
// Szabina, sofőr) pontosan azt látják, amit a leltár-doksi mond.

import { MODULES, resolvePermission, type ModuleKey, type Permissions } from "@/lib/auth/permissions";

let ok = 0;
let bad = 0;
function eq(nev: string, kapott: unknown, vart: unknown) {
  if (JSON.stringify(kapott) === JSON.stringify(vart)) ok++;
  else {
    bad++;
    console.log(`  HIBA  ${nev}\n    várt:   ${JSON.stringify(vart)}\n    kapott: ${JSON.stringify(kapott)}`);
  }
}
const lat = (perm: Permissions | null, m: ModuleKey, role = "felhasznalo") => resolvePermission(role, perm, m).view;
const szerkeszt = (perm: Permissions | null, m: ModuleKey, role = "felhasznalo") => resolvePermission(role, perm, m).edit;

// 1. Az új kulcsok opt-in: üres/hiányzó permissions esetén NEM láthatók.
for (const m of ["elszamolas", "rendszer", "fuvarozas_sajat", "posta", "attekintes"] as const) {
  eq(`${m}: hiányzó bejegyzés → nem látja`, lat({}, m), false);
  eq(`${m}: null permissions → nem látja`, lat(null, m), false);
}
// A régi, teljes értékű modulok maradnak default-true (ezt NEM változtattuk).
eq("fuvarozas: hiányzó bejegyzés → látja (régi szabály)", lat({}, "fuvarozas"), true);
// Admin mindent.
eq("admin: elszamolas", resolvePermission("admin", null, "elszamolas"), { view: true, edit: true });
eq("admin: rendszer", resolvePermission("admin", {}, "rendszer"), { view: true, edit: true });
// Minden kulcs szerepel a MODULES listában (a Beállítások felület ebből épül).
const kulcsok = new Set(MODULES.map((m) => m.key));
eq("MODULES tartalmazza az elszamolas kulcsot", kulcsok.has("elszamolas"), true);
eq("MODULES tartalmazza a rendszer kulcsot", kulcsok.has("rendszer"), true);

// 2. A vezeto fiók (scripts/migrate.mjs seed) — Ma · Fuvar · Cég · Rendszer.
const vezeto: Permissions = {
  info: { view: true, edit: false },
  fuvarozas: { view: true, edit: true },
  elszamolas: { view: true, edit: true },
  rendszer: { view: true, edit: true },
  szamlak: { view: true, edit: false },
  jarmuvek: { view: true, edit: false },
  keszlet: { view: true, edit: false },
  dolgozok: { view: true, edit: false },
  jelenlet: { view: true, edit: false },
  beallitasok: { view: false, edit: false },
};
eq("vezeto: fuvarozás szerkeszt", szerkeszt(vezeto, "fuvarozas"), true);
eq("vezeto: rendszer lát", lat(vezeto, "rendszer"), true);
eq("vezeto: beállítások nem", lat(vezeto, "beallitasok"), false);
eq("vezeto: számlák csak olvas", [lat(vezeto, "szamlak"), szerkeszt(vezeto, "szamlak")], [true, false]);
eq("vezeto: régi Áttekintés nem (az a BudahaziZoltan fióké)", lat(vezeto, "attekintes"), false);
eq("vezeto: dolgozói mobil nem", lat(vezeto, "erkezes"), false);

// 3. Szabina: posta (régi) + elszamolas (új), Fuvarozás teljes modul NEM.
const szabina: Permissions = {
  info: { view: false, edit: false },
  fuvarozas: { view: false, edit: false },
  keszlet: { view: false, edit: false },
  szamlak: { view: false, edit: false },
  dolgozok: { view: false, edit: false },
  jelenlet: { view: false, edit: false },
  jarmuvek: { view: false, edit: false },
  beallitasok: { view: false, edit: false },
  posta: { view: true, edit: true },
  elszamolas: { view: true, edit: true },
};
eq("Szabina: elszámolás szerkeszt", szerkeszt(szabina, "elszamolas"), true);
eq("Szabina: teljes Fuvarozás nem (GPS-részlet nélkül — S16)", lat(szabina, "fuvarozas"), false);
eq("Szabina: rendszer nem", lat(szabina, "rendszer"), false);

// 4. Sofőr: csak a saját fuvar (fuvarozas_sajat) — a szerver a saját kocsira szűr.
const sofor: Permissions = {
  info: { view: false, edit: false },
  fuvarozas: { view: false, edit: false },
  keszlet: { view: false, edit: false },
  szamlak: { view: false, edit: false },
  dolgozok: { view: false, edit: false },
  jelenlet: { view: false, edit: false },
  jarmuvek: { view: false, edit: false },
  beallitasok: { view: false, edit: false },
  erkezes: { view: true, edit: true },
  fuvarozas_sajat: { view: true, edit: true },
};
eq("sofőr: saját fuvar", szerkeszt(sofor, "fuvarozas_sajat"), true);
eq("sofőr: teljes Fuvarozás nem", lat(sofor, "fuvarozas"), false);
eq("sofőr: elszámolás nem", lat(sofor, "elszamolas"), false);
eq("sofőr: rendszer nem", lat(sofor, "rendszer"), false);

console.log(`\nJogosultság teszt: ${ok} rendben, ${bad} hiba`);
if (bad > 0) process.exit(1);
