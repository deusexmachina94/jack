import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { Db } from '../../src/db/client.js';
import { makeTestDb } from './db.js';
import { fakeDnsResolver } from '../../src/modules/registry/dns.js';
import { LocalKeyProvider } from '../../src/modules/tokens/index.js';
import { AuditLog } from '../../src/modules/audit/index.js';

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  keyProvider: LocalKeyProvider;
  auditor: AuditLog;
  /** Live TXT record map; mutate to make domain verification pass. */
  dnsRecords: Record<string, string[]>;
  issuer: string;
  close: () => Promise<void>;
}

export async function makeTestApp(): Promise<TestApp> {
  process.env.LOG_LEVEL ??= 'silent';
  const { db, close } = await makeTestDb();
  const keyProvider = new LocalKeyProvider(db);
  await keyProvider.init();
  const auditor = new AuditLog(db);
  const dnsRecords: Record<string, string[]> = {};
  const dns = fakeDnsResolver(dnsRecords);
  const issuer = 'https://brip.test';

  const app = await buildApp({ db, dns, keyProvider, auditor, issuer });
  return {
    app, db, keyProvider, auditor, dnsRecords, issuer,
    close: async () => { await app.close(); await close(); },
  };
}
