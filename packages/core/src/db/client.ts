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
  // Hosted Postgres (Render/Railway/Fly/Supabase) generally requires TLS. Opt in via
  // DATABASE_SSL=require, or an sslmode=require in the URL.
  const ssl = process.env.DATABASE_SSL === 'require' || /sslmode=require/.test(url)
    ? ('require' as const)
    : undefined;
  const sql = postgres(url, ssl ? { max: 10, ssl } : { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, close: async () => { await sql.end(); } };
}

export { schema };
