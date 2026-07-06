# BRIP v1 — Architecture Specification (working)

> **Provenance:** This spec was **derived from the BRIP Prompt Pack** so the build
> could proceed. It is internally consistent and drives the current implementation.
> When the canonical `brip-v1-architecture-spec.md` is available, reconcile against
> it and keep this file's section numbering so the phase prompts resolve.

BRIP is the verification and settlement layer for AI content licensing. Publishers
declare machine-readable licensing terms; AI consumers obtain short-lived, verifiable
access tokens; every consequential action is written to a tamper-evident, publicly
anchored audit log; usage is metered and settled via Stripe Connect direct charges
(BRIP never holds funds).

All timestamps are ISO-8601 UTC. All IDs are UUIDv4 unless noted. All money is an
integer in **minor units** plus an ISO-4217 currency code — never a float.

---

## §2 Data model

Postgres 16 via Drizzle. Tables (module owning each in parentheses):

### `publishers` (registry)
| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | |
| `name` | text | |
| `email` | text | contact |
| `created_at` | timestamptz | default now |

### `domains` (registry)
| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | |
| `publisher_id` | uuid fk → publishers | |
| `domain` | text unique | registrable host, e.g. `nzz.ch` |
| `status` | text | `unverified` → `pending` → `verified` |
| `challenge` | text | DNS-TXT value the publisher must publish |
| `verified_at` | timestamptz null | |
| `created_at` | timestamptz | |

Domain verification: BRIP issues a `challenge` (`brip-verify=<random>`). The publisher
adds a TXT record at `_brip.<domain>`. A verification check does a real DNS TXT lookup
(mockable in tests) and transitions `pending → verified` when the record matches.

### `license_terms` (terms) — **IMMUTABLE**
| column | type | notes |
|--------|------|-------|
| `id` | uuid pk | |
| `domain_id` | uuid fk → domains | |
| `version` | int | monotonic per domain, starts at 1 |
| `policy` | jsonb | normalized terms (see below) |
| `raw` | text | raw RSL document |
| `content_hash` | text | `sha256(canonical_json(policy))` |
| `source_url` | text | where fetched |
| `superseded_by` | uuid null fk → license_terms | set when replaced |
| `created_at` | timestamptz | |

Rows are never `UPDATE`d except to set `superseded_by` when a newer version appends.
New terms → insert `version+1`, then set the previous row's `superseded_by`.

**Normalized `policy` shape:**
```jsonc
{
  "usage": { "ai-train": "denied", "ai-input": "priced", "search": "allowed" },
  "pricing": { "unit": "per-crawl", "amountMinor": 200, "currency": "CHF" }, // optional
  "attribution": true,
  "licenseUrl": "https://…"
}
```
`usage` values: `allowed` | `denied` | `priced`. Unknown/malformed input MUST fail
loudly and be recorded (see `license_ingestions`), never coerced to a default.

### `license_ingestions` (terms) — audit of parse attempts
| `id` uuid pk | `domain_id` fk | `status` (`ok`|`error`) | `error` text null | `source_url` text | `terms_id` fk null | `created_at` |

### `signing_keys` (tokens) — JWKS registry
| `kid` text pk | `public_jwk` jsonb | `alg` text (`ES256`) | `active` bool | `created_at` |

Private key material is **never** stored here. It lives behind `KeyProvider`
(env/secret in dev, KMS in prod).

### `access_tokens` (tokens)
| column | type | notes |
|--------|------|-------|
| `jti` | uuid pk | token id, embedded as `jti` claim |
| `consumer_id` | text | subject (the AI consumer) |
| `domain_id` | uuid fk → domains | audience |
| `terms_id` | uuid fk → license_terms | terms in force at issuance |
| `issued_at` | timestamptz | |
| `expires_at` | timestamptz | issued_at + 15 min |

### `audit_entries` (audit) — hash-chained, append-only
| column | type | notes |
|--------|------|-------|
| `seq` | bigserial pk | total order |
| `id` | uuid unique | stable external id |
| `kind` | text | `terms_ingested` \| `token_issued` \| … |
| `payload` | jsonb | event body |
| `prev_hash` | text | previous row's `entry_hash` (`GENESIS` for seq 1) |
| `entry_hash` | text | `sha256(canonical_json(payload) || prev_hash)` |
| `created_at` | timestamptz | |

