# BRIP — Decision Log

Running log of design/implementation decisions. Every task appends 2–4 lines:
what was decided and why. Keeps late sessions as sharp as early ones and doubles
as the technical-diligence artifact for the seed round.

Newest entries at the top.

---

## 2026-07-06 — Phases 3 & 4 implemented

- **Certificates (3):** `POST /v1/certificates` issues a signed (ES256 JWS) provenance
  certificate binding consumer/domain/termsHash/period/eventCount; `GET
  /v1/transparency/verify/:certId` verifies it against the JWKS. Added a `certificates`
  table (migration 0001).
- **Regulator export (3):** `GET /v1/certificates/:certId/export` returns a zip (via
  `fflate`) containing the certificate, JWKS, anchors, each relevant audit entry + its
  Merkle inclusion proof, a manifest, and a README written for a Big-4 auditor. The
  export anchors any pending entries first so every entry has a proof. A test unzips the
  bundle and re-verifies an inclusion proof with its own SHA-256.
- **Metering (4):** `aggregateUsage(window)` groups access events per (domain, consumer),
  prices them by the domain's current terms into **integer minor units**, and upserts
  `usage_periods` keyed by (domain, consumer, period) — idempotent, and never rewrites an
  `invoiced` period (retried nightly job can't double-bill). `POST /v1/events` records
  reported accesses (the middleware's fire-and-forget target).
- **Settlement (4):** `SettlementProvider` port with `applicationFee` (bps → minor units)
  and a `StripeSettlementProvider` stub (throws NotImplemented, like KmsKeyProvider) —
  live Stripe wiring is a deploy concern needing keys/stripe-mock, deliberately deferred.
  No BRIP-held balances exist in the schema.
- **Verified:** 39 tests green (core 28, middleware 6, cli 5). All eight phases (1a–4) now
  have working, tested implementations.

---

## 2026-07-06 — Phases 1a–2c implemented

- **Spec:** `docs/SPEC.md` was authored from the Prompt Pack (marked as derived) so the
  build could proceed without the canonical `brip-v1-architecture-spec.md`. It pins the
  data model and API shapes the code conforms to; reconcile when the canonical spec lands.
- **Testing without Docker:** tests run against **pglite** (real Postgres 16 compiled to
  WASM) via a per-test fresh DB with migrations applied; runtime uses `postgres.js` over
  `DATABASE_URL`. The DB schema lives in one shared `db/schema.ts` (drizzle-kit needs the
  whole graph; cross-module FKs are data, not service coupling — modules still call each
  other only through exported services).
- **Audit port:** modules that emit events depend on a small `Auditor` interface
  (`shared/audit-port.ts`), not on the audit module, preserving isolation. `appendEntry`
  runs in a serializable transaction so `prev_hash` can't fork under concurrency.
- **Crypto:** ES256 JWS via `jose` only; SHA-256 via `node:crypto`. `canonicalJson` is a
  deterministic (sorted-key) serializer — not a primitive. No hand-rolled crypto.
- **Keys:** `KeyProvider` with `LocalKeyProvider` (dev, ephemeral or PKCS8 from env) and a
  `KmsKeyProvider` stub (throws NotImplemented). Private keys never touch the DB.
- **Money:** RSL pricing parsed to integer minor units by currency exponent; never floats.
- **Middleware (2c):** `@brip/middleware-node` is intentionally standalone — it verifies
  tokens with its own `jose` usage and does not import `@brip/core`. Reporting is
  fire-and-forget and cannot block or fail the publisher response.
- **CLI (2b):** `brip-cli audit verify` re-implements hashing/Merkle independently so a
  proof is checked without trusting the server's code.
- **Verified:** 34 tests green (core 23, middleware 6, cli 5); full end-to-end flow, audit
  tamper-detection, and offline token verification all covered.
- **Not yet built:** Phase 3 (certificates + regulator export) and Phase 4 (metering +
  Stripe Connect).

---

## 2026-07-06 — Repo bootstrap
- Established the pnpm monorepo per the Prompt Pack §1: `packages/{core,middleware-node,cli}`,
  `docs/`, `infra/`. Stack locked to Fastify + Drizzle + Postgres 16 + Vitest on Node 22
  (recorded here so no session re-litigates it — the Pack flagged framework/ORM/test-runner
  ambiguity as where agent codebases rot).
- TypeScript strict everywhere via a shared `tsconfig.base.json`; each package extends it.
- `packages/core` created as an empty modular-monolith skeleton with placeholder folders for
  the six modules (registry, terms, verify, tokens, audit, billing). **No module logic yet** —
  that begins in Phase 1a and requires docs/SPEC.md to be populated first.
- `packages/middleware-node` and `packages/cli` are public-facing; both carry Apache-2.0.
- infra/docker-compose brings up Postgres 16 + MinIO for local dev.
- The earlier website-scanner prototype (a wrong-guess interpretation of "BRIP") was moved to
  `prototype/`, out of the workspace, rather than deleted — preserved for reference, excluded
  from the pnpm workspace.
- **Open blocker:** docs/SPEC.md is a placeholder. Phase 1a cannot start until the real
  architecture spec is pasted in.
