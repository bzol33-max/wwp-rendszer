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

  // Sofőr bejelentkezés (2026-09-13): Vadon Gergő és Takács Micó (a
  // fuvarozási GPS-kártyák "Gergő"/"Micó" sofőrjei) saját belépéssel érik
  // el a dolgozói mobil nézet Profil és Fuvarok csempéjét. Csak a saját
  // fuvarjaikhoz (fuvarozas_sajat), a jelenléthez (erkezes) és a saját
  // előlegeikhez (elolegek_sajat) kapnak jogot — a teljes Fuvarozás modulhoz
  // (minden kocsi, szerkesztés) nem. Az employeeName a törzsadatban szereplő
  // pontos névvel köti össze a felhasználót az alkalmazottak sorral (lásd
  // seedAlkalmazottakOnce) — Takács Miklós törzsadat-neve "Takács Micó".
  const soforPermissions = {
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
    fuvarozas_sajat: { view: true, edit: true },
    elolegek_sajat: { view: true, edit: true },
  };
  await seedUserOnce(pool, {
    code: "user-vadongergo-2026-09-13",
    username: "VadonGergo",
    password: process.env.SEED_VADONGERGO_PASSWORD,
    name: "Vadon Gergő",
    role: "sofor",
    permissions: soforPermissions,
    employeeName: "Vadon Gergő",
  });
  await seedUserOnce(pool, {
    code: "user-takacsmiklos-2026-09-13",
    username: "TakacsMiklos",
    password: process.env.SEED_TAKACSMIKLOS_PASSWORD,
    name: "Takács Miklós",
    role: "sofor",
    permissions: soforPermissions,
    employeeName: "Takács Micó",
  });
  // Előlegek elfogadása (2026-09-13): Bodogán Gábor és Vadon Gábor is
  // megkapja a saját előlegeik megtekintésének/elfogadásának jogát a Profil
  // csempén — ők a seedUserOnce ELSŐ lefutásakor még nem kaptak ilyet (a
  // modul csak utólag került be), a seedUserOnce pedig csak létrehozáskor ír
  // jogosultságot, meglévő felhasználónál nem nyúl hozzá.
  await grantElolegekSajatOnce(pool);
  await ujraimportalDuvenbeckSorokatOnce(pool, DUVENBECK_UJRAIMPORT_KOROK);
  await feloldTorortDuvenbeckDokumentumokatOnce(pool);
  await torolDokumentumNelkuliDuplikatumokatOnce(pool);
  await rendezFuvarHelyeketOnce(pool);
  await vonjaVisszaSzamlatlanArchivalastOnce(pool);
  await javitsaSajatCegMegrendelotSzamlabol(pool);
  await javitsaMaradekSajatCegMegrendelotOnce(pool);
  await toroljeDuplikatumSorokatOnce(pool);
  await vonjaVisszaKoraiTeljesitestOnce(pool);
  await vonjaVisszaKettosGpsTeljesitestOnce(pool);
  await naplozFuvarHelyEllenorzest(pool);

  await pool.end();
}

// Egyszeri javítás (2026-09-16, 2. kör): a db/archiv-backlog-cleanup.sql
// korábban a POSTÁZÁS-jelölővel tett át az Archívba számlázatlan bér
// fuvarokat, hogy ne torlódjanak a Számla/Postán. Budaházi Zoltán döntése
// szerint viszont számla nélkül nincs lezárt ügy: ezek számlázandó munkák,
// a Számla/Postán a helyük. A besorolási szabály (lib/fuvarozas/fuvar-hely.ts)
// ezért a számlaszámot is megköveteli az archiváláshoz — ez a lépés pedig a
// mesterséges jelölőt vonja vissza, hogy a sor ne "Postázva" pipával álljon
// ott. Pontosan a cleanup-script saját "VISSZAVONÁS" feltételét használja:
// nála a postazva_at a fuvar napjának éjfele (a kézi pipánál a kattintás
// ideje) — így a kézi jelölésekhez nem nyúl, azok postázva-pipával, de
// számlázandóként látszanak, és a felhasználó dönt róluk.
async function vonjaVisszaSzamlatlanArchivalastOnce(pool) {
  const JAVITAS_KOD = "szamlatlan-archivalas-visszavonas-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok
     set postazva = false, postazva_at = null
     where statusz <> 'torolt'
       and tipus = 'sajat'
       and postazva
       and coalesce(szamla_szam, '') = ''
       and postazva_at = coalesce(lerakas_datum, datum)::timestamptz
     returning id, to_char(coalesce(lerakas_datum, datum), 'YYYY-MM-DD') as nap, megrendelo`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] számlázatlan, script-archivált bér fuvar visszatéve a Számla/Postára: ${rows.length} sor` +
      (rows.length ? ": " + rows.map((r) => `#${r.id} ${r.nap} ${r.megrendelo ?? "-"}`).join("; ") : ".")
  );
}

