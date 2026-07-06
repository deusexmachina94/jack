import { SignJWT, jwtVerify, createLocalJWKSet } from 'jose';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { certificates, accessEvents } from '../../db/schema.js';
import { unprocessable, notFound } from '../../shared/errors.js';
import { getDomainByName } from '../registry/service.js';
import { getCurrentTerms } from '../terms/service.js';
import type { KeyProvider } from '../tokens/keys.js';

export type Certificate = typeof certificates.$inferSelect;

export interface IssueCertInput {
  consumerId: string;
  domain: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Issue a signed provenance certificate binding a consumer to a domain's terms for
 * a period, attesting the number of verified access events (docs/SPEC.md §3.2).
 */
export async function issueCertificate(
  db: Db,
  keys: KeyProvider,
  input: IssueCertInput,
): Promise<{ certificate: Certificate; jws: string }> {
  if (input.periodEnd <= input.periodStart) throw unprocessable('periodEnd must be after periodStart');

  const domain = await getDomainByName(db, input.domain);
  if (!domain) throw unprocessable(`Unknown domain: ${input.domain}`);
  const terms = await getCurrentTerms(db, domain.id);
  if (!terms) throw unprocessable(`No published terms for ${input.domain}`);

  const events = await db.select().from(accessEvents).where(and(
    eq(accessEvents.domainId, domain.id),
    eq(accessEvents.consumerId, input.consumerId),
    gte(accessEvents.occurredAt, input.periodStart),
    lte(accessEvents.occurredAt, input.periodEnd),
  ));
  const eventCount = events.length;

  const claims = {
    kind: 'brip-provenance-certificate',
    consumer: input.consumerId,
    domain: domain.domain,
    termsId: terms.id,
    termsHash: terms.contentHash,
    period: { start: input.periodStart.toISOString(), end: input.periodEnd.toISOString() },
    eventCount,
  };

  const { kid, privateKey } = await keys.getActiveSigningKey();
  const jws = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
    .setIssuedAt()
    .sign(privateKey);

  const [row] = await db.insert(certificates).values({
    consumerId: input.consumerId,
    domainId: domain.id,
    termsId: terms.id,
    termsHash: terms.contentHash,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    eventCount,
    jws,
  }).returning();

  return { certificate: row!, jws };
}

export async function getCertificate(db: Db, certId: string): Promise<Certificate | undefined> {
  const [row] = await db.select().from(certificates).where(eq(certificates.id, certId));
  return row;
}

/** Public verification: the certificate's JWS validates against the current JWKS. */
export async function verifyCertificate(
  db: Db,
  keys: KeyProvider,
  certId: string,
): Promise<{ valid: boolean; claims?: Record<string, unknown>; reason?: string }> {
  const cert = await getCertificate(db, certId);
  if (!cert) throw notFound(`No certificate ${certId}`);

  try {
    const jwks = createLocalJWKSet(await keys.getPublicJwks());
    const { payload } = await jwtVerify(cert.jws, jwks, { algorithms: ['ES256'] });
    return { valid: true, claims: payload as Record<string, unknown> };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : 'verification failed' };
  }
}
