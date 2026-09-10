// Induláskor lefutó, biztonságosan újrafuttatható migráció:
// - a séma mindig alkalmazódik (IF NOT EXISTS / ON CONFLICT DO NOTHING)
// - a demó seed csak EGYETLEN egyszer, a rendszer legelső indításakor fut
//   le — ezt egy alkalmazott_javitasok-bejegyzés jelöli (2026-09-07-től),
//   NEM a "van-e már sor a keszlet_movements-ben" ellenőrzés. Korábban ez
//   utóbbi volt a feltétel, ami hibásnak bizonyult: amikor a Készlet modult
//   élesítéskor teljesen kiürítettük (hogy 0-ról induljon), a következő
//   induláskor a tábla megint üresnek látszott, és a migráció ÚJRA
//   betöltötte a demó "Nyitókészlet" sorokat. Az alkalmazott_javitasok-os
//   jelölés ettől független — egyszer fut le, aztán soha többé, akkor sem,
//   ha valaki (jogosan) kiüríti a táblát.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.join(__dirname, "..", "db");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("[migrate] DATABASE_URL nincs beállítva, kihagyva.");
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const schema = readFileSync(path.join(dbDir, "schema.sql"), "utf8");
  await pool.query(schema);
  console.log("[migrate] séma alkalmazva.");

  await runDemoSeedOnce(pool, dbDir);
  await seedFirstUserOnce(pool);
  await seedUserOnce(pool, {
    code: "user-admin-2026-09-07",
    username: "admin",
    password: process.env.SEED_ADMIN_PASSWORD,
    name: "Admin",
    role: "admin",
  });
  // Csak a mobil összefoglaló nézetet látja — minden más modul (Info,
  // Fuvarozás, Készlet, Számlák, Dolgozók, Jelenléti/üzenőfal, Járművek,
  // Beállítások) le van tiltva neki (view+edit is false), a "mobil" modul
  // pedig önmagában feljogosít a /mobil oldal mindkét kártyájának
  // megtekintésére, a teljes Készlet/Fuvarozás modul jogosultsága nélkül
  // is. Lásd app/mobil/page.tsx.
  await seedUserOnce(pool, {
    code: "user-budahazizoltan-2026-09-07",
    username: "BudahaziZoltan",
    password: process.env.SEED_BUDAHAZIZOLTAN_PASSWORD,
    name: "Budaházi Zoltán",
    role: "felhasznalo",
    permissions: {
      info: { view: false, edit: false },
      fuvarozas: { view: false, edit: false },
      keszlet: { view: false, edit: false },
      szamlak: { view: false, edit: false },
      dolgozok: { view: false, edit: false },
      jelenlet: { view: false, edit: false },
      jarmuvek: { view: false, edit: false },
      beallitasok: { view: false, edit: false },
      mobil: { view: true, edit: false },
    },
  });
  // Csak a Posta nézetet látja (a Bér fuvarok Számla/Posta listáját,
  // csempénként, mobilra optimalizálva) — minden más modul le van tiltva
  // neki, a "posta" modul pedig önmagában feljogosít a /posta oldal
  // megtekintésére és a "Postázva" jelölésre, a teljes Fuvarozás modul
  // jogosultsága nélkül is. Lásd app/posta/page.tsx.
  await seedUserOnce(pool, {
    code: "user-budahaziszabina-2026-09-07",
    username: "BudahaziSzabina",
    password: process.env.SEED_BUDAHAZISZABINA_PASSWORD,
    name: "Budaházi Szabina",
    role: "felhasznalo",
    permissions: {
      info: { view: false, edit: false },
      fuvarozas: { view: false, edit: false },
      keszlet: { view: false, edit: false },
      szamlak: { view: false, edit: false },
      dolgozok: { view: false, edit: false },
      jelenlet: { view: false, edit: false },
      jarmuvek: { view: false, edit: false },
      beallitasok: { view: false, edit: false },
      posta: { view: true, edit: true },
    },
  });
  // Csak a mobil felvásárlás-rögzítő nézetet látja (a Havi fül "gyors
  // rögzítés" kártyájának mobilra optimalizált, önálló verziója) — minden
  // más modul le van tiltva neki. Lásd app/felvasarlas/page.tsx.
  await seedUserOnce(pool, {
    code: "user-mobil-2026-09-10",
    username: "mobil",
    password: process.env.SEED_MOBIL_PASSWORD,
    name: "Mobil",
    role: "felhasznalo",
    permissions: {
      info: { view: false, edit: false },
      fuvarozas: { view: false, edit: false },
      keszlet: { view: false, edit: false },
      szamlak: { view: false, edit: false },
      dolgozok: { view: false, edit: false },
      jelenlet: { view: false, edit: false },
      jarmuvek: { view: false, edit: false },
      beallitasok: { view: false, edit: false },
      felvasarlas_mobil: { view: true, edit: true },
    },
  });

  await applyKapcsolatokUpdates(pool, dbDir);
  await applyPoziciszamUpdates(pool, dbDir);
  await applyFuvarCorrections(pool, dbDir);
  await applyPostazasiCimUpdates(pool, dbDir);
  await resetSzamlaRosszTotalosszMezok(pool);
  await applySzamlaFizetveImport(pool, dbDir);
  await backfillMozgatasBe(pool);
  await seedAlkalmazottakOnce(pool);
  await seedJelenletAktivOnce(pool);

  // Dolgozói bejelentkezés (2026-09-08): a két, érkezés-widgeten megjelenő
  // dolgozó saját belépéssel éri el a mobilra optimalizált /erkezes
  // nézetet. Az "employeeName" a hozzájuk tartozó alkalmazottak.id-t köti
  // a user sorhoz (lásd seedUserOnce), hogy tudják, melyik dolgozóként
  // rögzítenek — ezért ez a hívás a seedAlkalmazottakOnce UTÁN fut. Csak az
  // "erkezes" modulhoz kapnak jogot, minden máshoz nem.
  const dolgozoiPermissions = {
    info: { view: false, edit: false },
    fuvarozas: { view: false, edit: false },
    keszlet: { view: false, edit: false },
    szamlak: { view: false, edit: false },
    dolgozok: { view: false, edit: false },
    jelenlet: { view: false, edit: false },
    jarmuvek: { view: false, edit: false },
    beallitasok: { view: false, edit: false },
    mobil: { view: false, edit: false },
    erkezes: { view: true, edit: true },
  };
  await seedUserOnce(pool, {
    code: "user-bodogangabor-2026-09-08",
    username: "BodoganGabor",
    password: process.env.SEED_BODOGANGABOR_PASSWORD,
    name: "Bodogán Gábor",
    role: "dolgozo",
    // Ő az egyetlen, aki az /erkezes főoldalán a Készlet csempét is megkapja
    // (Szakoly/Balkány, leltár + Be/Ki mozgás) — lásd grantKeszletSajatOnce
    // a már létező felhasználóknál (ha ez a hívás korábban már lefutott).
    permissions: { ...dolgozoiPermissions, keszlet_sajat: { view: true, edit: true } },
    employeeName: "Bodogán Gabi",
  });
  await seedUserOnce(pool, {
    code: "user-vadongabor-2026-09-08",
    username: "VadonGabor",
    password: process.env.SEED_VADONGABOR_PASSWORD,
    name: "Vadon Gábor",
    role: "dolgozo",
    permissions: dolgozoiPermissions,
    employeeName: "Vadon Gabi",
  });
  await grantKeszletSajatOnce(pool);

  await pool.end();
}

