import { createHash } from 'node:crypto';

// Independent re-implementation of BRIP's hashing so verification does not trust
// the server's code (the whole point of a transparency proof). Mirrors
// packages/core/src/shared/hash.ts and modules/audit/merkle.ts.

const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

interface ProofStep { hash: string; position: 'left' | 'right' }

function recomputeRoot(leaf: string, path: readonly ProofStep[]): string {
  let acc = leaf;
  for (const step of path) {
    acc = step.position === 'right' ? sha256Hex(acc + step.hash) : sha256Hex(step.hash + acc);
  }
  return acc;
}

export interface ProofResponse {
  entry: { id: string; seq: number; entryHash: string };
  anchor: { merkleRoot: string; signature: string; fromSeq: number; toSeq: number };
  proof: { leaf: string; path: ProofStep[]; root: string };
}

export interface VerifyReport {
  ok: boolean;
  entryId: string;
  checks: { name: string; ok: boolean; detail?: string }[];
}

/** Verify an inclusion proof: leaf matches the entry, and the path rebuilds the anchored root. */
export function verifyProofResponse(res: ProofResponse): VerifyReport {
  const checks: VerifyReport['checks'] = [];

  checks.push({
    name: 'leaf matches entry hash',
    ok: res.proof.leaf === res.entry.entryHash,
    detail: `${res.proof.leaf.slice(0, 12)}… vs ${res.entry.entryHash.slice(0, 12)}…`,
  });

  const recomputed = recomputeRoot(res.proof.leaf, res.proof.path);
  checks.push({
    name: 'recomputed root equals proof root',
    ok: recomputed === res.proof.root,
    detail: recomputed.slice(0, 16) + '…',
  });
  checks.push({
    name: 'proof root equals anchored root',
    ok: res.proof.root === res.anchor.merkleRoot,
  });

  return { ok: checks.every((c) => c.ok), entryId: res.entry.id, checks };
}

/** Fetch a proof from a running BRIP instance and verify it independently. */
export async function auditVerify(
  baseUrl: string,
  entryId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyReport> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/transparency/entries/${entryId}/proof`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Proof fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as ProofResponse;
  return verifyProofResponse(body);
}

export function formatReport(report: VerifyReport): string {
  const lines = report.checks.map((c) => `  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  return [
    `audit verify — entry ${report.entryId}`,
    ...lines,
    report.ok ? 'RESULT: VERIFIED' : 'RESULT: FAILED',
  ].join('\n');
}
