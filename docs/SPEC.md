# BRIP v1 — Architecture Specification

> ⚠️ **PLACEHOLDER — NOT YET POPULATED.**
>
> This file must contain the full `brip-v1-architecture-spec.md` before any
> phased build work begins. Every phase prompt in the Prompt Pack starts with
> *"Read docs/SPEC.md"* — CLAUDE.md names it the single source of truth for the
> data model (§2), API surface (§3), key hierarchy (§4), audit chain (§5),
> billing (§6), and the phase plan (§8).
>
> **Action required (Jack/Andrzej):** paste the architecture spec over this
> file's contents, commit it, then start Phase 1a in a fresh session.
>
> Until this is filled in, Claude Code must **not** implement any module —
> doing so would mean inventing the data model, which CLAUDE.md forbids
> ("If a task conflicts with SPEC.md, stop and say so instead of improvising").

## Expected section outline (from the Prompt Pack references)

The phase prompts reference these sections, so the pasted spec is expected to
define at least:

- **§2 — Data model.** publishers, domains, license_terms (immutable /
  append-and-supersede), access_tokens, audit_entries (hash-chained),
  usage_periods, and their relationships.
- **§3 — API surface.**
  - §3.1 Publisher API (registration, domain claiming, DNS-TXT verification).
  - §3.2 Verify API (`GET /v1/verify`), JWKS (`/.well-known/brip-keys.json`),
    certificates, public transparency verifier.
- **§4 — Key hierarchy.** KeyProvider abstraction, local vs KMS, rotation,
  access-token claims.
- **§5 — Audit chain & transparency.** entry_hash definition, Merkle anchoring,
  `/v1/transparency/anchors`, regulator export bundle.
- **§6 — Metering & settlement.** access_events aggregation, Stripe Connect
  direct charges, application fee, no BRIP-held funds.
- **§8 — Phase / work-package plan.** The sequence the Prompt Pack mirrors.

When the real spec is pasted, delete this placeholder block and keep the spec's
own numbering intact so the phase prompts resolve correctly.
