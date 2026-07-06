// Seed a realistic NZZ-shaped publisher so `/v1/verify` returns something demoable.
// Run after migrations:  pnpm db:migrate && pnpm exec tsx src/seed.ts
//
// Requires DATABASE_URL to point at a migrated Postgres.

import { eq } from 'drizzle-orm';
import { makeDb } from './db/client.js';
import { domains } from './db/schema.js';
import { createPublisher, addDomain } from './modules/registry/index.js';
import { ingestTerms } from './modules/terms/index.js';
import { AuditLog } from './modules/audit/index.js';
import { LocalKeyProvider } from './modules/tokens/index.js';

const NZZ_RSL = `<rsl><content url="https://nzz.ch/"><license>
    <permits type="usage">search</permits>
    <prohibits type="usage">ai-train</prohibits>
    <payment type="per-crawl" currency="CHF" amount="2.00"><usage>ai-input</usage></payment>
    <legal url="https://nzz.ch/agb"/>
  </license></content></rsl>`;

async function seed(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgres://brip:brip@localhost:5432/brip';
  const { db, close } = makeDb(url);
  const auditor = new AuditLog(db);
  await new LocalKeyProvider(db).init();

  try {
    const publisher = await createPublisher(db, { name: 'Neue Zürcher Zeitung', email: 'licensing@nzz.ch' });
    const domain = await addDomain(db, publisher.id, 'nzz.ch');
    // Seed shortcut: skip the live DNS round-trip and mark the domain verified.
    await db.update(domains).set({ status: 'verified', verifiedAt: new Date() }).where(eq(domains.id, domain.id));
    const terms = await ingestTerms(db, { domainId: domain.id, raw: NZZ_RSL, sourceUrl: 'https://nzz.ch/.well-known/rsl.xml' }, auditor);

    console.log(`Seeded ${domain.domain}: terms v${terms.version}, hash ${terms.contentHash.slice(0, 16)}…`);
    console.log('Try:  curl "http://localhost:3000/v1/verify?url=https://nzz.ch/a/1"');
  } finally {
    await close();
  }
}

seed().catch((err) => { console.error(err); process.exit(1); });
