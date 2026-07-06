# BRIP — technical review guide

For a skeptical senior engineer. This orients you in ~5 minutes and points you
straight at the parts that deserve human eyes: the **signing/token path**, the
**audit hash-chain**, and the **money aggregation** (the three areas the build plan
flagged for manual review).

## TL;DR

- Modular monolith, TypeScript strict, Fastify + Drizzle + Postgres 16, pnpm workspace.
- All 8 phases implemented; **41 tests green** (core 30, middleware 6, cli 5).
- Tests run on **pglite** (real Postgres compiled to WASM) — no Docker needed to review.
- Two production adapters are interface-complete **stubs** by design: `KmsKeyProvider`
  and `StripeSettlementProvider`. Everything else is real.
- Source of truth: [`docs/SPEC.md`](docs/SPEC.md) (derived from the build plan — see its
  header). Decision log: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Run it yourself (2 min, no cloud)

```bash
pnpm install
pnpm -r typecheck      # strict, clean
pnpm -r test           # 41 tests, all green, offline via pglite
```

Then read the three files below.

---

## 1. Signing & tokens  ← review first

Files: `packages/core/src/modules/tokens/keys.ts`, `.../tokens/service.ts`

- **No hand-rolled crypto.** ES256 JWS is entirely `jose`; SHA-256 is `node:crypto`.
  `canonicalJson` (`shared/canonical.ts`) is deterministic serialization, not a primitive.
- **KeyProvider abstraction** (`keys.ts`): `LocalKeyProvider` (dev — ephemeral keypair or
  PKCS8 from env) publishes only the **public** JWK into `signing_keys`; the private key
  stays in memory and never touches the DB. `KmsKeyProvider` is the prod seam (throws
  `NotImplemented`).
- **Tokens** (`service.ts`): 15-minute (`TOKEN_TTL_SECONDS`) ES256 JWS, claims
  `iss/sub/aud/jti/iat/exp` + `terms.contentHash`; `jti` persisted in `access_tokens`.
  `verifyAccessToken()` is offline (`createLocalJWKSet` + `jwtVerify`, `algorithms:
  ['ES256']`).
- **Things worth your scrutiny:** key rotation story (new active key; old stays in JWKS
  until its tokens expire — described in SPEC §4, not yet exercised by a test); whether
  15 min + `jti` persistence is the revocation model you want; `aud` = bare domain.

Covered by: `test/flow.test.ts` (issue → **verify offline against JWKS** → claims),
`test/app.test.ts` (JWKS never leaks `d`).

## 2. Audit hash-chain  ← highest-integrity path

Files: `packages/core/src/modules/audit/service.ts`, `.../audit/merkle.ts`,
`shared/hash.ts`

- **Chain link:** `entry_hash = sha256(canonical_json(payload) || prev_hash)`
  (`hash.ts:15`), `GENESIS` for the first row.
- **`appendEntry`** runs in a **serializable** transaction (`service.ts:38`) so
  `prev_hash` can't fork under concurrent appends (the DB aborts the loser).
- **`verifyChain`** re-derives every row and returns the first `seq` that breaks.
- **Merkle anchoring:** `buildAnchor` signs the root (ES256 JWS) over an entry range;
  `getProof` returns an inclusion proof; `merkle.ts` has `merkleRoot/merkleProof/verifyProof`.
- **Independent verification:** `packages/cli/src/audit.ts` re-implements the hashing and
  proof folding from scratch — a proof is checked **without trusting the server's code**.
- **Things worth your scrutiny:** canonicalization is the crux — if two structurally-equal
  payloads ever serialized differently, the chain would false-positive; see
  `shared/canonical.ts` (sorted keys, `undefined` dropped, non-finite rejected). Odd-node
  Merkle handling duplicates the last leaf (`merkle.ts`) — confirm that matches your
  expectation. Anchoring is on-demand here; SPEC describes an hourly job.

Covered by: `test/audit.test.ts` — chain linkage, **tamper test** (mutate a committed row
→ verification fails at exactly that seq), anchor + proof round-trip for every leaf;
`test/certificates.test.ts` re-verifies an exported proof with its own SHA-256.

## 3. Money / metering  ← review the idempotency

File: `packages/core/src/modules/billing/service.ts`, `.../billing/stripe.ts`

- **Integer minor units only** (rappen/cents), never floats — RSL pricing is parsed to
  `amountMinor` in `terms/rsl.ts`.
- **`aggregateUsage(window)`** groups access events per (domain, consumer), prices by the
  domain's current terms, and **upserts** `usage_periods` keyed by (domain, consumer,
  period). Re-running the same window does **not** double-count, and a period already
  `invoiced` is never rewritten. This is the property to attack.
- **No held funds:** there is no balance/wallet anywhere in the schema.
  `SettlementProvider` (`stripe.ts`) models Stripe Connect **direct charges** with an
  `applicationFee` (bps → minor units); the live adapter is a stub.
- **Things worth your scrutiny:** the idempotency key is the (domain, consumer, period)
  tuple + status guard, not a Stripe idempotency key yet (that lands when the SDK is
  wired); rounding in `applicationFee` (`Math.round`); anonymous consumers bucket under
  `'anonymous'`.

Covered by: `test/billing.test.ts` — pricing into minor units, **idempotent re-run**
(no double-bill), application-fee rounding.

---

## What's deliberately NOT built (per the v1 non-goals)

Per-inference detection, custody of funds, crawler blocking, admin UI. And the two
external-service adapters (`KmsKeyProvider`, `StripeSettlementProvider`) are seams, not
implementations — they need live credentials and belong at deploy time.

## Map of the codebase

```
packages/core/src/
  shared/       canonicalJson, hash (entryHash), errors, zod validate, Auditor port
  db/           schema (10 tables) + generated migrations + client + runtime migrator
  modules/
    registry/   publishers, domains, DNS-TXT verify (mockable resolver)
    terms/      RSL parse → immutable append/supersede; malformed → 422 + recorded
    verify/     GET /v1/verify (60s cache) + JWKS
    tokens/     KeyProvider, ES256 tokens, offline verify
    audit/      hash chain, Merkle anchors, proofs
    certificates/ signed provenance cert + regulator export (zip)
    billing/    idempotent metering + Stripe settlement port
  app.ts / container.ts / demo.ts / seed.ts
packages/middleware-node/   standalone Apache-2.0 offline validation middleware
packages/cli/               brip-cli audit verify (independent proof checker)
```

## Suggested review path

1. `pnpm -r test` and skim the test names — they double as a behavior spec.
2. Read `shared/canonical.ts` + `shared/hash.ts` (everything hashes through these).
3. `modules/audit/service.ts` + `test/audit.test.ts` (the tamper test).
4. `modules/tokens/{keys,service}.ts` (key handling, token claims/TTL).
5. `modules/billing/service.ts` + `test/billing.test.ts` (double-bill attack).
6. Sanity-check the module-isolation rule: emitters depend on `shared/audit-port.ts`, not
   the audit module.
