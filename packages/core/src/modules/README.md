# Core modules

The modular monolith. Each folder is one module and owns its own Drizzle schema,
services, and routes. **Modules communicate only through exported service
interfaces — never by importing another module's internals** (CLAUDE.md hard rule).

Nothing here is implemented yet. Each module is built in its phase, and only after
`docs/SPEC.md` is populated.

| Module | Responsibility | Phase (Prompt Pack) |
|--------|----------------|---------------------|
| `registry` | Publisher registration, domain claiming, DNS-TXT verification | 1a |
| `terms` | RSL ingestion, immutable `license_terms` store (append + supersede) | 1b |
| `verify` | `GET /v1/verify`, JWKS endpoint, response caching | 1c |
| `tokens` | KeyProvider, 15-min ES256 access tokens, `verifyAccessToken()` | 2a |
| `audit` | Hash-chained `audit_entries`, Merkle anchoring, transparency + export | 2b / 3 |
| `billing` | Usage aggregation, Stripe Connect direct charges (no held funds) | 4 |

Cross-module contracts (the exported interfaces one module may depend on) should be
declared in each module's `index.ts` as it is built, so a consumer imports
`../tokens` and gets a typed surface — not `../tokens/internal/...`.
