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

  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] hiba:", err);
  process.exit(1);
});
