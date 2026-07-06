import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical.js';

/** SHA-256 hex digest of a UTF-8 string. Uses the platform crypto library. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Content hash of an arbitrary JSON value (sha256 over its canonical form). */
export function contentHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/** The audit chain link: entry_hash = sha256(canonical_json(payload) || prev_hash). */
export function entryHash(payload: unknown, prevHash: string): string {
  return sha256Hex(canonicalJson(payload) + prevHash);
}

/** Sentinel prev_hash for the first entry in the chain. */
export const GENESIS_HASH = 'GENESIS';
