import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../src/db/client.js';
import { makeTestDb } from './helpers/db.js';
import { createPublisher, addDomain } from '../src/modules/registry/index.js';
import { ingestTerms, getCurrentTerms, parseRsl } from '../src/modules/terms/index.js';
import { licenseTerms, licenseIngestions } from '../src/db/schema.js';

const rsl = {
  free: `<rsl><content url="https://x.io/"><license>
      <permits type="usage">search, ai-input, ai-train</permits>
    </license></content></rsl>`,
  attribution: `<rsl><content url="https://x.io/"><license>
      <permits type="usage">search, attribution</permits>
      <prohibits type="usage">ai-train</prohibits>
    </license></content></rsl>`,
  priced: `<rsl><content url="https://nzz.ch/"><license>
      <permits type="usage">search</permits>
      <prohibits type="usage">ai-train</prohibits>
      <payment type="per-crawl" currency="CHF" amount="2.00"><usage>ai-input</usage></payment>
      <legal url="https://nzz.ch/license"/>
    </license></content></rsl>`,
  denied: `<rsl><content url="https://x.io/"><license>
      <prohibits type="usage">ai-train, ai-input</prohibits>
    </license></content></rsl>`,
  malformed: `<rsl><content><license><permits>oops`,
};

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => { ({ db, close } = await makeTestDb()); });
afterEach(async () => { await close(); });

async function verifiedDomain(): Promise<string> {
  const pub = await createPublisher(db, { name: 'NZZ', email: 'ops@nzz.ch' });
  const d = await addDomain(db, pub.id, 'nzz.ch');
  return d.id;
}

describe('RSL parsing', () => {
  it('parses a free license', () => {
    const p = parseRsl(rsl.free);
    expect(p.usage['ai-train']).toBe('allowed');
    expect(p.pricing).toBeUndefined();
  });

  it('parses attribution + denial', () => {
    const p = parseRsl(rsl.attribution);
    expect(p.attribution).toBe(true);
    expect(p.usage['ai-train']).toBe('denied');
  });

  it('parses per-crawl pricing into integer minor units', () => {
    const p = parseRsl(rsl.priced);
    expect(p.pricing).toEqual({ unit: 'per-crawl', amountMinor: 200, currency: 'CHF' });
    expect(p.usage['ai-input']).toBe('priced');
    expect(p.licenseUrl).toBe('https://nzz.ch/license');
  });

  it('parses an ai-train denial', () => {
    expect(parseRsl(rsl.denied).usage['ai-train']).toBe('denied');
  });

  it('throws loudly on malformed XML', () => {
    expect(() => parseRsl(rsl.malformed)).toThrow(/Malformed XML|Missing/);
  });
});

describe('terms ingestion + immutability', () => {
  it('appends a version and supersedes the previous one', async () => {
    const domainId = await verifiedDomain();
    const v1 = await ingestTerms(db, { domainId, raw: rsl.free });
    const v2 = await ingestTerms(db, { domainId, raw: rsl.priced });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);

    const current = await getCurrentTerms(db, domainId);
    expect(current?.id).toBe(v2.id);

    // v1 is superseded and never mutated otherwise.
    const [reloadedV1] = await db.select().from(licenseTerms).where(eq(licenseTerms.id, v1.id));
    expect(reloadedV1?.supersededBy).toBe(v2.id);
    expect(reloadedV1?.contentHash).toBe(v1.contentHash);
  });

  it('records a malformed document as an ingestion error and does not create terms', async () => {
    const domainId = await verifiedDomain();
    await expect(ingestTerms(db, { domainId, raw: rsl.malformed })).rejects.toThrow();

    const terms = await db.select().from(licenseTerms).where(eq(licenseTerms.domainId, domainId));
    expect(terms).toHaveLength(0);

    const errors = await db.select().from(licenseIngestions)
      .where(and(eq(licenseIngestions.domainId, domainId), eq(licenseIngestions.status, 'error')));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.error).toMatch(/Malformed|Missing/);
  });

  it('produces a stable content hash for identical policy', async () => {
    const domainId = await verifiedDomain();
    const a = await ingestTerms(db, { domainId, raw: rsl.priced });
    const b = parseRsl(rsl.priced);
    const { contentHash } = await import('../src/shared/hash.js');
    expect(a.contentHash).toBe(contentHash(b));
  });
});
