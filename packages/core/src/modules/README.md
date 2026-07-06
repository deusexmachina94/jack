# Core modules

The modular monolith. Each folder is one module and owns its own Drizzle schema,
services, and routes. **Modules communicate only through exported service
interfaces — never by importing another module's internals** (CLAUDE.md hard rule).

All modules below are implemented and tested. `certificates` is a seventh module added
for Phase 3.

| Module | Responsibility | Phase | Status |
|--------|----------------|-------|--------|
| `registry` | Publisher registration, domain claiming, DNS-TXT verification | 1a | ✅ |
| `terms` | RSL ingestion, immutable `license_terms` store (append + supersede) | 1b | ✅ |
| `verify` | `GET /v1/verify`, JWKS endpoint, response caching | 1c | ✅ |
| `tokens` | KeyProvider, 15-min ES256 access tokens, `verifyAccessToken()` | 2a | ✅ |
| `audit` | Hash-chained `audit_entries`, Merkle anchoring, transparency proofs | 2b | ✅ |
| `certificates` | Signed provenance certificates + regulator export bundle | 3 | ✅ |
| `billing` | Idempotent usage aggregation, Stripe Connect settlement port (no held funds) | 4 | ✅ |

Cross-module contracts (the exported interfaces one module may depend on) should be
declared in each module's `index.ts` as it is built, so a consumer imports
`../tokens` and gets a typed surface — not `../tokens/internal/...`.
