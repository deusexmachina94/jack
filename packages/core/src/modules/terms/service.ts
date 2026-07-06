import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { domains, licenseTerms, licenseIngestions } from '../../db/schema.js';
import { contentHash } from '../../shared/hash.js';
import { AppError, notFound } from '../../shared/errors.js';
import type { Auditor } from '../../shared/audit-port.js';
import { nullAuditor } from '../../shared/audit-port.js';
import { parseRsl, type Policy } from './rsl.js';

export type LicenseTerm = typeof licenseTerms.$inferSelect;

export interface IngestInput {
  domainId: string;
  raw: string;
  sourceUrl?: string;
}

/**
 * Parse an RSL document and append a new immutable terms version for the domain,
 * superseding the previous current version. Malformed input is recorded in
 * license_ingestions and re-thrown (422) — never coerced to a default.
 */
export async function ingestTerms(
  db: Db,
  input: IngestInput,
  auditor: Auditor = nullAuditor,
): Promise<LicenseTerm> {
  const [domain] = await db.select().from(domains).where(eq(domains.id, input.domainId));
  if (!domain) throw notFound(`No domain ${input.domainId}`);

  let policy: Policy;
  try {
    policy = parseRsl(input.raw);
  } catch (err) {
    await db.insert(licenseIngestions).values({
      domainId: input.domainId,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      sourceUrl: input.sourceUrl ?? null,
    });
    throw err instanceof AppError ? err : new AppError(422, 'unprocessable', 'RSL ingestion failed');
  }

  const hash = contentHash(policy);

  const inserted = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(licenseTerms)
      .where(and(eq(licenseTerms.domainId, input.domainId), isNull(licenseTerms.supersededBy)))
      .orderBy(desc(licenseTerms.version))
      .limit(1);

    const version = current ? current.version + 1 : 1;

    const [row] = await tx.insert(licenseTerms).values({
      domainId: input.domainId,
      version,
      policy,
      raw: input.raw,
      contentHash: hash,
      sourceUrl: input.sourceUrl ?? null,
    }).returning();

    if (current) {
      await tx.update(licenseTerms)
        .set({ supersededBy: row!.id })
        .where(eq(licenseTerms.id, current.id));
    }

    await tx.insert(licenseIngestions).values({
      domainId: input.domainId,
      status: 'ok',
      sourceUrl: input.sourceUrl ?? null,
      termsId: row!.id,
    });

    return row!;
  });

  await auditor.appendEntry('terms_ingested', {
    domainId: input.domainId,
    domain: domain.domain,
    termsId: inserted.id,
    version: inserted.version,
    contentHash: inserted.contentHash,
  });

  return inserted;
}

/** The single current (non-superseded) terms row for a domain, if any. */
export async function getCurrentTerms(db: Db, domainId: string): Promise<LicenseTerm | undefined> {
  const [row] = await db.select().from(licenseTerms)
    .where(and(eq(licenseTerms.domainId, domainId), isNull(licenseTerms.supersededBy)))
    .limit(1);
  return row;
}
