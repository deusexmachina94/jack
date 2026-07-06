// Seed a realistic NZZ-shaped publisher so `/v1/verify` returns something demoable.
// Reusable + idempotent: safe to call on every boot (skips if already seeded).
//
// Standalone:  pnpm db:migrate && pnpm exec tsx src/seed.ts   (needs DATABASE_URL)

import { eq } from 'drizzle-orm';
import { makeDb, type Db } from './db/client.js';
import { domains } from './db/schema.js';
import { createPublisher, addDomain, getDomainByName } from './modules/registry/index.js';
import { ingestTerms, getCurrentTerms } from './modules/terms/index.js';
import { AuditLog } from './modules/audit/index.js';
import { LocalKeyProvider } from './modules/tokens/index.js';
import type { Auditor } from './shared/audit-port.js';

const NZZ_RSL = `<rsl><content url="https://nzz.ch/"><license>
    <permits type="usage">search</permits>
    <prohibits type="usage">ai-train</prohibits>
    <payment type="per-crawl" currency="CHF" amount="2.00"><usage>ai-input</usage></payment>
    <legal url="https://nzz.ch/agb"/>
  </license></content></rsl>`;

/** Idempotently seed the NZZ demo publisher/domain/terms. Returns the domain name. */
export async function seedDemo(db: Db, auditor: Auditor): Promise<string> {
  const existing = await getDomainByName(db, 'nzz.ch');
  if (existing) {
    const terms = await getCurrentTerms(db, existing.id);
    if (terms) return existing.domain; // already seeded
  }

  const publisher = existing
    ? undefined
    : await createPublisher(db, { name: 'Neue Zürcher Zeitung', email: 'licensing@nzz.ch' });

  const domain = existing ?? await addDomain(db, publisher!.id, 'nzz.ch');
  // Seed shortcut: skip the live DNS round-trip and mark the domain verified.
  await db.update(domains).set({ status: 'verified', verifiedAt: new Date() }).where(eq(domains.id, domain.id));
  await ingestTerms(db, { domainId: domain.id, raw: NZZ_RSL, sourceUrl: 'https://nzz.ch/.well-known/rsl.xml' }, auditor);
  return domain.domain;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgres://brip:brip@localhost:5432/brip';
  const { db, close } = makeDb(url);
  await new LocalKeyProvider(db).init();
  try {
    const domain = await seedDemo(db, new AuditLog(db));
    console.log(`Seeded ${domain}. Try: curl "http://localhost:3000/v1/verify?url=https://${domain}/a/1"`);
  } finally {
    await close();
  }
}

// Run only when invoked directly, not when imported by the container boot path.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
