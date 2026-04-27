import pg from "pg";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  logger.error("Unexpected database pool error", err);
});

export type PoolClient = pg.PoolClient;

/** Execute a query and return rows. */
export async function query<T extends pg.QueryResultRow>(
  text: string,
  values?: unknown[]
): Promise<T[]> {
  const res = await pool.query<T>(text, values);
  return res.rows;
}

/** Execute inside a transaction. Rolls back on error. */
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