// A sajatCegunkE (lib/fuvarozas/fuvar-constants.ts) tükre SQL-ben: a megrendelő
// mező a SAJÁT cégünk-e (kis-/nagybetű, kötőjel, pont, "pallet"/"pallett",
// cégforma-toldalék ingadozással). Egy oszlopnévre alkalmazva adja a feltételt.
const SAJAT_CEG_SQL = (oszlop) =>
  `(${oszlop} is not null and regexp_replace(lower(${oszlop}), '[-.,]', ' ', 'g') ~ '^\\s*well\\s*worn\\s*pallett?\\s*(kft|zrt|bt)?\\s*$')`;

// MINDEN indulásnál (idempotens): bér fuvar (tipus='sajat'), aminek a
// megrendelője a SAJÁT cégünk — a Drive-import a "Megbízó adatai: Megbízott
// adatai:" hasábos fejlécet olvasta félre (az ÚJ importot a sajatCegunkE már
// védi). Ahol a fuvarhoz már tartozik kiállított számla, ott a helyes
// megrendelő egyértelmű: a számla vevője (szamla.vevo_nev) — ezt írjuk be, a
// megjegyzésbe pedig, hogy mi állt ott. Számla nélküli sornál nincs biztos
// forrás, azt csak naplózzuk (naplozFuvarHelyEllenorzest), a dokumentumból
// ember pótolja. Nem egyszeri, mert a számlaszám-szinkron később is tölthet
// számlaszámot egy ilyen sorra — akkor a következő indulás javítja.
async function javitsaSajatCegMegrendelotSzamlabol(pool) {
  const { rows } = await pool.query(
    `update fuvar_megbizasok f
     set megrendelo = s.vevo_nev,
         megjegyzes = coalesce(f.megjegyzes || ' | ', '') ||
           'Megrendelő javítva a ' || s.szamlaszam || ' számla vevője alapján (korábban a saját cégünk állt itt: ' || f.megrendelo || ').'
     from szamla s
     where s.szamlaszam = f.szamla_szam
       and f.statusz <> 'torolt'
       and f.tipus = 'sajat'
       and ${SAJAT_CEG_SQL("f.megrendelo")}
       and not ${SAJAT_CEG_SQL("s.vevo_nev")}
     returning f.id, s.vevo_nev`
  );
  console.log(
    `[migrate] saját cég megrendelőként → számla vevője: ${rows.length} sor` +
      (rows.length ? ": " + rows.map((r) => `#${r.id} → ${r.vevo_nev}`).join("; ") : ".")
  );
}

// Egyszeri javítás (2026-09-16): a számlával nem javítható, saját-céges
// megrendelőjű bér fuvarok — a Drive-dokumentumból kiolvasva (a 10:06-os
// deploy naplója sorolta őket). A drive_file_id a kulcs, nem az id, hogy
// egy esetleges újraimport se tévessze el. Csak azt a sort írja, amin MÉG a
// saját cégünk áll, tehát egy időközbeni kézi javítást nem ír felül.
//   - 1HuH-… (#102, 2026.09.02. Nyírjákó → Ikrény): a megbízó a
//     Hajdúspedíció Kft. (Heves) — a dokumentum fejléce és aláírója.
//   - 1M1Udt… (#120, 2026.09.14–15. Sopron → Budapest, poz. 26/3663): a
//     megbízó az ÁB Speed Szállítmányozási Kft. (Gór).
//   - 13S4o7… (#125): ugyanaz a pozíciószám (26/3663), útvonal és nap, mint
//     #120 (a dokumentuma már nincs meg a Drive-on) → ugyanaz a megbízó.
//     Valószínűleg duplikátum — ezt NEM dönti el a script, a napló
//     duplikátum-listája mutatja, a felhasználó dönt a törlésről.
async function javitsaMaradekSajatCegMegrendelotOnce(pool) {
  const JAVITAS_KOD = "sajat-ceg-megrendelo-dokumentumbol-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const javitasok = [
    { driveFileId: "1HuH-3TAbOJYVIQJN9k00Xl3YXUZLQj-y", megrendelo: "Hajdúspedíció Kft." },
    { driveFileId: "1M1Udt4vtGhomEb_ObQ60c8bxo5wG-eY0", megrendelo: "ÁB Speed Szállítmányozási Kft." },
    { driveFileId: "13S4o7-5WqkKRIjhzNQRFDy5mYRlJ7Zmb", megrendelo: "ÁB Speed Szállítmányozási Kft." },
  ];
  const erintett = [];
  for (const j of javitasok) {
    const { rows } = await pool.query(
      `update fuvar_megbizasok
       set megrendelo = $2,
           megjegyzes = coalesce(megjegyzes || ' | ', '') ||
             'Megrendelő javítva a Drive-dokumentum alapján (korábban a saját cégünk állt itt: ' || megrendelo || ').'
       where drive_file_id = $1 and statusz <> 'torolt' and ${SAJAT_CEG_SQL("megrendelo")}
       returning id`,
      [j.driveFileId, j.megrendelo]
    );
    for (const r of rows) erintett.push(`#${r.id} → ${j.megrendelo}`);
  }
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(`[migrate] saját cég megrendelőként → dokumentumból: ${erintett.length ? erintett.join("; ") : "0 sor"}.`);
}

