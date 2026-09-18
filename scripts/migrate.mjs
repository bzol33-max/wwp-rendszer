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
  await applyKontokivonatEvesImportOnce(pool, dbDir);
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
  // 2026-09-17: a két sofőr fiók a 09-13-i seed után törlődött (a lépés
  // rögzítve maradt, ezért a seed nem hozta újra létre). A dolgozói mobil
  // sofőr nézetéhez (lásd docs/sofor-mobil-terv.md) kell a fiók ÉS az
  // alkalmazott-hozzárendelés — a Felhasználók oldal az utóbbit nem tudja
  // beállítani, ezért itt, a seeddel. A jelszó a SEED_* env változóból jön.
  await seedUserOnce(pool, {
    code: "user-vadongergo-2026-09-17",
    username: "VadonGergo",
    password: process.env.SEED_VADONGERGO_PASSWORD,
    name: "Vadon Gergő",
    role: "sofor",
    permissions: soforPermissions,
    employeeName: "Vadon Gergő",
  });
  await seedUserOnce(pool, {
    code: "user-takacsmiklos-2026-09-17",
    username: "TakacsMiklos",
    password: process.env.SEED_TAKACSMIKLOS_PASSWORD,
    name: "Takács Miklós",
    role: "sofor",
    permissions: soforPermissions,
    employeeName: "Takács Micó",
  });
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
  await vonjaVisszaKorokKoztiKettosGpsTeljesitestOnce(pool);
  await vonjaVisszaGeokodSavosKettosLezarastOnce(pool);
  await vonjaVisszaKetAllasosKettosLezarastOnce(pool);
  await toroljeEgybemosottGpsErinteseketOnce(pool);
  await szabaditsaFelTorortRbtMegbizastOnce(pool);
  await szabaditsaFelTorortBbLogisticMegbizastOnce(pool);
  await toroljeMasodpeldanyokatOnce(pool);
  await toroljeMasodpeldanyokat2Once(pool);
  await naplozFuvarHelyEllenorzest(pool);
  await ellenorizSoforFiokokat(pool);

  await pool.end();
}

