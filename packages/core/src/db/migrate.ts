import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client.js';

/** SQL migrations live in packages/core/drizzle (copied next to dist in the image). */
export const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/** Apply all pending migrations. Safe to run on every boot — already-applied ones are skipped. */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