// Egyszeri javítás (2026-09-16, Budaházi Zoltán jóváhagyásával): a
// duplikátum-kereső (naplozFuvarHelyEllenorzest) által kimutatott párok
// újabb példányának törlése. 11 pár ugyanazt a pozíciószámot ÉS ugyanazt a
// számlaszámot viseli (mindkettő postázva, archív) — ugyanaz a fuvar
// kétszer, a 2026-09-15-i újraimportból; a régebbi, kézzel felvitt sor
// marad. A #125 az ÁB Speed 26/3663 megbízás második példánya (#120 a
// párja), a dokumentuma már nincs a Drive-on.
// BIZTONSÁGI FELTÉTEL: csak akkor töröl, ha a sor MÉG MINDIG ugyanazt a
// pozíciószámot és számlaszámot viseli, mint a megmaradó párja, és a pár él
// — ha bármelyik időközben változott, a sor érintetlen marad, és a napló
// jelzi. A törlés státusz-váltás megjegyzéssel, visszaállítható.
async function toroljeDuplikatumSorokatOnce(pool) {
  const JAVITAS_KOD = "duplikatum-sorok-torlese-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  // [megmaradó, törlendő]
  const parok = [
    [1, 101], [2, 98], [3, 99], [4, 103], [9, 109], [10, 105],
    [11, 107], [12, 108], [13, 106], [14, 110], [22, 77], [120, 125],
  ];
  const torolt = [];
  const kihagyott = [];
  for (const [marad, torlendo] of parok) {
    const { rows } = await pool.query(
      `update fuvar_megbizasok t
       set statusz = 'torolt',
           megjegyzes = coalesce(t.megjegyzes || ' | ', '') ||
             'Duplikátum: a #' || m.id || ' sor második példánya (azonos pozíciószám' ||
             case when coalesce(t.szamla_szam, '') <> '' then ' és számlaszám ' || t.szamla_szam else '' end ||
             '), 2026-09-16-án töröltnek jelölve.'
       from fuvar_megbizasok m
       where t.id = $2 and m.id = $1
         and t.statusz <> 'torolt' and m.statusz <> 'torolt'
         and t.tipus = 'sajat' and m.tipus = 'sajat'
         and coalesce(t.pozicioszam, '') <> '' and t.pozicioszam = m.pozicioszam
         and coalesce(t.szamla_szam, '') = coalesce(m.szamla_szam, '')
       returning t.id`,
      [marad, torlendo]
    );
    if (rows.length) torolt.push(`#${torlendo} (párja #${marad})`);
    else kihagyott.push(`#${torlendo}/#${marad}`);
  }
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] duplikátum sorok töröltnek jelölve: ${torolt.length}${torolt.length ? " — " + torolt.join("; ") : ""}` +
      (kihagyott.length ? ` | KIHAGYVA (a feltétel már nem áll): ${kihagyott.join(", ")}` : "")
  );
}

// Egyszeri javítás (2026-09-16): a GPS-figyelés (lib/fuvarozas/
// teljesites-figyeles.ts) a felrakás napjától kereste a lerakóhoz érkezést,
// ezért az oda-vissza ingázó kocsi fuvarjait a lerakás ELŐTT jelölte
// Teljesítve-re — a Bér fuvarok folyamatban-lista emiatt ürült ki. A
// javított figyelés a lerakási ablak kezdetétől számol; ez a lépés a
// bizonyíthatóan korai jelöléseket vonja vissza: ahol a Teljesítve
// időpontja MEGELŐZI a megbízásban megadott lerakási ablak kezdetét. Csak
// számlázatlan, nem postázott sorokon; a sor a besorolás szerint vissza-
// kerül a folyamatban-listára (vagy elmúlt lerakásnál a Számla/Postára,
// ahol a javított GPS-figyelés újra megnézi).
async function vonjaVisszaKoraiTeljesitestOnce(pool) {
  const JAVITAS_KOD = "korai-gps-teljesites-visszavonas-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok
     set teljesitve = false, teljesitve_at = null,
         megjegyzes = coalesce(megjegyzes || ' | ', '') ||
           'A GPS-figyelés a lerakási ablak kezdete előtt jelölte Teljesítve-re (' ||
           to_char(teljesitve_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') || '), visszavonva 2026-09-16-án.'
     where tipus = 'sajat' and statusz <> 'torolt'
       and teljesitve and teljesitve_at is not null
       and lerakas_ablak_tol is not null
       and teljesitve_at < lerakas_ablak_tol
       and coalesce(szamla_szam, '') = '' and not postazva
     returning id, to_char(lerakas_ablak_tol at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as ablak`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] korai GPS-teljesítés visszavonva: ${rows.length} sor` +
      (rows.length ? " — " + rows.map((r) => `#${r.id} (ablak ${r.ablak}-tól)`).join("; ") : ".")
  );
}