// Sofőr fiókok ellenőrzése (2026-09-17, minden indításkor): a dolgozói mobil
// /erkezes nézet a users.employee_id-ből tudja, melyik alkalmazott (és így
// melyik kocsi) a bejelentkezett sofőr. A seedUserOnce a létrehozáskor NÉV
// szerint kereste az alkalmazottat — ha akkor még nem volt ilyen nevű sor,
// vagy más írásmóddal szerepelt, a hivatkozás NULL maradt, és a sofőr
// "Nincs jogosultságod" üzenetet kap. Ez a lépés kiírja a sofőr fiókok
// állapotát, és ha a hivatkozás hiányzik, de a név alapján egyértelmű az
// alkalmazott, pótolja. Meglévő hivatkozáshoz nem nyúl.
async function ellenorizSoforFiokokat(pool) {
  // employeeNames: a pontos nevek, amik előfordulhatnak a törzsadatban;
  // vezeteknev: tartalék, ha egyetlen ilyen vezetéknevű alkalmazott van.
  const soforok = [
    { username: "VadonGergo", employeeNames: ["Vadon Gergő"], vezeteknev: "Vadon" },
    { username: "TakacsMiklos", employeeNames: ["Takács Micó", "Takács Miklós"], vezeteknev: "Takács" },
  ];
  for (const s of soforok) {
    const { rows } = await pool.query(
      `select u.id, u.active, u.role, u.employee_id, a.name as employee_name, u.permissions
         from users u left join alkalmazottak a on a.id = u.employee_id
        where u.username = $1`,
      [s.username]
    );
    const u = rows[0];
    if (!u) {
      console.warn(`[migrate] sofőr fiók HIÁNYZIK: ${s.username} — a seed nem futott le (SEED_* jelszó env?).`);
      continue;
    }
    if (!u.employee_id) {
      const { rows: jeloltek } = await pool.query(
        `select id, name from alkalmazottak
          where name = any($1::text[]) or name ilike $2
          order by (name = any($1::text[])) desc, id`,
        [s.employeeNames, `${s.vezeteknev}%`]
      );
      if (jeloltek.length === 1 || (jeloltek.length > 1 && s.employeeNames.includes(jeloltek[0].name))) {
        await pool.query(`update users set employee_id = $2 where id = $1 and employee_id is null`, [u.id, jeloltek[0].id]);
        console.log(`[migrate] sofőr fiók ${s.username}: alkalmazott-hozzárendelés pótolva → "${jeloltek[0].name}".`);
        continue;
      }
      console.warn(
        `[migrate] sofőr fiók ${s.username}: NINCS alkalmazott hozzárendelve, és név alapján nem egyértelmű (${jeloltek.map((j) => j.name).join(", ") || "nincs találat"}).`
      );
      continue;
    }
    const perm = u.permissions ?? {};
    const ok = ["erkezes", "fuvarozas_sajat"].map((k) => `${k}: ${perm[k]?.view ? "látja" : "NEM látja"}/${perm[k]?.edit ? "írhat" : "nem írhat"}`);
    console.log(
      `[migrate] sofőr fiók ${s.username}: ${u.active ? "aktív" : "INAKTÍV"}, szerep ${u.role}, alkalmazott "${u.employee_name}" | ${ok.join(" | ")}`
    );
  }
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

// Egyszeri javítás (2026-09-16, 3. eset): a kettős lezárás KÜLÖN körökben
// is előjött — a 13:05-ös kör a #126-ot zárta le (egy érkezés a BMW
// Debrecen lerakóhoz, NMZ-492), a 13:20-as kör pedig ugyanazt az érkezést a
// #130-nak adta, mert a körönkénti számláló a #126-ot már nem látta. A
// visszaút (#128, Debrecen → Pápa) nincs kész, tehát második érkezés nem
// volt. A #130 jelölését visszavonjuk, a javított figyelés (a korábban
// lezárt fuvarok érkezését is elhasználtnak számolja) dönt újra. Csak a
// számlátlan, nem postázott, a 13:15–13:25 (budapesti idő, 11:15–11:25 UTC)
// közt jelölt #130-ra hat. (Az első kód UTC-nek vette a napló budapesti
// időpontját, ezért 0 sort talált — ez a 2. kód a helyes ablakkal.)
async function vonjaVisszaKorokKoztiKettosGpsTeljesitestOnce(pool) {
  const JAVITAS_KOD = "korok-kozti-kettos-gps-teljesites-visszavonas-130-2-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok f
     set teljesitve = false, teljesitve_at = null,
         megjegyzes = coalesce(f.megjegyzes || ' | ', '') ||
           'A GPS-figyelés a #126 lezárása után 15 perccel ugyanazt az érkezést ennek a fuvarnak is beszámította (' ||
           to_char(f.teljesitve_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') ||
           ') — visszavonva 2026-09-16-án, a javított figyelés dönt újra.'
     where f.id = 130 and f.tipus = 'sajat' and f.statusz <> 'torolt'
       and f.teljesitve and f.teljesitve_at between '2026-09-16T11:15:00Z' and '2026-09-16T11:25:00Z'
       and coalesce(f.szamla_szam, '') = '' and not f.postazva
     returning f.id`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] körök közti kettős GPS-teljesítés visszavonva: ${rows.length} sor` +
      (rows.length ? " — " + rows.map((r) => `#${r.id}`).join(", ") : ".")
  );
}

// Egyszeri javítás (2026-09-16, 4. eset): a közös felismerés első köre
// (18:46) a #130 debreceni lerakását zárta le, miközben a kocsi 13:09 óta
// Pápán állt. Ok: a #126 és a #130 azonos BMW-címe pár tíz méterrel eltérő
// koordinátára geokódolódott, és a párosítás a méterekkel közelebbi #130-nak
// adta az egyetlen hajnali megállást a korábbi #126 helyett. A párosítás
// javítva (fél km-es sávon belül a fuvar sorrendje dönt); a #130 jelölését
// visszavonjuk, a javított felismerés dönt újra. Csak a számlátlan, nem
// postázott, 16:40–16:50 (UTC) közt jelölt #130-ra hat.
async function vonjaVisszaGeokodSavosKettosLezarastOnce(pool) {
  const JAVITAS_KOD = "geokod-savos-kettos-lezaras-visszavonas-130-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok f
     set teljesitve = false, teljesitve_at = null,
         megjegyzes = coalesce(f.megjegyzes || ' | ', '') ||
           'A GPS-felismerés a hajnali debreceni megállást ennek a fuvarnak adta a #126 helyett (' ||
           to_char(f.teljesitve_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') ||
           ', a kocsi ekkor Pápán állt) — visszavonva 2026-09-16-án, a javított felismerés dönt újra.'
     where f.id = 130 and f.tipus = 'sajat' and f.statusz <> 'torolt'
       and f.teljesitve and f.teljesitve_at between '2026-09-16T16:40:00Z' and '2026-09-16T16:50:00Z'
       and coalesce(f.szamla_szam, '') = '' and not f.postazva
     returning f.id`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] geokód-sávos kettős lezárás visszavonva: ${rows.length} sor` +
      (rows.length ? " — " + rows.map((r) => `#${r.id}`).join(", ") : ".")
  );
}

// Egyszeri javítás (2026-09-16, 5. eset): a debreceni BMW-nél a kocsi két
// állást produkált (15:59→04:33 a portánál, majd 1,6 km-rel arrébb
// 04:53→07:15), közben nem hagyta el a telepet — a felismerés ezt két
// látogatásnak vette, és a másodikat a #130-nak adta (19:04), miközben a
// kocsi Pápán állt. A felismerés javítva (egy címnél az egymást követő
// állások egy látogatás, amíg a kocsi nem távolodott 3 km-nél messzebb);
// a #130 jelölését visszavonjuk. Csak a számlátlan, nem postázott,
// 17:00–17:10 (UTC) közt jelölt #130-ra hat.
async function vonjaVisszaKetAllasosKettosLezarastOnce(pool) {
  const JAVITAS_KOD = "ket-allasos-kettos-lezaras-visszavonas-130-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok f
     set teljesitve = false, teljesitve_at = null,
         megjegyzes = coalesce(f.megjegyzes || ' | ', '') ||
           'A GPS-felismerés a BMW-n belüli második állást külön érkezésnek vette és ennek a fuvarnak adta (' ||
           to_char(f.teljesitve_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') ||
           ', a kocsi ekkor Pápán állt) — visszavonva 2026-09-16-án, a javított felismerés dönt újra.'
     where f.id = 130 and f.tipus = 'sajat' and f.statusz <> 'torolt'
       and f.teljesitve and f.teljesitve_at between '2026-09-16T17:00:00Z' and '2026-09-16T17:10:00Z'
       and coalesce(f.szamla_szam, '') = '' and not f.postazva
     returning f.id`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] két-állásos kettős lezárás visszavonva: ${rows.length} sor` +
      (rows.length ? " — " + rows.map((r) => `#${r.id}`).join(", ") : ".")
  );
}

// Egyszeri javítás (2026-09-17): az érintés-napló "monoton" (least/greatest)
// szabálya két külön pápai látogatást egybemosott: a #128 lerakója és a
// #130 felrakója a #126 09-15 06:58-as felrakási érkezését kapta a saját
// 09-16 13:09-es érkezésük helyett, a #130 lerakója pedig a #126 debreceni
// látogatását. A három sor GPS-mezőit töröljük; a figyelő (3 napos ablak)
// a következő körben a helyes értékeket írja vissza. A kézi jelölést nem
// érinti.
async function toroljeEgybemosottGpsErinteseketOnce(pool) {
  const JAVITAS_KOD = "egybemosott-gps-erintesek-torlese-2026-09-17";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megallo_allapot
     set gps_erkezes = null, gps_tavozas = null
     where (fuvar_id, megallo_index) in ((128, 1), (130, 0), (130, 1))
     returning fuvar_id, megallo_index`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] egybemosott GPS-érintések törölve: ${rows.length} sor` +
      (rows.length ? " — " + rows.map((r) => `#${r.fuvar_id}/${r.megallo_index}`).join(", ") : ".")
  );
}

