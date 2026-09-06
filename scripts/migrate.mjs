// Induláskor lefutó, biztonságosan újrafuttatható migráció:
// - a séma mindig alkalmazódik (IF NOT EXISTS / ON CONFLICT DO NOTHING)
// - a demó seed csak első indításkor fut le (ha még nincs egy mozgás sem)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

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

  const { rows } = await pool.query("select count(*)::int as n from keszlet_movements");
  if (rows[0].n === 0) {
    const seed = readFileSync(path.join(dbDir, "seed.sql"), "utf8");
    await pool.query(seed);
    console.log("[migrate] demó adatok betöltve.");
  } else {
    console.log("[migrate] már van adat, seed kihagyva.");
  }

  await applyKapcsolatokUpdates(pool, dbDir);
  await applyPoziciszamUpdates(pool, dbDir);
  await applyFuvarCorrections(pool, dbDir);
  await applyPostazasiCimUpdates(pool, dbDir);

  await pool.end();
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

main().catch((err) => {
  console.error("[migrate] hiba:", err);
  process.exit(1);
});
