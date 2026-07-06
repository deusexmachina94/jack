import { describe, it, expect } from 'vitest';
import { run, help, VERSION } from '../src/index.js';
import { verifyProofResponse, type ProofResponse } from '../src/audit.js';
import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

describe('brip-cli', () => {
  it('prints help and exits 0 with no args', async () => {
    expect(await run([])).toBe(0);
  });

  it('reports version', async () => {
    expect(await run(['version'])).toBe(0);
    expect(help()).toContain(VERSION);
  });

  it('exits non-zero on unknown command', async () => {
    expect(await run(['frobnicate'])).toBe(1);
  });

  it('audit verify without flags shows usage and exits 1', async () => {
    expect(await run(['audit', 'verify'])).toBe(1);
  });
});

describe('independent proof verification', () => {
  it('accepts a valid inclusion proof and rejects a tampered one', () => {
    // Two leaves; root = sha(leafA + leafB). Prove leafA.
    const leafA = sha('a');
    const leafB = sha('b');
    const root = sha(leafA + leafB);
    const good: ProofResponse = {
      entry: { id: 'e1', seq: 1, entryHash: leafA },
      anchor: { merkleRoot: root, signature: 'jws', fromSeq: 1, toSeq: 2 },
      proof: { leaf: leafA, path: [{ hash: leafB, position: 'right' }], root },
    };
    expect(verifyProofResponse(good).ok).toBe(true);

    const tampered: ProofResponse = { ...good, entry: { ...good.entry, entryHash: sha('evil') } };
    expect(verifyProofResponse(tampered).ok).toBe(false);
  });
});