// Egyszeri javítás (2026-09-18): a "02215-2026.pdf" (BB-Logistic, 2026.09.21.
// Nyíradony → Füzesabony) sora (#136) a 09-17-i importban fordított
// felrakó/lerakóval és a felrakó céget megrendelőként kapta; a felhasználó
// törölte, hogy a frissítés újra beolvassa — de a törölt sor fogja a
// Drive-fájlt, ezért a szinkron "ismertnek" veszi. A hivatkozás
// felszabadítása után a következő kör a SpediTrans-olvasóval (koordinátás
// felrakó/lerakó, partnersablon adja a megrendelőt) újra felveszi. Ugyanaz a
// minta, mint szabaditsaFelTorortRbtMegbizastOnce; csak a törölt, számlátlan
// sorra hat.
async function szabaditsaFelTorortBbLogisticMegbizastOnce(pool) {
  const JAVITAS_KOD = "bb-logistic-poz-002215-ujraimport-2026-09-18";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok
     set megjegyzes = coalesce(megjegyzes || ' | ', '') ||
           'Kézi törlés után újraimportálásra felszabadítva 2026-09-18-án, eredeti dokumentum: ' || coalesce(dokumentum_url, '-'),
         dokumentum_url = null,
         drive_file_id = null
     where drive_file_id = '1IfZIiGsWmKuePbnJmE6fcA4iLOkRSlSm'
       and statusz = 'torolt'
       and coalesce(szamla_szam, '') = ''
     returning id`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] BB-Logistic poz 002215 dokumentuma újraimportálásra felszabadítva: ${rows.length} sor${rows.length ? " (#" + rows.map((r) => r.id).join(", #") + ")" : ""}.`
  );
}

