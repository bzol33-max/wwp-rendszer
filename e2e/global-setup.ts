import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// A smoke-adatot csak helyi adatbázisba tölti. Bármilyen más hoszt (pl. az
// éles Railway DB) esetén leáll, mielőtt kapcsolódna.
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL hiányzik (.env.audit.local)");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`A smoke teszt csak helyi DB-n futhat, nem itt: ${host}`);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(path.join(__dirname, "fixtures", "smoke-adat.sql"), "utf8"));
  } finally {
    await client.end();
  }
}