// Egyszeri javítás (2026-09-16, 2. kör): ugyanaz a kocsi egy napon két azonos
// lerakójú fuvart vitt (#126 és #130, Pápa → Debrecen, NMZ-492), és a
// GPS-figyelés az ELSŐ érkezéskor mindkettőt lezárta — ugyanabban a percben
// (09-16 07:35). Egy kocsi egyszerre csak az egyiket rakhatta le. A javított
// figyelés (teljesites-figyeles.ts) az érkezéseket számolja; ez a lépés a
// kettős jelölést vonja vissza, hogy a javított figyelés újra eldöntse,
// melyik van kész. Feltétel: ugyanaz a jármű, ugyanaz a lerakó, ugyanaz a
// Teljesítve-időpont, számlázatlan, nem postázott — csak ilyen párokon.
async function vonjaVisszaKettosGpsTeljesitestOnce(pool) {
  // 2. kód: az első változat pontos időpont-egyezést kért, de a két
  // setFuvarTeljesitve hívás külön now()-t kapott (másodperc-eltérés), ezért
  // élesben 0 sort talált. Itt 2 percen belüli jelölés számít egyidejűnek.
  const JAVITAS_KOD = "kettos-gps-teljesites-visszavonas-2-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok f
     set teljesitve = false, teljesitve_at = null,
         megjegyzes = coalesce(f.megjegyzes || ' | ', '') ||
           'A GPS-figyelés ugyanabban a percben (' || to_char(f.teljesitve_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') ||
           ') két azonos lerakójú fuvart zárt le ugyanannál a kocsinál — visszavonva 2026-09-16-án, a javított figyelés dönt újra.'
     where f.tipus = 'sajat' and f.statusz <> 'torolt'
       and f.teljesitve and f.teljesitve_at is not null
       and coalesce(f.szamla_szam, '') = '' and not f.postazva
       and exists (
         select 1 from fuvar_megbizasok g
         where g.id <> f.id and g.tipus = 'sajat' and g.statusz <> 'torolt'
           and g.jarmu = f.jarmu and g.lerako = f.lerako
           and g.teljesitve_at is not null
           and abs(extract(epoch from (g.teljesitve_at - f.teljesitve_at))) < 120
       )
     returning f.id`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] kettős GPS-teljesítés visszavonva: ${rows.length} sor` +
      (rows.length ? " — " + rows.map((r) => `#${r.id}`).join(", ") : ".")
  );
}

