// Aggregated Drizzle schema for BRIP core (docs/SPEC.md §2).
//
// The DB schema is shared infrastructure, not module-private state. Modules still
// obey the isolation rule at the *service* layer (they call each other's exported
// functions, never reach into another module's service internals). Foreign keys
// across module boundaries live here where drizzle-kit can see the whole graph.

import {
  pgTable, uuid, text, integer, bigint, boolean, timestamp, jsonb, bigserial, index,
} from 'drizzle-orm/pg-core';

// ── registry ────────────────────────────────────────────────────────────────
export const publishers = pgTable('publishers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const domains = pgTable('domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  publisherId: uuid('publisher_id').notNull().references(() => publishers.id),
  domain: text('domain').notNull().unique(),
  status: text('status', { enum: ['unverified', 'pending', 'verified'] })
    .notNull().default('unverified'),
  challenge: text('challenge').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── terms ────────────────────────────────────────────────────────────────────
export const licenseTerms = pgTable('license_terms', {
  id: uuid('id').defaultRandom().primaryKey(),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  version: integer('version').notNull(),
  policy: jsonb('policy').notNull(),
  raw: text('raw').notNull(),
  contentHash: text('content_hash').notNull(),
  sourceUrl: text('source_url'),
  supersededBy: uuid('superseded_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  domainIdx: index('license_terms_domain_idx').on(t.domainId),
}));

export const licenseIngestions = pgTable('license_ingestions', {
  id: uuid('id').defaultRandom().primaryKey(),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  status: text('status', { enum: ['ok', 'error'] }).notNull(),
  error: text('error'),
  sourceUrl: text('source_url'),
  termsId: uuid('terms_id').references(() => licenseTerms.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── tokens / keys ─────────────────────────────────────────────────────────────
export const signingKeys = pgTable('signing_keys', {
  kid: text('kid').primaryKey(),
  publicJwk: jsonb('public_jwk').notNull(),
  alg: text('alg').notNull().default('ES256'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accessTokens = pgTable('access_tokens', {
  jti: uuid('jti').defaultRandom().primaryKey(),
  consumerId: text('consumer_id').notNull(),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  termsId: uuid('terms_id').references(() => licenseTerms.id),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ── audit ─────────────────────────────────────────────────────────────────────
export const auditEntries = pgTable('audit_entries', {
  seq: bigserial('seq', { mode: 'number' }).primaryKey(),
  id: uuid('id').defaultRandom().notNull().unique(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  prevHash: text('prev_hash').notNull(),
  entryHash: text('entry_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transparencyAnchors = pgTable('transparency_anchors', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromSeq: bigint('from_seq', { mode: 'number' }).notNull(),
  toSeq: bigint('to_seq', { mode: 'number' }).notNull(),
  merkleRoot: text('merkle_root').notNull(),
  signature: text('signature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── certificates ──────────────────────────────────────────────────────────────
export const certificates = pgTable('certificates', {
  id: uuid('id').defaultRandom().primaryKey(),
  consumerId: text('consumer_id').notNull(),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  termsId: uuid('terms_id').notNull().references(() => licenseTerms.id),
  termsHash: text('terms_hash').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  eventCount: integer('event_count').notNull().default(0),
  jws: text('jws').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── billing ───────────────────────────────────────────────────────────────────
export const accessEvents = pgTable('access_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  consumerId: text('consumer_id'),
  tokenJti: uuid('token_jti'),
  userAgent: text('user_agent'),
  url: text('url'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usagePeriods = pgTable('usage_periods', {
  id: uuid('id').defaultRandom().primaryKey(),
  domainId: uuid('domain_id').notNull().references(() => domains.id),
  consumerId: text('consumer_id').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  eventCount: integer('event_count').notNull().default(0),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull().default(0),
  currency: text('currency'),
  status: text('status', { enum: ['open', 'invoiced'] }).notNull().default('open'),
});

export type DbSchema = {
  publishers: typeof publishers;
  domains: typeof domains;
  licenseTerms: typeof licenseTerms;
  licenseIngestions: typeof licenseIngestions;
  signingKeys: typeof signingKeys;
  accessTokens: typeof accessTokens;
  auditEntries: typeof auditEntries;
  transparencyAnchors: typeof transparencyAnchors;
  accessEvents: typeof accessEvents;
  usagePeriods: typeof usagePeriods;
  certificates: typeof certificates;
};
