import { makeDb } from './db/client.js';
import { nodeDnsResolver } from './modules/registry/index.js';
import { LocalKeyProvider } from './modules/tokens/index.js';
import { AuditLog } from './modules/audit/index.js';
import { buildApp, type AppDeps } from './app.js';
import type { FastifyInstance } from 'fastify';

/** Wire the production dependency graph from environment config. */
export async function buildContainer(): Promise<{ app: FastifyInstance; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL ?? 'postgres://brip:brip@localhost:5432/brip';
  const { db, close } = makeDb(url);

  const keyProvider = new LocalKeyProvider(db, process.env.BRIP_SIGNING_KEY_PKCS8);
  await keyProvider.init();

  const deps: AppDeps = {
    db,
    dns: nodeDnsResolver,
    keyProvider,
    auditor: new AuditLog(db),
    issuer: process.env.BRIP_ISSUER ?? 'https://brip.dev',
  };

  const app = await buildApp(deps);
  return { app, close };
}