// MINDEN indulásnál (nem egyszeri): a fuvar-besorolás ellenőrző számai a
// deploy-naplóba. Ugyanaz, amit a scripts/fuvar-hely-ujrasorolas.mts --check
// ír ki — az élesben kézzel nem futtatható (nincs kiadható adatbázis-
// elérés), ezért itt fut, és egy redeploy-jal bármikor újra lekérhető.
// A) és B) a rendezFuvarHelyeketOnce két adathibája; a cél mindkettőnél 0.
// A fülenkénti darabszám csak tájékoztató. A CASE a lib/fuvarozas/
// fuvar-hely.ts FUVAR_HELY_SQL másolata — a MÉRVADÓ az ottani; ha az
// változik, ezt is kövesd (a SQL/TS egyezést a --check script méri).
async function naplozFuvarHelyEllenorzest(pool) {
  try {
    const { rows } = await pool.query(
      `select
         count(*) filter (where postazva and postazva_at is null) as a,
         count(*) filter (where tipus = 'sajat' and coalesce(szamla_szam, '') <> ''
                            and not teljesitve and coalesce(lerakas_datum, datum) >= current_date) as b,
         count(*) filter (where tipus = 'sajat' and postazva and coalesce(szamla_szam, '') = '') as c,
         count(*) filter (where tipus = 'sajat' and postazva and coalesce(szamla_szam, '') <> '' and hely <> 'archiv') as d,
         count(*) filter (where tipus = 'sajat' and sajat_ceg_e) as sajat_ceg,
         string_agg(id::text, ', ' order by id) filter (where tipus = 'sajat' and sajat_ceg_e) as sajat_ceg_idk,
         count(*) filter (where hely <> 'archiv' and coalesce(megrendelo, '') = '') as megrendelo_nelkul,
         count(*) filter (where hely = 'ber_folyamatban') as ber_folyamatban,
         count(*) filter (where hely = 'sajat_folyamatban') as sajat_folyamatban,
         count(*) filter (where hely = 'szamla_posta') as szamla_posta,
         count(*) filter (where hely = 'archiv') as archiv
       from (
         select *,
           ${SAJAT_CEG_SQL("megrendelo")} as sajat_ceg_e,
           (case
              when (coalesce(szamla_szam, '') <> '' and postazva and coalesce(postazva_at, '-infinity'::timestamptz) <= now() - interval '5 minutes')
                or (tipus = 'ber' and (teljesitve or coalesce(lerakas_datum, datum) < current_date or coalesce(szamla_szam, '') <> ''))
                then 'archiv'
              when (teljesitve or coalesce(lerakas_datum, datum) < current_date or coalesce(szamla_szam, '') <> '')
                then 'szamla_posta'
              when tipus = 'ber' then 'sajat_folyamatban'
              else 'ber_folyamatban'
            end) as hely
         from fuvar_megbizasok
         where statusz <> 'torolt'
       ) f`
    );
    const r = rows[0];
    console.log(
      `[migrate] fuvar-hely ellenőrzés (cél: A=0, B=0, D=0): A) postázva postazva_at nélkül = ${r.a}, ` +
        `B) számlás, mégis folyamatban = ${r.b}, C) postázva számlaszám nélkül (Számla/Postán, számlázandó) = ${r.c}, ` +
        `D) számlás+postázott, mégsem archív (5 perces ablak) = ${r.d} — fülek: Bér folyamatban ${r.ber_folyamatban}, ` +
        `Saját folyamatban ${r.sajat_folyamatban}, Számla/Posta ${r.szamla_posta}, Archív ${r.archiv}.`
    );
    // Adatminőség (csak napló, NEM javít): bér fuvar, aminek a megrendelője a
    // saját cégünk — a hasábos fejléc félreolvasása (lásd sajatCegunkE); a
    // helyes megrendelőt a dokumentumból ember pótolja. Plusz az aktív fülek
    // megrendelő-nevei előfordulással, elírás/üres név átnézéséhez — az éles
    // adatbázis kívülről nem kérdezhető le, ezért itt látszik.
    console.log(
      `[migrate] fuvar-adatminőség: saját cég megrendelőként (bér fuvar) = ${r.sajat_ceg}` +
        (r.sajat_ceg_idk ? ` (#${r.sajat_ceg_idk.replaceAll(", ", ", #")})` : "") +
        `, megrendelő nélkül az aktív füleken = ${r.megrendelo_nelkul}.`
    );
    // A megmaradt (számlával nem javítható) saját-céges sorok azonosító
    // adatai — ebből lehet a dokumentumból/postázási címből pótolni a valódi
    // megrendelőt (db/fuvar-corrections.json, drive_file_id alapján).
    const { rows: sajatCeges } = await pool.query(
      `select id, to_char(coalesce(lerakas_datum, datum), 'YYYY-MM-DD') as nap, felrako, lerako,
         pozicioszam, postazasi_cim, szamla_szam, drive_file_id, dokumentum_url
       from fuvar_megbizasok
       where statusz <> 'torolt' and tipus = 'sajat' and ${SAJAT_CEG_SQL("megrendelo")}
       order by id`
    );
    for (const s of sajatCeges) {
      console.log(
        `[migrate]   saját-céges sor #${s.id} ${s.nap} ${s.felrako ?? "?"} → ${s.lerako} | poz: ${s.pozicioszam ?? "-"} | ` +
          `számla: ${s.szamla_szam ?? "-"} | postázási cím: ${(s.postazasi_cim ?? "-").replace(/\s+/g, " ").slice(0, 80)} | ` +
          `drive: ${s.drive_file_id ?? "-"} | ${s.dokumentum_url ?? "-"}`
      );
    }
    const { rows: nevek } = await pool.query(
      `select coalesce(nullif(megrendelo, ''), '(üres)') as nev, count(*)::int as db
       from fuvar_megbizasok
       where statusz <> 'torolt'
         and not (coalesce(szamla_szam, '') <> '' and postazva and coalesce(postazva_at, '-infinity'::timestamptz) <= now() - interval '5 minutes')
         and not (tipus = 'ber' and (teljesitve or coalesce(lerakas_datum, datum) < current_date or coalesce(szamla_szam, '') <> ''))
       group by 1 order by 2 desc, 1 limit 60`
    );
    console.log(`[migrate] aktív fülek megrendelői: ${nevek.map((n) => `${n.nev} (${n.db})`).join("; ")}`);
    // Friss bér fuvarok (csak napló): a folyamatban-lista üressége/tartalma
    // ebből ellenőrizhető — mikor jelölődött Teljesítve-re (GPS-figyelés
    // vagy kézi), és mi volt a tervezett lerakási időablak.
    const { rows: friss } = await pool.query(
      `select id, statusz, to_char(datum, 'YYYY-MM-DD') as nap, to_char(lerakas_datum, 'YYYY-MM-DD') as lerakas,
         to_char(lerakas_ablak_tol at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as ablak_tol,
         to_char(lerakas_ablak_ig at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as ablak_ig,
         teljesitve, to_char(teljesitve_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as teljesitve_kor,
         szamla_szam, jarmu, left(megrendelo, 20) as megrendelo, left(felrako, 25) as felrako, left(lerako, 25) as lerako
       from fuvar_megbizasok
       where tipus = 'sajat' and statusz <> 'torolt' and coalesce(lerakas_datum, datum) >= current_date - 4
       order by datum, id`
    );
    for (const s of friss) {
      console.log(
        `[migrate]   friss #${s.id} ${s.nap}${s.lerakas ? "→" + s.lerakas : ""} ${s.megrendelo ?? "-"} | ${s.felrako ?? "?"} → ${s.lerako} | ${s.jarmu ?? "-"} | ablak: ${s.ablak_tol ?? "-"}–${s.ablak_ig ?? "-"} | teljesítve: ${s.teljesitve ? s.teljesitve_kor ?? "igen" : "nem"} | számla: ${s.szamla_szam ?? "-"}`
      );
    }
    // Lehetséges duplikátumok a bér fuvarok közt (csak napló): azonos
    // pozíciószám, vagy azonos nap + felrakó + lerakó. Egy kétszer felvett
    // megbízás kétszer számlázható — ezért érdemes ránézni.
    // Két sor NEM duplikátum, ha mindkettőnek van Út ID-je és az eltér: a
    // Duvenbeck ugyanarra az útvonalra, ugyanarra a napra több megbízást is
    // adhat (pl. 2026-09-15 Pápa → Debrecen, H80F1 és H80F2 lerakó-kód).
    const { rows: dupok } = await pool.query(
      `select kulcs,
         string_agg('#' || id || ' (' || statusz
           || case when ellenorzott then ', ellenőrzött' else '' end
           || case when coalesce(szamla_szam, '') <> '' then ', számla ' || szamla_szam else ', nincs számla' end
           || case when postazva then ', postázva' else '' end
           || case when reise_id is not null then ', Út ID ' || reise_id else '' end
           || ')', '; ' order by id) as sorok
       from (
         select id, statusz, ellenorzott, szamla_szam, postazva, reise_id, 'poz. ' || pozicioszam as kulcs
         from fuvar_megbizasok
         where statusz <> 'torolt' and tipus = 'sajat' and coalesce(pozicioszam, '') <> ''
         union all
         select id, statusz, ellenorzott, szamla_szam, postazva, reise_id,
           to_char(datum, 'YYYY-MM-DD') || ' ' || coalesce(felrako, '?') || ' → ' || lerako
         from fuvar_megbizasok
         where statusz <> 'torolt' and tipus = 'sajat'
       ) k
       group by kulcs
       having count(*) > 1 and count(*) - count(distinct reise_id) > 0
       order by kulcs limit 40`
    );
    // Duvenbeck-átvilágítás (csak napló): a párban érkező iratok (TA =
    // megbízás, FRALI = rakománylista) egy sorba olvadtak-e. Soronként az
    // Út ID (reise_id), a hozzákötött iratok típusa/verziója/fájlneve.
    const { rows: duv } = await pool.query(
      `select f.id, f.statusz, to_char(f.datum, 'YYYY-MM-DD') as nap, f.reise_id, f.pozicioszam,
         f.szamla_szam, f.ellenorzott, f.drive_file_id, f.forras,
         left(f.felrako, 40) as felrako, left(f.lerako, 40) as lerako,
         (select string_agg(coalesce(d.tipus, '?') || ' v' || coalesce(d.verzio::text, '?') || ' ' || coalesce(d.fajlnev, d.drive_file_id), ' + ' order by d.id)
            from fuvar_dokumentumok d where d.fuvar_id = f.id) as iratok
       from fuvar_megbizasok f
       where f.tipus = 'sajat'
         and (f.megrendelo ilike '%duvenbeck%' or f.reise_id is not null or f.postazasi_cim ilike '%duvenbeck%'
              or exists (select 1 from fuvar_dokumentumok d where d.fuvar_id = f.id))
       order by f.id desc limit 40`
    );
    for (const s of duv) {
      console.log(
        `[migrate]   duvenbeck #${s.id} [${s.statusz}${s.ellenorzott ? ", ellenőrzött" : ""}] ${s.nap} ${s.felrako ?? "?"} → ${s.lerako} | Út ID: ${s.reise_id ?? "-"} | poz: ${s.pozicioszam ?? "-"} | számla: ${s.szamla_szam ?? "-"} | forrás: ${s.forras ?? "-"} | drive: ${s.drive_file_id ?? "-"} | iratok: ${s.iratok ?? "-"}`
      );
    }
    console.log(
      `[migrate] lehetséges duplikátum bér fuvarok: ${dupok.length}` +
        (dupok.length ? " — " + dupok.map((d) => `${d.kulcs.slice(0, 70)}: ${d.sorok}`).join(" | ") : ".")
    );
  } catch (e) {
    // Csak napló — az indulást nem akaszthatja meg.
    console.warn(`[migrate] fuvar-hely ellenőrzés nem futott le: ${e?.message ?? e}`);
  }
}

