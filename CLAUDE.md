# BRIP — project instructions for Claude Code

## What this is
BRIP is the verification and settlement layer for AI content licensing.
Read docs/SPEC.md before any task. It is the source of truth for the data
model, API surface, key hierarchy, and phase plan. If a task conflicts
with SPEC.md, stop and say so instead of improvising.

## Hard rules
- TypeScript strict mode everywhere. No `any` without an inline justification comment.
- Stack: Fastify + Drizzle + Postgres 16 + Vitest. pnpm workspaces. Node 22.
- Modular monolith in packages/core with modules: registry, terms,
  verify, tokens, audit, billing. Modules communicate through exported
  service interfaces — never by importing another module's internals.
- NEVER write cryptographic primitives. Signing = the `jose` library (JWS ES256).
  Content credentials = the c2pa Node SDK. If a task seems to require
  hand-rolled crypto, stop and flag it.
- Private keys never appear in code, config files, or test fixtures.
  Local dev reads keys from env / docker secrets; production is AWS KMS
  (interface it now, implement KMS adapter later). Tests use ephemeral
  keys generated per test run.
- license_terms rows are IMMUTABLE — new terms append a row and set
  superseded_by on the old one. Never UPDATE a terms row.
- Every audit_entries row: entry_hash = sha256(canonical_json(payload) || prev_hash).
  Any change to the audit module requires updating the chain-verification test.
- All money amounts are integers in minor units (rappen/cents) + currency code.
  Never floats. We never hold funds: Stripe Connect direct charges only.
- Every API route ships with: zod input validation, an OpenAPI entry,
  and at least one happy-path + one failure-path test.
- Migrations via drizzle-kit; never edit an applied migration.

## Definition of done (every task)
1. `pnpm test` green, including new tests that fail without your change.
2. `pnpm lint && pnpm typecheck` clean.
3. If the API surface changed: OpenAPI spec regenerated, README snippet updated.
4. Append 2–4 lines to docs/DECISIONS.md: what you decided and why.

## What NOT to build (v1 non-goals — do not "helpfully" add these)
- Per-inference detection of model usage
- Custody of funds, wallets, balances
- Crawler blocking / rate limiting of third parties
- Admin UI (API + CLI only until Phase 3)
