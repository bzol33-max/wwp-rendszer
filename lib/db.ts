import { Pool, types } from "pg";

// A numeric (pénz) oszlopok számként jöjjenek, ne szövegként: a fuvardíj
// 2026-10-04-től numeric(12,2) (020-as migráció), és a kód eddig is mindenhol
// Number()-rel olvasta a numeric értékeket. Ahol szöveg kell, a lekérdezés
// kifejezetten ::text-re alakít — azt ez nem érinti.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

declare global {
  // eslint-disable-next-line no-var
  var _wwpPool: Pool | undefined;
}

export const pool =
  global._wwpPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    // Ne várjon a végtelenségig szabad kapcsolatra, és egy elakadt lekérdezés
    // vagy félbehagyott tranzakció se fogja a kapcsolatot örökre (audit PERF-4).
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 60_000,
    idle_in_transaction_session_timeout: 60_000,
  });

// Egy tétlen kapcsolat hálózati hibája kezeletlen 'error' eseményként a
// teljes folyamatot leállítaná — itt csak naplózzuk, a pool új kapcsolatot nyit.
if (!global._wwpPool) {
  pool.on("error", (err) => console.error("[db] tétlen kapcsolat hibája:", err.message));
}

if (process.env.NODE_ENV !== "production") {
  global._wwpPool = pool;
}

export async function query<T = unknown>(text: string, params?: unknown[]) {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export type Querier = <T = unknown>(text: string, params?: unknown[]) => Promise<T[]>;

// Több összetartozó írás egy tranzakcióban: vagy mind rögzül, vagy (bármelyik
// lépés hibájánál) egyik sem. A `fn` a kapott `q`-val kérdezzen, ne a globális
// `query`-vel — az a poolból másik kapcsolatot venne, a tranzakción kívül.
export async function withTransaction<R>(fn: (q: Querier) => Promise<R>): Promise<R> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const q: Querier = async <T,>(text: string, params?: unknown[]) =>
      (await client.query(text, params)).rows as T[];
    const result = await fn(q);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * A `fn` csak akkor fut, ha egyetlen másik folyamat (vagy ugyanennek egy
 * korábbi, még futó köre) sem tartja ugyanazt a `kulcs`-ot — Postgres
 * advisory lockkal. Az ütemezők körei így nem futnak egymásra, és Railway
 * deploy-átfedésnél (két példány) sem duplázódnak (audit RACE-3/5).
 */
export async function egyetlenPeldanyban<T>(
  kulcs: number,
  fn: () => Promise<T>
): Promise<{ futott: true; eredmeny: T } | { futott: false }> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [kulcs]);
    if (!rows[0]?.ok) return { futott: false };
    try {
      return { futott: true, eredmeny: await fn() };
    } finally {
      await client.query("select pg_advisory_unlock($1)", [kulcs]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

/** Az egyetlenPeldanyban kulcsai — egy helyen, hogy ne ütközzenek. */
export const ZAR_KULCS = {
  teljesitesFigyeles: 72_001,
  szamlaSzinkron: 72_002,
  modellSzinkron: 72_003,
  driveSync: 72_004,
} as const;