// Egyszeri javítás (2026-09-16): a meglévő fuvarok a Megbízások fülei közt a
// KÖZÖS besorolási szabály (lib/fuvarozas/fuvar-hely.ts) szerint. A szabály
// maga lekérdezés-időben érvényesül, ide csak az a két adathiány tartozik,
// amit a szabály nem tud magától kikövetkeztetni — ugyanaz, amit a
// scripts/fuvar-hely-ujrasorolas.mts --apply csinál (az élesben kézzel nem
// futtatható, ezért fut itt, a deploy indulásakor):
//   A) postazva = true, de postazva_at üres → a fuvar saját napja (mint a
//      db/archiv-backlog-cleanup.sql-nél), hogy az Archív időrendje ne
//      boruljon fel, és semmilyen szigorúbb szabály ne tartsa örökre a
//      Számla/Postán;
//   B) bér fuvar (tipus='sajat'), van számlaszáma, de nincs Teljesítve-nek
//      jelölve és a lerakás dátuma még nem múlt el → teljesitve = true, mert
//      számla csak kész munkáról készül; a régi besorolás ezeket a
//      "folyamatban" listán tartotta.
// Dátumot, számlaszámot, postázást NEM ír. A `returning` miatt a deploy-
// naplóban látszik, pontosan mely sorokat érintette.
async function rendezFuvarHelyeketOnce(pool) {
  const JAVITAS_KOD = "fuvar-hely-ujrasorolas-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows: a } = await pool.query(
    `update fuvar_megbizasok
     set postazva_at = coalesce(lerakas_datum, datum)::timestamptz
     where statusz <> 'torolt' and postazva and postazva_at is null
     returning id, to_char(coalesce(lerakas_datum, datum), 'YYYY-MM-DD') as nap, megrendelo, szamla_szam`
  );
  const { rows: b } = await pool.query(
    `update fuvar_megbizasok
     set teljesitve = true,
         teljesitve_at = coalesce(papirok_beerkeztek_at, postazva_at, now())
     where statusz <> 'torolt'
       and tipus = 'sajat'
       and coalesce(szamla_szam, '') <> ''
       and not teljesitve
       and coalesce(lerakas_datum, datum) >= current_date
     returning id, to_char(coalesce(lerakas_datum, datum), 'YYYY-MM-DD') as nap, megrendelo, szamla_szam`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  const sor = (r) => `#${r.id} ${r.nap} ${r.megrendelo ?? "-"} (számla: ${r.szamla_szam ?? "-"})`;
  console.log(`[migrate] fuvar-hely: ${a.length} sor postazva_at pótolva${a.length ? ": " + a.map(sor).join("; ") : "."}`);
  console.log(`[migrate] fuvar-hely: ${b.length} számlás sor Teljesítve-re jelölve${b.length ? ": " + b.map(sor).join("; ") : "."}`);
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

// Egyszeri javítás (2026-09-13): a BodoganGabor/VadonGabor felhasználók a
// seedUserOnce hívásuk ELSŐ (élesítéskori) lefutásakor még nem kapták meg az
// "elolegek_sajat" jogot (a modul csak utólag került be a dolgozói mobil
// Profil csempével) — ugyanaz a helyzet, mint grantKeszletSajatOnce-nél.
async function grantElolegekSajatOnce(pool) {
  const JAVITAS_KOD = "dolgozoi-profil-elolegek-sajat-2026-09-13";
  const { rows } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (rows.length > 0) return;

  await pool.query(
    `update users
     set permissions = permissions || '{"elolegek_sajat": {"view": true, "edit": true}}'::jsonb
     where username in ('BodoganGabor', 'VadonGabor')`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1)`, [JAVITAS_KOD]);
  console.log("[migrate] BodoganGabor és VadonGabor megkapták a saját előlegek jogot.");
}

// Egyszeri javítás (2026-09-15): a Duvenbeck-megbízások újraimportálásra
// jelölése.
//
// A Duvenbeck egy fuvarhoz két dokumentumot küld (Fuvar Megbízás + Rakomány-
// lista), amikből a régi, nyelvi modelles import külön-külön megbízás-sort
// csinált — egymásnak ellentmondó adatokkal, és a mappába kétszer feltöltött
// fájlból még eggyel. Az új, determinisztikus import (lásd
// lib/fuvarozas/duvenbeck.ts) ezeket egy sorba fűzi, de a MÁR beimportált
// sorokhoz nem nyúl: a szinkron a dokumentum_url alapján feldolgozottnak
// látja a fájlokat, és soha nem olvassa be őket újra.
//
// Ez a lépés ezért "töröltre" állítja az ÉRINTETLEN sorokat, és leveszi
// róluk a dokumentum-hivatkozást, hogy a következő szinkron újra beolvassa és
// helyesen párosítsa őket. Az adat nem vész el: a sor megmarad, és a
// megjegyzésbe bekerül az eredeti dokumentum linkje is.
//
// "Érintetlen" = amin még semmilyen emberi döntés vagy pénzügyi lépés nem
// történt: nincs jóváhagyva (ellenorzott = false), nincs számlaszáma, nincs
// beérkezett papírja, nincs postázva, nincs teljesítve, és egyetlen megállóját
// sem nyugtázta a sofőr. Bármelyik teljesül -> a sort békén hagyjuk, és a
// felhasználó dönt róla a felületen.
// A takarítás köreinek kódjai. Új kör akkor kell, ha az ÉRTELMEZŐ javult: az
// előző kör jelölése ilyenkor már be van írva, tehát a régi kód nem futna újra,
// a hibásan (még a nyelvi modellel) beolvasott sorok pedig bent maradnának.
//
// 1. kör (2026-09-15): a párosítás bevezetése.
// 2. kör (2026-09-15): az értelmező a valódi pdf-parse sortördelésre javítva —
//    az első kör után a szinkron még a régi úton hozta vissza a sorokat.
// Egyszeri javítás (2026-09-15): a KÉZZEL törölt Duvenbeck-sorok
// dokumentum-hivatkozásának feloldása.
//
// A felületi törlés (deleteFuvar) csak "torolt" státuszba teszi a sort, a
// dokumentum_url és a drive_file_id viszont rajta marad. A Drive-szinkron
// pedig ezekből állítja össze, hogy melyik fájlt dolgozta már fel — státuszra
// nem szűr. Emiatt egy kézzel törölt importot SOHA nem olvasna be újra.
//
// Ez alapesetben helyes: ha valaki kitöröl egy hibás importot, nem akarja,
// hogy óránként visszajöjjön. Most viszont pont az ellenkezője kell: a
// felhasználó azért törölte a régi úton (nyelvi modellel) beolvasott
// Duvenbeck-sorokat, hogy a javított értelmező újra beolvassa őket.
//
// A szűrés ezért szűk: csak törölt, Drive-ból jött Duvenbeck-sor, amit a
// determinisztikus értelmező még nem dolgozott fel (reise_id is null), és
// amihez nem tartozik kiállított számla — a számlázott sor hivatkozását nem
// szabad elvágni, mert azzal a számla és a fuvar kapcsolata veszne el.
async function feloldTorortDuvenbeckDokumentumokatOnce(pool) {
  const JAVITAS_KOD = "duvenbeck-torolt-dokumentum-felold-2026-09-15";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok f
     set megjegyzes = coalesce(f.megjegyzes || ' | ', '') ||
           'Kézi törlés után újraimportálásra felszabadítva, eredeti dokumentum: ' ||
           coalesce(f.dokumentum_url, '-'),
         dokumentum_url = null,
         drive_file_id = null
     where f.statusz = 'torolt'
       and f.forras = 'pdf_import'
       and f.reise_id is null
       and f.dokumentum_url is not null
       and coalesce(f.szamla_szam, '') = ''
       and (f.megrendelo ilike '%duvenbeck%' or f.postazasi_cim ilike '%duvenbeck%')
     returning f.id`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] ${rows.length} kézzel törölt Duvenbeck-sor dokumentuma felszabadítva újraimportálásra.`
  );
}

// Egyszeri javítás (2026-09-15): dokumentum nélküli duplikátum-sorok törlése.
//
// Egy korábbi hiba: ha a Drive-dokumentumot egy MÁR KISZÁMLÁZOTT sor fogta, a
// rendszer nem vette el tőle a hivatkozást (helyesen — azzal a számla és a
// fuvar kapcsolata veszne el), de az új sort ettől még létrehozta. Így a fuvar
// kétszer szerepelt: egyszer archívban, kiszámlázva, egyszer a "Papírra vár"
// listán — vagyis újra kiszámlázható állapotban.
//
// A determinisztikus úton felvett sor (reise_id is not null) mindig megkapja a
// dokumentuma hivatkozását. Ha egy ilyen soron NINCS dokumentum, az kizárólag
// ebből a hibából származhat. A számlaszámos sort itt sem bántjuk.
async function torolDokumentumNelkuliDuplikatumokatOnce(pool) {
  const JAVITAS_KOD = "duvenbeck-dokumentum-nelkuli-duplikatum-2026-09-15";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok
     set statusz = 'torolt',
         megjegyzes = coalesce(megjegyzes || ' | ', '') ||
           'Duplikátum: a fuvar dokumentumát egy már kiszámlázott sor tartja, ez a sor tévedésből jött létre.'
     where reise_id is not null
       and dokumentum_url is null
       and statusz <> 'torolt'
       and coalesce(szamla_szam, '') = ''
     returning id`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(`[migrate] ${rows.length} dokumentum nélküli duplikátum-sor törölve.`);
}

