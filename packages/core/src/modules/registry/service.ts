import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { publishers, domains } from '../../db/schema.js';
import { badRequest, conflict, notFound } from '../../shared/errors.js';
import type { DnsResolver } from './dns.js';

export type Publisher = typeof publishers.$inferSelect;
export type Domain = typeof domains.$inferSelect;

/** DNS-TXT record name a publisher must set to prove control of a domain. */
export const challengeHost = (domain: string): string => `_brip.${domain}`;

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export async function createPublisher(
  db: Db,
  input: { name: string; email: string },
): Promise<Publisher> {
  const [row] = await db.insert(publishers).values(input).returning();
  return row!;
}

export async function addDomain(
  db: Db,
  publisherId: string,
  domainName: string,
): Promise<Domain> {
  const domain = domainName.trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) throw badRequest(`Not a valid domain: ${domainName}`);

  const [publisher] = await db.select().from(publishers).where(eq(publishers.id, publisherId));
  if (!publisher) throw notFound(`No publisher ${publisherId}`);

  const existing = await db.select().from(domains).where(eq(domains.domain, domain));
  if (existing.length) throw conflict(`Domain already claimed: ${domain}`);

  const challenge = `brip-verify=${randomBytes(16).toString('hex')}`;
  const [row] = await db.insert(domains)
    .values({ publisherId, domain, challenge, status: 'unverified' })
    .returning();
  return row!;
}

/**
 * Run the DNS-TXT check for a domain. Moves unverified/pending → verified when a
 * TXT record at `_brip.<domain>` matches the stored challenge; otherwise leaves the
 * domain in `pending` so it can be retried.
 */
export async function verifyDomain(
  db: Db,
  domainId: string,
  dns: DnsResolver,
): Promise<Domain> {
  const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
  if (!domain) throw notFound(`No domain ${domainId}`);
  if (domain.status === 'verified') return domain;

  let matched = false;
  try {
    const records = await dns.resolveTxt(challengeHost(domain.domain));
    const flat = records.map((chunks) => chunks.join(''));
    matched = flat.includes(domain.challenge);
  } catch {
    matched = false; // no record / lookup failure → not yet verified
  }

  const [updated] = await db.update(domains)
    .set(matched
      ? { status: 'verified', verifiedAt: new Date() }
      : { status: 'pending' })
    .where(eq(domains.id, domainId))
    .returning();
  return updated!;
}

export async function getDomainByName(db: Db, domain: string): Promise<Domain | undefined> {
  const [row] = await db.select().from(domains).where(eq(domains.domain, domain.toLowerCase()));
  return row;
}

export async function getDomainById(db: Db, id: string): Promise<Domain | undefined> {
  const [row] = await db.select().from(domains).where(eq(domains.id, id));
  return row;
}
