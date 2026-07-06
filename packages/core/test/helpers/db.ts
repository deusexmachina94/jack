import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../src/db/schema.js';
import type { Db } from '../../src/db/client.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/**
 * A fresh, isolated in-process Postgres (pglite, real PG compiled to WASM) with
 * all migrations applied. Each test gets its own database.
 */
export async function makeTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  // pglite and postgres-js expose the same drizzle query API but differ in their
  // driver result HKT, so the type systems don't see them as identical.
  return { db: db as unknown as Db, close: async () => { await client.close(); } };
}
