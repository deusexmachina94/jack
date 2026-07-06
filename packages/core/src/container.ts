import { makeDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { nodeDnsResolver } from './modules/registry/index.js';
import { LocalKeyProvider } from './modules/tokens/index.js';
import { AuditLog } from './modules/audit/index.js';
import { seedDemo } from './seed.js';
import { buildApp, type AppDeps } from './app.js';
import type { FastifyInstance } from 'fastify';

/** Wire the production dependency graph from environment config. */
export async function buildContainer(): Promise<{ app: FastifyInstance; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL ?? 'postgres://brip:brip@localhost:5432/brip';
  const { db, close } = makeDb(url);

  // Apply migrations on boot unless explicitly disabled (one-tap deploys have no
  // separate migrate step). Already-applied migrations are skipped.
  if (process.env.RUN_MIGRATIONS !== 'false') await runMigrations(db);

  const keyProvider = new LocalKeyProvider(db, process.env.BRIP_SIGNING_KEY_PKCS8);
  await keyProvider.init();

  const auditor = new AuditLog(db);

  // Optionally load the NZZ demo publisher so a fresh public deploy is immediately
  // explorable at /v1/verify. Idempotent.
  if (process.env.SEED_ON_BOOT === 'true') await seedDemo(db, auditor);

  const deps: AppDeps = {
    db,
    dns: nodeDnsResolver,
    keyProvider,
    auditor,
    issuer: process.env.BRIP_ISSUER ?? 'https://brip.dev',
  };

  const app = await buildApp(deps);
  return { app, close };
}
