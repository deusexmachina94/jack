import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../src/db/client.js';
import { makeTestDb } from './helpers/db.js';
import { createPublisher, addDomain } from '../src/modules/registry/index.js';
import { ingestTerms } from '../src/modules/terms/index.js';
import { aggregateUsage, recordAccessEvent, applicationFee } from '../src/modules/billing/index.js';
import { domains, usagePeriods } from '../src/db/schema.js';

const PRICED_RSL = `<rsl><content url="https://nzz.ch/"><license>
    <payment type="per-crawl" currency="CHF" amount="2.00"><usage>ai-input</usage></payment>
  </license></content></rsl>`;

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => { ({ db, close } = await makeTestDb()); });
afterEach(async () => { await close(); });

async function pricedDomain(): Promise<string> {
  const pub = await createPublisher(db, { name: 'NZZ', email: 'o@nzz.ch' });
  const d = await addDomain(db, pub.id, 'nzz.ch');
  await db.update(domains).set({ status: 'verified' }).where(eq(domains.id, d.id));
  await ingestTerms(db, { domainId: d.id, raw: PRICED_RSL });
  return d.id;
}

const WINDOW = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-02T00:00:00Z') };

describe('metering (Phase 4)', () => {
  it('prices access events by current terms into integer minor units', async () => {
    await pricedDomain();
    for (let i = 0; i < 3; i++) {
      await recordAccessEvent(db, { domain: 'nzz.ch', consumerId: 'acme-ai', url: `/a/${i}` });
    }
    // Backdate events into the window.
    await db.execute(
      // eslint-disable-next-line
      (await import('drizzle-orm')).sql`update access_events set occurred_at = ${WINDOW.start.toISOString()}`,
    );

    const periods = await aggregateUsage(db, WINDOW.start, WINDOW.end);
    expect(periods).toHaveLength(1);
    expect(periods[0]!.eventCount).toBe(3);
    expect(periods[0]!.amountMinor).toBe(600); // 3 × 200 rappen
    expect(periods[0]!.currency).toBe('CHF');
  });

  it('is idempotent: re-running the window does not double-bill', async () => {
    await pricedDomain();
    await recordAccessEvent(db, { domain: 'nzz.ch', consumerId: 'acme-ai' });
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`update access_events set occurred_at = ${WINDOW.start.toISOString()}`);

    await aggregateUsage(db, WINDOW.start, WINDOW.end);
    await aggregateUsage(db, WINDOW.start, WINDOW.end);

    const rows = await db.select().from(usagePeriods);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventCount).toBe(1);
    expect(rows[0]!.amountMinor).toBe(200);
  });

  it('computes the platform application fee in minor units', () => {
    expect(applicationFee(600, { applicationFeeBps: 500 })).toBe(30); // 5% of 600
    expect(applicationFee(199, { applicationFeeBps: 1000 })).toBe(20); // rounds
  });
});