// Egyszeri javítás (2026-09-08): a BodoganGabor felhasználó a fenti
// seedUserOnce hívás ELSŐ (élesítéskori) lefutásakor még nem kapta meg a
// "keszlet_sajat" jogot (a modul csak utólag került be) — a seedUserOnce
// pedig csak létrehozáskor ír jogosultságot, meglévő felhasználónál nem
// nyúl hozzá. Ez a lépés utólag, egyszer ráírja a jogot a permissions
// JSON-ra, a többi kulcsot érintetlenül hagyva.
async function grantKeszletSajatOnce(pool) {
  const JAVITAS_KOD = "bodogangabor-keszlet-sajat-2026-09-08";
  const { rows } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (rows.length > 0) return;

  await pool.query(
    `update users
     set permissions = permissions || '{"keszlet_sajat": {"view": true, "edit": true}}'::jsonb
     where username = 'BodoganGabor'`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
  console.log("[migrate] BodoganGabor megkapta a saját készlet (Szakoly/Balkány) jogot.");
}

// Dolgozók modul — egyszeri törzsadat-feltöltés (2026-09-07): a tényleges
// dolgozói kör és bérmódjuk. Csak a törzsadatot (Employee) tölti fel — a
// folyó havi tételeket (napok/utalás/előleg) NEM, azokat a felhasználó
// viszi fel az oldalon a valós adatokkal, hogy ne legyen kitalált
// pénzügyi adat a rendszerben.
async function seedAlkalmazottakOnce(pool) {
  const JAVITAS_KOD = "alkalmazottak-torzsadat-2026-09-07";
  const { rows } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (rows.length > 0) return;

  const employees = [
    { name: "Vadon Gabi", position: 1, weeklyWage: 110000 },
    { name: "Bodogán Gabi", position: 2, dailyWage: 22000 },
    {
      name: "Vadon Gergő",
      position: 3,
      monthlyWage: 700000,
      fixedDeduction: 50000,
      showLetiltas: true,
      showUzemanyag: true,
    },
    { name: "Takács Micó", position: 4, monthlyWage: 600000 },
    { name: "Oszlánszki Tamás", position: 5, monthlyWage: 300000 },
    { name: "Budaházi Zoltán", position: 6, monthlyWage: 750000 },
  ];

  for (const e of employees) {
    await pool.query(
      `insert into alkalmazottak
         (name, position, weekly_wage, daily_wage, monthly_wage, fixed_deduction, show_letiltas, show_uzemanyag)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        e.name,
        e.position,
        e.weeklyWage ?? 0,
        e.dailyWage ?? 0,
        e.monthlyWage ?? 0,
        e.fixedDeduction ?? 0,
        e.showLetiltas ?? false,
        e.showUzemanyag ?? false,
      ]
    );
  }
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
  console.log(`[migrate] Alkalmazottak törzsadat feltöltve: ${employees.length} dolgozó.`);
}

// Jelenléti/üzenőfal modul (2026-09-07) — egyszeri kijelölés: melyik két
// dolgozó jelenjen meg az érkezés-ablakban (alkalmazottak.jelenlet_aktiv).
async function seedJelenletAktivOnce(pool) {
  const JAVITAS_KOD = "jelenlet-aktiv-dolgozok-2026-09-07";
  const { rows } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (rows.length > 0) return;

  await pool.query(
    `update alkalmazottak set jelenlet_aktiv = true where name in ('Vadon Gabi', 'Bodogán Gabi')`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
  console.log("[migrate] Jelenlét modul: aktív dolgozók kijelölve.");
}

// Demó seed — kizárólag a legelső induláskor fut le, utána soha többé
// (lásd a fájl tetején lévő megjegyzést). A Készlet modul 2026-09-07-i
// élesítésekor a felhasználó kérésére a tényleges (teszt) adatokat
// kiürítettük — ez a bejegyzés azt jelöli, hogy a demó seed-et "már
// alkalmazottnak" tekintjük, tehát ne fusson le újra és ne töltse vissza a
// demó "Nyitókészlet" sorokat.
async function runDemoSeedOnce(pool, dbDir) {
  const JAVITAS_KOD = "demo-seed-v1";
  const { rows } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (rows.length > 0) {
    console.log("[migrate] demó seed már alkalmazva (vagy élesítéskor törölve), kihagyva.");
    return;
  }

  const seed = readFileSync(path.join(dbDir, "seed.sql"), "utf8");
  await pool.query(seed);
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
  console.log("[migrate] demó adatok betöltve.");
}

// Első felhasználó (2026-09-07): a rendszerben eddig nem volt bejelentkezés,
// minden rögzített tétel a hardcode-olt "admin" névvel bélyegződött. Ez az
// egyszeri lépés létrehozza az első valódi felhasználót bcrypt-hash-elt
// jelszóval — csak akkor, ha az "users" tábla még teljesen üres, hogy egy
// később, a felületen (vagy közvetlenül adatbázisban) létrehozott azonos
// nevű felhasználót ne írjon felül.
async function seedFirstUserOnce(pool) {
  const JAVITAS_KOD = "first-user-2026-09-07";
  const { rows } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (rows.length > 0) return;

  const { rows: existingUsers } = await pool.query(`select 1 from users limit 1`);
  if (existingUsers.length > 0) {
    // Már van felhasználó (pl. időközben kézzel létrehozták) — csak jelöljük
    // a javítást alkalmazottnak, ne hozzunk létre duplikátumot.
    await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
    return;
  }

  const password = process.env.SEED_FIRST_USER_PASSWORD;
  if (!password) {
    console.warn(
      "[migrate] SEED_FIRST_USER_PASSWORD nincs beállítva, az első felhasználó létrehozása kihagyva."
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `insert into users (username, password_hash, name, role)
     values ($1, $2, $3, 'admin')
     on conflict (username) do nothing`,
    ["OszlanszkiTamás", passwordHash, "Oszlánszki Tamás"]
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
  console.log("[migrate] első felhasználó létrehozva.");
}

// Általános, egyszeri felhasználó-létrehozó — a JAVITAS_KOD-dal azonosított
// lépés csak egyszer fut le, utána soha többé (akkor sem, ha a felhasználót
// valaki törli). Új felhasználó hozzáadásához elég egy újabb hívás egyedi
// "code" értékkel a main()-ben.
//
// A jelszót MINDIG környezeti változóból kapja (soha nem szabad plaintext
// jelszót a forráskódba írni — a repó publikus, a raw.githubusercontent.com
// bárki számára olvasható). Ha a megfelelő env változó nincs beállítva, a
// seed-lépés kihagyódik (figyelmeztetéssel), nem hibázik el az egész
// migrációt.
async function seedUserOnce(pool, { code, username, password, name, role, permissions, employeeName }) {
  const { rows } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [code]);
  if (rows.length > 0) return;

  if (!password) {
    console.warn(`[migrate] nincs jelszó megadva (env változó hiányzik) — kihagyva: ${username}.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `insert into users (username, password_hash, name, role, permissions, employee_id)
     values ($1, $2, $3, $4, $5::jsonb, (select id from alkalmazottak where name = $6))
     on conflict (username) do nothing`,
    [username, passwordHash, name, role, JSON.stringify(permissions ?? {}), employeeName ?? null]
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [code]);
  console.log(`[migrate] felhasználó létrehozva: ${username}.`);
}

// Egyszeri javítás (2026-09-06): a Számlázz.hu-lekérdező kliens első
// verziója rossz mezőnevekről olvasta az összegeket (<osszegek><brutto>
// helyett a valós válaszban <osszegek><totalossz><brutto> van) — emiatt
// minden addig lekérdezett számla brutto/netto/afa mezője 0 volt. Mivel a
// `szamla` tábla csak a Számlázz.hu-t tükröző, újra-lekérdezhető cache (nem
// forrásadat), a legegyszerűbb és legbiztonságosabb javítás: egyszer,
// névvel azonosítva teljesen kiürítjük és a lekérdező kört (poll.ts)
// nulláról újrafuttatjuk a helyes mezőkkel.
async function resetSzamlaRosszTotalosszMezok(pool) {
  const JAVITAS_KOD = "szamla-totalossz-mezok-2026-09-06";
  const { rows } = await pool.query(
    `select 1 from alkalmazott_javitasok where kod = $1`,
    [JAVITAS_KOD]
  );
  if (rows.length > 0) return;

  await pool.query(`delete from szamla`);
  await pool.query(`delete from szamlak_poll_pending`);
  await pool.query(`update szamlak_poll_allapot set utolso_sorszam = 0`);
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
  console.log("[migrate] szamla javítás alkalmazva: cache törölve, újra fog épülni a helyes mezőkkel.");
}

// Egyszeri javítás (2026-09-08): a Készlet modul "Telephelyek közti mozgatás"
// funkciója eddig csak a FORRÁS telepen vont le mennyiséget — a cél telepen
// soha nem íródott jóvá semmi, tehát minden eddigi mozgatás a rendszerből
// "eltűnt" a cél oldalon (pl. ma Nyíregyházáról Szakolyra átvitt H1 raklap és
// más típusok). A lib/keszlet/actions.ts recordMovement mostantól mindkét
// oldalra rögzít (lásd "mozgatas_be" irány), ez a lépés pedig egyszer,
// visszamenőleg pótolja a hiányzó jóváírásokat minden korábban rögzített
// "mozgatas" sorhoz, az eredeti időbélyeggel — így a jelenlegi készletek is
// helyesbülnek, nem csak az ezután rögzített mozgatások.
async function backfillMozgatasBe(pool) {
  const JAVITAS_KOD = "keszlet-mozgatas-be-backfill-2026-09-08";
  const { rows } = await pool.query(
    `select 1 from alkalmazott_javitasok where kod = $1`,
    [JAVITAS_KOD]
  );
  if (rows.length > 0) return;

  const { rowCount } = await pool.query(
    `insert into keszlet_movements (site_id, type_id, direction, qty, target_site_id, created_at, created_by)
     select m.target_site_id, m.type_id, 'mozgatas_be', m.qty, m.site_id, m.created_at, m.created_by
     from keszlet_movements m
     where m.direction = 'mozgatas' and m.target_site_id is not null`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
  console.log(`[migrate] mozgatás-jóváírás pótolva: ${rowCount} korábbi telephelyek közti mozgatáshoz.`);
}

// Fuvarozás — Kapcsolatok: minden induláskor lefut, biztonságosan
// újrafuttatható. A db/kapcsolatok-updates.json a folyamatosan bővülő
// forrás-adat — valahányszor új vagy pontosított partner-kapcsolat kerül
// elő (pl. Gmail "Fuvarmegbízás" címke alapján), oda kell felvenni egy
// "fixes" (meglévő sor javítása, cég+kapcsolattartó alapján azonosítva) vagy
// "new" (új sor, cég+e-mail / cég+kapcsolattartó alapján duplikáció-védett)
// bejegyzést — a tábla ettől kézi lépés nélkül, automatikusan bővül minden
// deploykor.
async function applyKapcsolatokUpdates(pool, dbDir) {
  let data;
  try {
    data = JSON.parse(readFileSync(path.join(dbDir, "kapcsolatok-updates.json"), "utf8"));
  } catch {
    console.log("[migrate] kapcsolatok-updates.json nincs, kihagyva.");
    return;
  }

  let updated = 0;
  for (const fix of data.fixes ?? []) {
    const hasKapcsolattarto = Object.prototype.hasOwnProperty.call(fix.match, "kapcsolattarto");
    const { rows: matches } = await pool.query(
      hasKapcsolattarto
        ? "select id from fuvar_kapcsolatok where ceg = $1 and kapcsolattarto = $2"
        : "select id from fuvar_kapcsolatok where ceg = $1",
      hasKapcsolattarto ? [fix.match.ceg, fix.match.kapcsolattarto] : [fix.match.ceg]
    );
    for (const row of matches) {
      const entries = Object.entries(fix.patch ?? {});
      if (entries.length === 0) continue;
      const sets = entries.map(([key], i) => `${key} = $${i + 1}`);
      const params = entries.map(([, value]) => value);
      params.push(row.id);
      await pool.query(
        `update fuvar_kapcsolatok set ${sets.join(", ")} where id = $${params.length}`,
        params
      );
      updated++;
    }
  }

  let inserted = 0;
  for (const entry of data.new ?? []) {
    const { rows: existing } = await pool.query(
      entry.email
        ? "select 1 from fuvar_kapcsolatok where ceg = $1 and email = $2"
        : "select 1 from fuvar_kapcsolatok where ceg = $1 and kapcsolattarto = $2",
      entry.email ? [entry.ceg, entry.email] : [entry.ceg, entry.kapcsolattarto ?? null]
    );
    if (existing.length > 0) continue;
    await pool.query(
      `insert into fuvar_kapcsolatok (ceg, kapcsolattarto, telefon, email, megjegyzes, forras)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        entry.ceg,
        entry.kapcsolattarto ?? null,
        entry.telefon ?? null,
        entry.email ?? null,
        entry.megjegyzes ?? null,
        entry.forras ?? null,
      ]
    );
    inserted++;
  }

  console.log(`[migrate] kapcsolatok frissítve: ${updated} javítás, ${inserted} új sor.`);
}

// Bér fuvarok — hivatkozási szám (fuvarszám/pozíciószám/megbízási szám):
// a Drive-dokumentumokból kinyert értékek visszatöltése drive_file_id
// alapján egyeztetve. Minden induláskor lefut, biztonságosan újrafuttatható
// (csak akkor ír, ha a mező még üres ÉS nincs "nincs" jelölve — így egy
// felhasználó által kézzel beírt/megjelölt érték nem íródik felül).
async function applyPoziciszamUpdates(pool, dbDir) {
  let data;
  try {
    data = JSON.parse(readFileSync(path.join(dbDir, "fuvar-poziciszam-updates.json"), "utf8"));
  } catch {
    console.log("[migrate] fuvar-poziciszam-updates.json nincs, kihagyva.");
    return;
  }

  let updated = 0;
  for (const entry of data.updates ?? []) {
    const { rowCount } = await pool.query(
      `update fuvar_megbizasok
         set pozicioszam = $2,
             pozicioszam_nincs = $3
       where drive_file_id = $1
         and pozicioszam is null
         and pozicioszam_nincs = false`,
      [entry.driveFileId, entry.pozicioszam ?? null, entry.pozicioszam == null]
    );
    updated += rowCount ?? 0;
  }

  console.log(`[migrate] pozíciószámok visszatöltve: ${updated} sor.`);
}

// Bér fuvarok — egyedi, egyszeri mezőjavítások drive_file_id alapján (pl.
// hibásan importált/összemosott adat egy adott megbízásnál). A db/fuvar-
// corrections.json a folyamatosan bővülő forrás — minden induláskor lefut,
// biztonságosan újrafuttatható (a patch mezőket egyszerűen ismét beállítja
// ugyanarra az értékre, ami ártalmatlan). A "note" mező csak dokumentáció,
// nem kerül be az adatbázisba.
async function applyFuvarCorrections(pool, dbDir) {
  let data;
  try {
    data = JSON.parse(readFileSync(path.join(dbDir, "fuvar-corrections.json"), "utf8"));
  } catch {
    console.log("[migrate] fuvar-corrections.json nincs, kihagyva.");
    return;
  }

  let updated = 0;
  for (const entry of data.updates ?? []) {
    const entries = Object.entries(entry.patch ?? {});
    if (entries.length === 0) continue;
    const sets = entries.map(([key], i) => `${key} = $${i + 2}`);
    const params = [entry.driveFileId, ...entries.map(([, value]) => value)];
    const { rowCount } = await pool.query(
      `update fuvar_megbizasok set ${sets.join(", ")} where drive_file_id = $1`,
      params
    );
    updated += rowCount ?? 0;
  }

  console.log(`[migrate] fuvar-javítások alkalmazva: ${updated} sor.`);
}

// Bér fuvarok — Számla/Posta fül: postázási cím visszatöltése a Drive-
// dokumentumokból, drive_file_id alapján, ott ahol a megrendelő kifejezetten
// a székhelyétől eltérő címet ad meg a számla/eredeti dokumentumok
// postázásához. Minden induláskor lefut, biztonságosan újrafuttatható (csak
// akkor ír, ha a postazasi_cim mező még üres — egy kézzel beírt/módosított
// érték nem íródik felül).
async function applyPostazasiCimUpdates(pool, dbDir) {
  let data;
  try {
    data = JSON.parse(readFileSync(path.join(dbDir, "fuvar-postazasi-cim-updates.json"), "utf8"));
  } catch {
    console.log("[migrate] fuvar-postazasi-cim-updates.json nincs, kihagyva.");
    return;
  }

  let updated = 0;
  for (const entry of data.updates ?? []) {
    const { rowCount } = await pool.query(
      `update fuvar_megbizasok
         set postazasi_cim = $2
       where drive_file_id = $1
         and postazasi_cim is null`,
      [entry.driveFileId, entry.postazasiCim]
    );
    updated += rowCount ?? 0;
  }

  console.log(`[migrate] postázási címek visszatöltve: ${updated} sor.`);
}

// Számlák — kifizetettség tömeges importja: a Számlázz.hu API nem ad vissza
// fizetettségi státuszt, ezért ez kézi ("Fizetve" gomb) workflow lenne
// egyenként — a felhasználó viszont adott egy teljes, könyvelésből/
// Számlázz.hu-ból származó listát a ténylegesen kifizetett számlákról
// (dátummal, ahol ismert). A db/szamla-fizetve-import.json a forrás —
// minden induláskor lefut, biztonságosan újrafuttatható (csak azokat a
// sorokat érinti, amik a `szamla` táblában MÉG "nincs fizetve" állapotúak,
// tehát egy már kézzel "Fizetve"-ként megjelölt/visszavont sort nem ír
// felül). Ha a listában nem szerepelt pontos kifizetés-dátum, a számla
// kiállítás-dátumát használjuk helyette (csak becslés, de a "Visszavon"
// 5 perces ablakot nem nyitja fel feleslegesen, mert ez már régi dátum).
async function applySzamlaFizetveImport(pool, dbDir) {
  let data;
  try {
    data = JSON.parse(readFileSync(path.join(dbDir, "szamla-fizetve-import.json"), "utf8"));
  } catch {
    console.log("[migrate] szamla-fizetve-import.json nincs, kihagyva.");
    return;
  }

  let updated = 0;
  for (const entry of data.updates ?? []) {
    const { rowCount } = await pool.query(
      `update szamla
         set fizetve = true,
             fizetve_datum = coalesce($2::timestamptz, kiallitas_datum::timestamptz)
       where szamlaszam = $1
         and fizetve = false`,
      [entry.szamlaszam, entry.kifizetve]
    );
    updated += rowCount ?? 0;
  }

  console.log(`[migrate] számla fizetve-import: ${updated} sor jelölve kifizetettnek.`);
}

main().catch((err) => {
  console.error("[migrate] hiba:", err);
  process.exit(1);
});
