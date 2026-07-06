# BRIP — Decision Log

Running log of design/implementation decisions. Every task appends 2–4 lines:
what was decided and why. Keeps late sessions as sharp as early ones and doubles
as the technical-diligence artifact for the seed round.

Newest entries at the top.

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