// Egyszeri javítás (2026-09-16): a "Megbízás (poz 3003).pdf" (RBT Europe,
// 2026.09.17. Téglás → Gyöngyös) sora (#121) a 09-15-i importban a saját
// cégünket kapta megrendelőnek, és törölve lett. A törölt sor viszont
// továbbra is fogja a Drive-fájlt (drive_file_id / dokumentum_url), ezért a
// szinkron "ismertnek" veszi, és soha nem importálja újra — a holnapi fuvar
// így egyik fülön sincs. Ugyanaz a minta, mint a Duvenbecknél
// (feloldTorortDuvenbeckDokumentumokatOnce): a hivatkozás felszabadítása
// után a következő szinkron-kör a javított importtal (RBT Europe
// partnersablon adja a megrendelőt) újra felveszi. Csak a törölt, számlátlan
// sorra hat.
async function szabaditsaFelTorortRbtMegbizastOnce(pool) {
  const JAVITAS_KOD = "rbt-poz-3003-ujraimport-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { rows } = await pool.query(
    `update fuvar_megbizasok
     set megjegyzes = coalesce(megjegyzes || ' | ', '') ||
           'Kézi törlés után újraimportálásra felszabadítva 2026-09-16-án, eredeti dokumentum: ' || coalesce(dokumentum_url, '-'),
         dokumentum_url = null,
         drive_file_id = null
     where drive_file_id = '1hcPwYW3xi-45lHiTiq0vOT1iHEEGO2gZ'
       and statusz = 'torolt'
       and coalesce(szamla_szam, '') = ''
     returning id`
  );
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] RBT poz 3003 dokumentuma újraimportálásra felszabadítva: ${rows.length} sor${rows.length ? " (#" + rows.map((r) => r.id).join(", #") + ")" : ""}.`
  );
}

// Egyszeri javítás (2026-09-16, Budaházi Zoltán jóváhagyásával): a Drive-mappa
// és az adatbázis összevetése három iratnál KÉT élő sort mutatott:
//   - Fuvarmegbízás_0000129953.pdf (HAPP): #5 (kézi, 09-04) és #112 (import,
//     09-13) — ugyanaz a számla (WLLWR-2026-281) mindkettőn;
//   - 09.03. Pázmándfalu–Nagyhegyes docx (Hajdúspedíció): #42 és #100;
//   - 09.02. Nyírjákó–Ikrény, docx (#76) és pdf (#102) változat (Hajdúspedíció).
// A #100 és #102 az a két számlázatlan sor, amit a reggeli javítás a
// Számla/Postára tett vissza — valójában a kiszámlázott #42/#76 másodpéldányai.
// A számlázott/régebbi példány marad. BIZTONSÁGI FELTÉTEL: a HAPP-párnál
// azonos számlaszám; a Hajdúspedíció-pároknál a megmaradó sornak VAN
// számlája, a törlendőnek nincs, és a felrakás napja azonos — ha nem áll,
// a sor érintetlen marad, a napló jelzi.
async function toroljeMasodpeldanyokatOnce(pool) {
  const JAVITAS_KOD = "masodpeldany-sorok-torlese-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const parok = [
    { marad: 5, torlendo: 112, feltetel: `coalesce(t.szamla_szam, '') <> '' and t.szamla_szam = m.szamla_szam` },
    { marad: 42, torlendo: 100, feltetel: `coalesce(m.szamla_szam, '') <> '' and coalesce(t.szamla_szam, '') = '' and t.datum = m.datum` },
    { marad: 76, torlendo: 102, feltetel: `coalesce(m.szamla_szam, '') <> '' and coalesce(t.szamla_szam, '') = '' and t.datum = m.datum` },
  ];
  await toroljeParokat(pool, JAVITAS_KOD, parok, "másodpéldány sorok töröltnek jelölve");
}

// 2. kör (2026-09-16): az első kör a Hajdúspedíció-párokat kihagyta, mert
// időközben a #100 és #102 is számlát kapott — ugyanazt, mint a párja
// (#42/#100: WLLWR-2026-285, #76/#102: WLLWR-2026-284). Nem kétszeri
// számlázás, ugyanaz a számla mindkét példányon, mint a HAPP-párnál. A
// feltétel ezért itt az azonos számlaszám.
async function toroljeMasodpeldanyokat2Once(pool) {
  const JAVITAS_KOD = "masodpeldany-sorok-torlese-2-2026-09-16";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;
  const parok = [
    { marad: 42, torlendo: 100, feltetel: `coalesce(t.szamla_szam, '') <> '' and t.szamla_szam = m.szamla_szam and t.datum = m.datum` },
    { marad: 76, torlendo: 102, feltetel: `coalesce(t.szamla_szam, '') <> '' and t.szamla_szam = m.szamla_szam and t.datum = m.datum` },
  ];
  await toroljeParokat(pool, JAVITAS_KOD, parok, "másodpéldány sorok töröltnek jelölve (2. kör)");
}

async function toroljeParokat(pool, JAVITAS_KOD, parok, cimke) {
  const torolt = [];
  const kihagyott = [];
  for (const p of parok) {
    const { rows } = await pool.query(
      `update fuvar_megbizasok t
       set statusz = 'torolt',
           megjegyzes = coalesce(t.megjegyzes || ' | ', '') ||
             'Másodpéldány: ugyanaz a megbízás, mint a #' || m.id || ' sor' ||
             case when coalesce(m.szamla_szam, '') <> '' then ' (számla: ' || m.szamla_szam || ')' else '' end ||
             ', 2026-09-16-án töröltnek jelölve.'
       from fuvar_megbizasok m
       where t.id = $2 and m.id = $1
         and t.statusz <> 'torolt' and m.statusz <> 'torolt'
         and t.tipus = 'sajat' and m.tipus = 'sajat'
         and ${p.feltetel}
       returning t.id`,
      [p.marad, p.torlendo]
    );
    if (rows.length) torolt.push(`#${p.torlendo} (párja #${p.marad})`);
    else kihagyott.push(`#${p.torlendo}/#${p.marad}`);
  }
  await pool.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
    JAVITAS_KOD,
  ]);
  console.log(
    `[migrate] ${cimke}: ${torolt.length}${torolt.length ? " — " + torolt.join("; ") : ""}` +
      (kihagyott.length ? ` | KIHAGYVA (a feltétel nem áll): ${kihagyott.join(", ")}` : "")
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
                            and not teljesitve and coalesce(lerakas_datum, datum) >= (now() at time zone 'Europe/Budapest')::date) as b,
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
                or (tipus = 'ber' and (teljesitve or coalesce(lerakas_datum, datum) < (now() at time zone 'Europe/Budapest')::date or coalesce(szamla_szam, '') <> ''))
                then 'archiv'
              when (teljesitve or coalesce(lerakas_datum, datum) < (now() at time zone 'Europe/Budapest')::date or coalesce(szamla_szam, '') <> '')
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
         and not (tipus = 'ber' and (teljesitve or coalesce(lerakas_datum, datum) < (now() at time zone 'Europe/Budapest')::date or coalesce(szamla_szam, '') <> ''))
       group by 1 order by 2 desc, 1 limit 60`
    );
    console.log(`[migrate] aktív fülek megrendelői: ${nevek.map((n) => `${n.nev} (${n.db})`).join("; ")}`);
    // Import-napló (csak napló): az utolsó 7 nap iratai — mit csinált velük a
    // Drive-szinkron (verdikt, kifogások, létrejött sor). "Ezzel a fájllal mi
    // van?" kérdésre innen látszik a válasz.
    const { rows: iratok } = await pool.query(
      `select drive_file_id, fajlnev, partner_kod, olvaso, verdikt, kifogasok, fuvar_id,
         to_char(created_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as mikor
       from fuvar_import_naplo
       where created_at >= now() - interval '7 days' and coalesce(verdikt, '') <> 'regi_import'
       order by created_at desc limit 40`
    );
    for (const i of iratok) {
      const kifogasok = Array.isArray(i.kifogasok) ? i.kifogasok.join(" / ") : "";
      console.log(
        `[migrate]   import ${i.mikor} ${i.fajlnev ?? i.drive_file_id} | ${i.partner_kod ?? "-"} | ${i.olvaso ?? "-"} | ${i.verdikt ?? "-"} | sor: ${i.fuvar_id ? "#" + i.fuvar_id : "-"}${kifogasok ? " | " + kifogasok.slice(0, 200) : ""}`
      );
    }
    // Drive-fájl → sor megfeleltetés (csak napló): minden Drive-azonosító,
    // amit az adatbázis ismer (fuvar sor, csatolt irat, import-napló), az
    // élő és a törölt sorokkal és az import-verdikttel. A Drive-mappa
    // listájával összevetve látszik, melyik irat maradt feldolgozatlanul.
    const { rows: driveFajlok } = await pool.query(
      `with idk as (
         select drive_file_id from fuvar_megbizasok where drive_file_id is not null
         union select drive_file_id from fuvar_dokumentumok
         union select drive_file_id from fuvar_import_naplo
       )
       select i.drive_file_id,
         coalesce((select n.fajlnev from fuvar_import_naplo n where n.drive_file_id = i.drive_file_id),
                  (select d.fajlnev from fuvar_dokumentumok d where d.drive_file_id = i.drive_file_id limit 1)) as fajlnev,
         (select string_agg('#' || f.id, ',') from fuvar_megbizasok f
            where (f.drive_file_id = i.drive_file_id or f.dokumentum_url like '%' || i.drive_file_id || '%') and f.statusz <> 'torolt') as elo,
         (select string_agg('#' || f.id, ',') from fuvar_megbizasok f
            where (f.drive_file_id = i.drive_file_id or f.dokumentum_url like '%' || i.drive_file_id || '%') and f.statusz = 'torolt') as torolt,
         (select string_agg('#' || d.fuvar_id, ',') from fuvar_dokumentumok d join fuvar_megbizasok f on f.id = d.fuvar_id and f.statusz <> 'torolt' where d.drive_file_id = i.drive_file_id) as csatolva,
         (select n.verdikt from fuvar_import_naplo n where n.drive_file_id = i.drive_file_id) as verdikt,
         (select n.fuvar_id from fuvar_import_naplo n where n.drive_file_id = i.drive_file_id) as naplo_sor
       from idk i order by fajlnev nulls last`
    );
    for (const d of driveFajlok) {
      console.log(
        `[migrate]   drive ${d.drive_file_id} | ${d.fajlnev ?? "?"} | élő: ${d.elo ?? "-"} | csatolva: ${d.csatolva ?? "-"} | törölt: ${d.torolt ?? "-"} | napló: ${d.verdikt ?? "-"}${d.naplo_sor ? " #" + d.naplo_sor : ""}`
      );
    }
    // Egy dokumentum → több élő sor (csak napló): ugyanahhoz a Drive-fájlhoz
    // (azonosító vagy URL szerint, ill. ugyanazon megbízás docx+pdf párja)
    // két élő sor = ugyanaz a fuvar kétszer. A sorok állapotával, hogy a
    // döntés (melyik marad) megalapozott legyen.
    const { rows: tobbSoros } = await pool.query(
      `with kulcs as (
         select f.id, coalesce(f.drive_file_id, substring(f.dokumentum_url from '(?:file/d/|id=)([^/&?#]+)')) as fajl
         from fuvar_megbizasok f where f.statusz <> 'torolt' and f.tipus = 'sajat'
       ), tobb as (
         select fajl from kulcs where fajl is not null group by fajl having count(*) > 1
       )
       select k.fajl, f.id, to_char(f.datum, 'YYYY-MM-DD') as nap, left(f.megrendelo, 22) as megrendelo,
         f.pozicioszam, f.szamla_szam, f.postazva, f.teljesitve, f.ellenorzott,
         left(f.felrako, 20) as felrako, left(f.lerako, 20) as lerako, f.fuvardij,
         to_char(f.created_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as mikor
       from tobb t join kulcs k on k.fajl = t.fajl join fuvar_megbizasok f on f.id = k.id
       order by t.fajl, f.id`
    );
    for (const s of tobbSoros) {
      console.log(
        `[migrate]   több sor egy irathoz ${s.fajl} → #${s.id} (${s.mikor}) ${s.nap} ${s.megrendelo ?? "-"} | ${s.felrako ?? "?"} → ${s.lerako} | poz: ${s.pozicioszam ?? "-"} | díj: ${s.fuvardij ?? "-"} | számla: ${s.szamla_szam ?? "-"}${s.postazva ? " | postázva" : ""}${s.teljesitve ? " | teljesítve" : ""}${s.ellenorzott ? " | ellenőrzött" : ""}`
      );
    }
    // Az utolsó 7 napban LÉTREJÖTT sorok, a töröltek is (csak napló): egy
    // eltűnt fuvar itt látszik a megjegyzésével — ki/mi törölte és miért.
    const { rows: ujSorok } = await pool.query(
      `select id, statusz, tipus, to_char(datum, 'YYYY-MM-DD') as nap, left(megrendelo, 22) as megrendelo,
         pozicioszam, ellenorzott, forras, drive_file_id, left(megjegyzes, 160) as megjegyzes,
         to_char(created_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as mikor
       from fuvar_megbizasok
       where created_at >= now() - interval '7 days'
       order by created_at desc limit 40`
    );
    for (const s of ujSorok) {
      console.log(
        `[migrate]   új sor ${s.mikor} #${s.id} [${s.statusz}${s.ellenorzott ? ", ellenőrzött" : ""}, ${s.tipus}] ${s.nap} ${s.megrendelo ?? "-"} | poz: ${s.pozicioszam ?? "-"} | ${s.forras ?? "-"} | drive: ${s.drive_file_id ?? "-"}${s.megjegyzes ? " | " + s.megjegyzes : ""}`
      );
    }
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
    // Megálló-szintű állapotok az elmúlt napok fuvarjaira (csak napló): a
    // kézi jelölés (sofőr mobil / GPS lap pipa: kesz, kesz_by, kesz_at) és a
    // GPS-érintés (gps_erkezes/gps_tavozas) egymás mellett — ebből látszik,
    // ki mit pipált ki, és egyezik-e a GPS-szel.
    const { rows: megallok } = await pool.query(
      `select a.fuvar_id, a.megallo_index, a.kesz, a.kesz_by,
         to_char(a.kesz_at at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as kesz_kor,
         to_char(a.gps_erkezes at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as gps_erk,
         to_char(a.gps_tavozas at time zone 'Europe/Budapest', 'MM-DD HH24:MI') as gps_tav,
         f.tipus, f.teljesitve, left(f.megrendelo, 20) as megrendelo
       from fuvar_megallo_allapot a
       join fuvar_megbizasok f on f.id = a.fuvar_id
       where f.statusz <> 'torolt' and coalesce(f.lerakas_datum, f.datum) >= (now() at time zone 'Europe/Budapest')::date - 4
       order by a.fuvar_id, a.megallo_index`
    );
    for (const m of megallok) {
      console.log(
        `[migrate]   megálló #${m.fuvar_id}/${m.megallo_index} [${m.tipus}${m.teljesitve ? ", fuvar Teljesítve" : ""}] ${m.megrendelo ?? "-"} | kézi: ${m.kesz ? `kész (${m.kesz_by ?? "?"}, ${m.kesz_kor ?? "?"})` : "-"} | GPS: érk ${m.gps_erk ?? "-"} táv ${m.gps_tav ?? "-"}`
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
         union all
         -- azonos nap + megrendelő: a docx+pdf párban felvett megbízást a
         -- címszöveg eltérése miatt az útvonal-kulcs nem fogja meg
         select id, statusz, ellenorzott, szamla_szam, postazva, reise_id,
           to_char(datum, 'YYYY-MM-DD') || ' megrendelő: ' || lower(regexp_replace(megrendelo, '[^[:alnum:]]', '', 'g'))
         from fuvar_megbizasok
         where statusz <> 'torolt' and tipus = 'sajat' and coalesce(megrendelo, '') <> ''
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

// Egyszeri betöltés (2026-09-17): a 2026-os éves banki anyag (UniCredit
// HISTORY xlsx-ek + CIB havi PDF kivonatok) párosítása, ahogy a
// Kontókivonat-feltöltés "Fizetés dátumának pontosítása" szakasza adná — így
// nem kell kézzel feltölteni. A db/kontokivonat-eves-2026.json-t a
// lib/szamlak/kontokivonat-parositas.ts generálta az éles adatokon; csak
// "datum" állapotú tételeket tartalmaz (már fizetett, banki utalással még nem
// igazolt számlák). Budaházi Zoltán döntése: fizetetlen csak az maradjon,
// ami most is az — ez a lépés a "fizetve" jelölést SOHA nem változtatja,
// csak a fizetés dátumát állítja az utalás értéknapjára, és felírja az
// utalást a kontokivonat_konyvelt táblába (egy későbbi feltöltés így nem
// könyveli újra). Egy tranzakcióban fut; ha egy tétel számlái nem egyeznek
// (nincs meg, nem fizetett, sztornó), a tétel kimarad és naplózódik.
async function applyKontokivonatEvesImportOnce(pool, dbDir) {
  const JAVITAS_KOD = "kontokivonat-eves-import-2026-09-17";
  const { rows: mar } = await pool.query(`select 1 from alkalmazott_javitasok where kod = $1`, [JAVITAS_KOD]);
  if (mar.length > 0) return;

  const { tetelek } = JSON.parse(readFileSync(path.join(dbDir, "kontokivonat-eves-2026.json"), "utf8"));
  const client = await pool.connect();
  let felirva = 0;
  let datumFrissitve = 0;
  const kihagyott = [];
  try {
    await client.query("begin");
    for (const t of tetelek) {
      const { rows: szamlak } = await client.query(
        `select id from szamla
         where szamlaszam = any($1::text[]) and fizetve and not sztorno and not sztornozva`,
        [t.szamlaszamok]
      );
      if (szamlak.length !== t.szamlaszamok.length) {
        kihagyott.push(`${t.datum} ${t.partnerNev} ${t.szamlaszamok.join(",")} (számla nem fizetett / nincs meg)`);
        continue;
      }
      const idk = szamlak.map((s) => s.id);
      const { rows: uj } = await client.query(
        `insert into kontokivonat_konyvelt (kulcs, datum, osszeg, penznem, partner_nev, kozlemeny, szamla_idk, konyvelte)
         values ($1, $2::date, $3, $4, $5, $6, $7::bigint[], 'eves-import-2026')
         on conflict (kulcs) do nothing
         returning kulcs`,
        [t.kulcs, t.datum, t.osszeg, t.penznem, t.partnerNev, t.kozlemeny, idk]
      );
      if (uj.length === 0) {
        kihagyott.push(`${t.datum} ${t.partnerNev} ${t.szamlaszamok.join(",")} (utalás már könyvelve)`);
        continue;
      }
      felirva++;
      const { rowCount } = await client.query(
        `update szamla s
         set fizetve_datum = ($2::date)::timestamp at time zone 'Europe/Budapest'
         where s.id = any($1::bigint[])
           and s.fizetve
           and not exists (
             select 1 from kontokivonat_konyvelt k
             where s.id = any(k.szamla_idk) and k.kulcs <> $3
           )`,
        [idk, t.datum, t.kulcs]
      );
      datumFrissitve += rowCount ?? 0;
    }
    await client.query(`insert into alkalmazott_javitasok (kod) values ($1) on conflict (kod) do nothing`, [
      JAVITAS_KOD,
    ]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  console.log(
    `[migrate] kontókivonat éves import: ${felirva}/${tetelek.length} utalás felírva, ${datumFrissitve} számla fizetési dátuma pontosítva` +
      (kihagyott.length ? `; kihagyva: ${kihagyott.join("; ")}` : ".")
  );
}

main().catch((err) => {
  console.error("[migrate] hiba:", err);
  process.exit(1);
});
