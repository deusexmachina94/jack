import { describe, it, expect } from 'vitest';
import { makeTestApp } from './helpers/app.js';
import { makeTestDb } from './helpers/db.js';
import { AuditLog } from '../src/modules/audit/index.js';
import { seedDemo } from '../src/seed.js';
import { getCurrentTerms } from '../src/modules/terms/index.js';
import { getDomainByName } from '../src/modules/registry/index.js';

describe('deploy boot paths', () => {
  it('serves the interactive demo page at /', async () => {
    const t = await makeTestApp();
    const res = await t.app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('/v1/verify');
    await t.close();
  });

  it('seedDemo is idempotent and leaves nzz.ch verified with terms', async () => {
    const { db, close } = await makeTestDb();
    const auditor = new AuditLog(db);

    await seedDemo(db, auditor);
    await seedDemo(db, auditor); // second boot must not error or duplicate

    const domain = await getDomainByName(db, 'nzz.ch');
    expect(domain?.status).toBe('verified');
    const terms = await getCurrentTerms(db, domain!.id);
    expect(terms?.version).toBe(1); // still one version, not re-appended
    await close();
  });
});
