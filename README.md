# BRIP

**The verification and settlement layer for AI content licensing.**

BRIP lets publishers declare licensing terms for AI use of their content, lets AI
consumers obtain verifiable access, and produces a tamper-evident audit trail that
settles usage into payments — without BRIP ever holding funds.

This is a monorepo built in phases. **`docs/SPEC.md` is the source of truth** for the
data model, API surface, key hierarchy, and phase plan; **`CLAUDE.md`** holds the
standing engineering rules every contributor (human or agent) must follow.

> **Status: bootstrap.** The workspace, tooling, and package skeletons are in place.
> No modules are implemented yet — Phase 1a begins once `docs/SPEC.md` is populated.

## Layout

```
packages/
  core/             modular monolith — modules: registry, terms, verify, tokens, audit, billing
  middleware-node/  public (Apache-2.0) — offline access-token validation middleware
  cli/              public (Apache-2.0) — brip-cli, incl. independent audit verification
docs/
  SPEC.md           v1 architecture spec (source of truth)  ← must be pasted in before Phase 1a
  DECISIONS.md      running decision log
infra/
  docker-compose.yml  Postgres 16 + MinIO for local dev
prototype/          earlier website-scanner exploration, kept for reference (not in the workspace)
```

## Stack

Fastify · Drizzle ORM · Postgres 16 · Zod · Vitest · TypeScript (strict) · pnpm · Node 22.
These are locked in CLAUDE.md so no session re-decides them.

## Getting started

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres + MinIO
pnpm test                                           # run all package tests
pnpm --filter @brip/core dev                        # start core (GET /health)
```

## Contributing (agent workflow)

Development follows the phased Prompt Pack: one work package per session, plan-first on
anything touching keys, hashes, or money, and tests as the definition of done. See
`CLAUDE.md` for the hard rules and `docs/DECISIONS.md` for the trail of choices.

## License

`packages/core` is currently private/unlicensed. `packages/middleware-node` and
`packages/cli` are Apache-2.0.
