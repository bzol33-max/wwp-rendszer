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

export async function withTransaction<R>(
  fn: (query: <T = unknown>(text: string, params?: unknown[]) => Promise<T[]>) => Promise<R>
): Promise<R> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(async (text, params) => {
      const res = await client.query(text, params);
      return res.rows;
    });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
