import { SignJWT } from 'jose';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { auditEntries, transparencyAnchors } from '../../db/schema.js';
import { entryHash, GENESIS_HASH } from '../../shared/hash.js';
import type { Auditor } from '../../shared/audit-port.js';
import type { KeyProvider } from '../tokens/keys.js';
import { merkleRoot, merkleProof, type ProofStep } from './merkle.js';

export type AuditEntry = typeof auditEntries.$inferSelect;
export type Anchor = typeof transparencyAnchors.$inferSelect;

/**
 * Append-only, hash-chained audit log (docs/SPEC.md §5).
 * entry_hash = sha256(canonical_json(payload) || prev_hash).
 */
export class AuditLog implements Auditor {
  constructor(private readonly db: Db) {}

  async appendEntry(
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; seq: number; entryHash: string }> {
    // Serializable so prev_hash reflects a committed predecessor even under
    // concurrent appends (the DB aborts conflicting txns rather than fork the chain).
    return this.db.transaction(async (tx) => {
      const [last] = await tx.select().from(auditEntries)
        .orderBy(desc(auditEntries.seq)).limit(1);

      const prevHash = last?.entryHash ?? GENESIS_HASH;
      const hash = entryHash(payload, prevHash);

      const [row] = await tx.insert(auditEntries)
        .values({ kind, payload, prevHash, entryHash: hash })
        .returning();

      return { id: row!.id, seq: row!.seq, entryHash: row!.entryHash };
    }, { isolationLevel: 'serializable' });
  }

  /** Re-derive the whole chain and report the first seq (if any) that breaks. */
  async verifyChain(): Promise<{ valid: boolean; brokenAtSeq?: number }> {
    const rows = await this.db.select().from(auditEntries).orderBy(asc(auditEntries.seq));
    let prevHash = GENESIS_HASH;
    for (const row of rows) {
      const expected = entryHash(row.payload, prevHash);
      if (row.prevHash !== prevHash || row.entryHash !== expected) {
        return { valid: false, brokenAtSeq: row.seq };
      }
      prevHash = row.entryHash;
    }
    return { valid: true };
  }

  /** Build, sign, and store a Merkle anchor over all entries not yet anchored. */
  async buildAnchor(keys: KeyProvider): Promise<Anchor | null> {
    const [lastAnchor] = await this.db.select().from(transparencyAnchors)
      .orderBy(desc(transparencyAnchors.toSeq)).limit(1);
    const fromSeq = (lastAnchor?.toSeq ?? 0) + 1;

    const rows = await this.db.select().from(auditEntries)
      .where(gte(auditEntries.seq, fromSeq))
      .orderBy(asc(auditEntries.seq));
    if (rows.length === 0) return null;

    const root = merkleRoot(rows.map((r) => r.entryHash));
    const toSeq = rows[rows.length - 1]!.seq;

    const { kid, privateKey } = await keys.getActiveSigningKey();
    const signature = await new SignJWT({ root, fromSeq, toSeq })
      .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
      .setIssuedAt()
      .sign(privateKey);

    const [anchor] = await this.db.insert(transparencyAnchors)
      .values({ fromSeq, toSeq, merkleRoot: root, signature })
      .returning();
    return anchor!;
  }

  async listAnchors(limit = 50): Promise<Anchor[]> {
    return this.db.select().from(transparencyAnchors)
      .orderBy(desc(transparencyAnchors.toSeq)).limit(limit);
  }

  /** Merkle inclusion proof for an entry against the anchor that covers it. */
  async getProof(entryId: string): Promise<{
    entry: { id: string; seq: number; entryHash: string };
    anchor: Anchor;
    proof: { leaf: string; path: ProofStep[]; root: string };
  } | null> {
    const [entry] = await this.db.select().from(auditEntries).where(eq(auditEntries.id, entryId));
    if (!entry) return null;

    const [anchor] = await this.db.select().from(transparencyAnchors)
      .where(and(lte(transparencyAnchors.fromSeq, entry.seq), gte(transparencyAnchors.toSeq, entry.seq)))
      .limit(1);
    if (!anchor) return null;

    const rows = await this.db.select().from(auditEntries)
      .where(and(gte(auditEntries.seq, anchor.fromSeq), lte(auditEntries.seq, anchor.toSeq)))
      .orderBy(asc(auditEntries.seq));
    const index = rows.findIndex((r) => r.id === entryId);
    const { root, leaf, path } = merkleProof(rows.map((r) => r.entryHash), index);

    return {
      entry: { id: entry.id, seq: entry.seq, entryHash: entry.entryHash },
      anchor,
      proof: { leaf, path, root },
    };
  }
}