### `transparency_anchors` (audit)
| `id` uuid pk | `from_seq` bigint | `to_seq` bigint | `merkle_root` text | `signature` text (JWS over root) | `created_at` |

### `access_events` (billing) — reported by middleware
| `id` uuid pk | `domain_id` fk | `consumer_id` text null | `token_jti` uuid null | `user_agent` text | `url` text | `occurred_at` timestamptz |

### `usage_periods` (billing)
| `id` uuid pk | `domain_id` fk | `consumer_id` text | `period_start` | `period_end` | `event_count` int | `amount_minor` bigint | `currency` text | `status` (`open`|`invoiced`) |

---

## §3 API surface

Versioned under `/v1`. Every route: zod-validated input, one happy + one failure test.

### §3.1 Publisher API (Phase 1a)
- `POST /v1/publishers` `{ name, email }` → publisher.
- `POST /v1/publishers/:id/domains` `{ domain }` → domain (status `unverified`, with `challenge`).
- `POST /v1/domains/:id/verify` → runs DNS-TXT check; returns updated status.

### §3.2 Verify API (Phase 1c)
- `GET /v1/verify?url=<url>` → resolves url → domain → **current** (non-superseded) terms:
  ```jsonc
  {
    "domain": "nzz.ch",
    "verified": true,
    "terms": { "id": "…", "version": 3, "policy": { … }, "contentHash": "…" },
    "asOf": "2026-07-06T…"
  }
  ```
  Unknown/unverified domain → `{ "domain": …, "verified": false, "terms": null }`.
  Responses cached 60s.
- `GET /.well-known/brip-keys.json` → JWKS of active `signing_keys`.

### §3.3 Terms ingestion (Phase 1b)
- `POST /v1/domains/:id/terms` `{ sourceUrl?, raw }` → parse RSL → append a new terms
  version (or record an ingestion error; HTTP 422 on malformed).

### §3.4 Tokens (Phase 2a)
- `POST /v1/access-tokens` `{ consumerId, domain }` → `{ token, jti, expiresAt }`.
  `token` is a compact JWS (ES256) with claims: `iss`, `sub`=consumerId, `aud`=domain,
  `jti`, `iat`, `exp` (+15 min), `terms` = `{ id, contentHash }`.
- `verifyAccessToken(token, jwks)` — exported for `@brip/middleware-node`, offline.

### §3.5 Transparency (Phase 2b/3)
- `GET /v1/transparency/anchors` → recent anchors.
- `GET /v1/transparency/entries/:id/proof` → Merkle inclusion proof for an entry.

---

## §4 Key hierarchy

`KeyProvider` interface: `getActiveSigningKey()`, `getPublicJwks()`, `sign(payload)`.
- `LocalKeyProvider` (dev): ES256 keypair from env or generated at boot; publishes its
  public JWK into `signing_keys`.
- `KmsKeyProvider` (prod): stub throwing `NotImplemented`, correct interface.
Access tokens are ES256 JWS via `jose`. Rotation = insert a new active key, mark old
inactive but keep it in JWKS until all its tokens expire.

## §5 Audit chain & transparency

`appendEntry(kind, payload)` inserts the next hash-chained row inside a serializable
transaction so `prev_hash` is race-free. `canonical_json` = deterministic JSON with
lexicographically sorted object keys, UTF-8, no insignificant whitespace. An hourly job
builds a Merkle tree over new entries, signs the root, and stores an anchor.
`brip-cli audit verify` re-derives the chain and proves an entry against an anchor.
Tampering with any historic row breaks verification at that row.

## §6 Metering & settlement

Nightly job aggregates `access_events × license_terms.pricing` into `usage_periods`
(integer minor units), idempotent per (domain, consumer, period). Stripe Connect
onboarding for publishers; invoices are **direct charges on the connected account**
with a configurable `application_fee`. No BRIP-held balances anywhere.

## §8 Phase plan

1a registry · 1b terms · 1c verify · 2a keys+tokens · 2b audit · 2c middleware ·
3 certificates+export · 4 metering+Stripe. Phase 1 alone is demoable (`/v1/verify`).
