import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Db } from '../src/db/client.js';
import { makeTestDb } from './helpers/db.js';
import { AuditLog, merkleRoot, merkleProof, verifyProof } from '../src/modules/audit/index.js';
import { LocalKeyProvider } from '../src/modules/tokens/index.js';
import { entryHash, GENESIS_HASH } from '../src/shared/hash.js';

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => { ({ db, close } = await makeTestDb()); });
afterEach(async () => { await close(); });

describe('audit hash chain', () => {
  it('links each entry to its predecessor', async () => {
    const audit = new AuditLog(db);
    const a = await audit.appendEntry('token_issued', { n: 1 });
    const b = await audit.appendEntry('token_issued', { n: 2 });

    expect(a.entryHash).toBe(entryHash({ n: 1 }, GENESIS_HASH));
    expect(b.entryHash).toBe(entryHash({ n: 2 }, a.entryHash));

    const { valid } = await audit.verifyChain();
    expect(valid).toBe(true);
  });

  it('detects tampering with a historic entry', async () => {
    const audit = new AuditLog(db);
    await audit.appendEntry('terms_ingested', { doc: 'a' });
    const target = await audit.appendEntry('terms_ingested', { doc: 'b' });
    await audit.appendEntry('terms_ingested', { doc: 'c' });

    // Mutate a committed payload out from under the chain.
    await db.execute(sql`update audit_entries set payload = '{"doc":"HACKED"}'::jsonb where id = ${target.id}`);

    const result = await audit.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(target.seq);
  });

  it('anchors entries and proves inclusion against the signed root', async () => {
    const audit = new AuditLog(db);
    const keys = new LocalKeyProvider(db);
    await keys.init();

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await audit.appendEntry('token_issued', { i })).id);

    const anchor = await audit.buildAnchor(keys);
    expect(anchor).not.toBeNull();
    expect(anchor!.merkleRoot).toMatch(/^[0-9a-f]{64}$/);

    const proof = await audit.getProof(ids[2]!);
    expect(proof).not.toBeNull();
    expect(proof!.proof.root).toBe(anchor!.merkleRoot);
    expect(verifyProof(proof!.proof.leaf, proof!.proof.path, proof!.proof.root)).toBe(true);

    // A wrong leaf must not verify against the same path/root.
    expect(verifyProof('deadbeef', proof!.proof.path, proof!.proof.root)).toBe(false);
  });
});

describe('merkle primitives', () => {
  it('round-trips proofs for every leaf', () => {
    const leaves = Array.from({ length: 7 }, (_, i) => entryHash({ i }, GENESIS_HASH));
    const root = merkleRoot(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const p = merkleProof(leaves, i);
      expect(p.root).toBe(root);
      expect(verifyProof(leaves[i]!, p.path, root)).toBe(true);
    }
  });
});
