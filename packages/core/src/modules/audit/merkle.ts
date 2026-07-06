import { sha256Hex } from '../../shared/hash.js';

export interface ProofStep {
  hash: string;
  position: 'left' | 'right';
}

const hashPair = (left: string, right: string): string => sha256Hex(left + right);

/** Merkle root over an ordered list of leaf hashes (hex). Odd nodes duplicate. */
export function merkleRoot(leaves: readonly string[]): string {
  if (leaves.length === 0) throw new Error('merkleRoot: no leaves');
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left; // duplicate last on odd count
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0]!;
}

/** Inclusion proof for the leaf at `index`: the sibling path from leaf to root. */
export function merkleProof(leaves: readonly string[], index: number): {
  root: string;
  leaf: string;
  path: ProofStep[];
} {
  if (index < 0 || index >= leaves.length) throw new Error('merkleProof: index out of range');
  const leaf = leaves[index]!;
  const path: ProofStep[] = [];
  let level = [...leaves];
  let idx = index;

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      if (i === idx || i + 1 === idx) {
        if (idx === i) path.push({ hash: right, position: 'right' });
        else path.push({ hash: left, position: 'left' });
      }
      next.push(hashPair(left, right));
    }
    idx = Math.floor(idx / 2);
    level = next;
  }
  return { root: level[0]!, leaf, path };
}

/** Recompute the root from a leaf + proof; used by independent verifiers. */
export function verifyProof(leaf: string, path: readonly ProofStep[], root: string): boolean {
  let acc = leaf;
  for (const step of path) {
    acc = step.position === 'right' ? hashPair(acc, step.hash) : hashPair(step.hash, acc);
  }
  return acc === root;
}
