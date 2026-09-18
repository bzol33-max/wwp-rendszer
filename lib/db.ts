import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _wwpPool: Pool | undefined;
}

export const pool =
  global._wwpPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

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
