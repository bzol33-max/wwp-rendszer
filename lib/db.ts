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
