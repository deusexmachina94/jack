import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

/**
 * The database handle threaded through every service. Typed against the
 * postgres-js driver used at runtime; tests supply a pglite-backed instance
 * (structurally compatible) via the test harness.
 */
export type Db = PostgresJsDatabase<typeof schema>;

export function makeDb(url: string): { db: Db; close: () => Promise<void> } {
  const sql = postgres(url, { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, close: async () => { await sql.end(); } };
}

export { schema };