const DUVENBECK_UJRAIMPORT_KOROK = [
  "duvenbeck-parositas-ujraimport-2026-09-15",
  "duvenbeck-parositas-ujraimport-2-2026-09-15",
];

async function ujraimportalDuvenbeckSorokatOnce(pool, kodok) {
  const JAVITAS_KOD = kodok[kodok.length - 1];
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok f
     set statusz = 'torolt',
         megjegyzes = coalesce(f.megjegyzes || ' | ', '') ||
           'Duvenbeck-párosítás miatt újraimportálásra jelölve, eredeti dokumentum: ' ||
           coalesce(f.dokumentum_url, '-'),
         dokumentum_url = null,
         drive_file_id = null
     where f.forras = 'pdf_import'
       and f.statusz <> 'torolt'
       and f.reise_id is null
       and f.ellenorzott = false
       and (f.megrendelo ilike '%duvenbeck%' or f.postazasi_cim ilike '%duvenbeck%')
       and coalesce(f.szamla_szam, '') = ''
       and f.papirok_beerkeztek_at is null
       and f.postazva = false
       and f.teljesitve = false
       and not exists (
         select 1 from fuvar_megallo_allapot ma
         where ma.fuvar_id = f.id and ma.kesz = true
       )
     returning f.id`
  );
  // ON CONFLICT: a jelölés ellenőrzése és beírása között eltelik idő, és egy
  // merge után PÁRHUZAMOSAN két konténer indul (a Railway GitHub-kapcsolata és
  // a GitHub Actions is deployol). Enélkül a versenyt vesztő konténer
  // duplikált-kulcs hibával elszállna, és vele a "migrate && next start" is.
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] ${rows.length} érintetlen Duvenbeck-sor újraimportálásra jelölve (a következő Drive-szinkron párosítva hozza vissza őket).`
  );
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
