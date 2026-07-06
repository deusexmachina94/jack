# Deploying BRIP publicly

BRIP core ships as a single Docker image. On boot it **applies migrations** and
(optionally) **seeds a demo publisher**, so a fresh deploy is immediately usable — no
manual migrate/seed step. It just needs a Postgres 16 database and a `DATABASE_URL`.

Once live, open the root URL for an interactive demo, or hit the API directly:

```
GET  /                                  interactive verify demo (HTML)
GET  /health                            liveness
GET  /v1/verify?url=https://nzz.ch/a/1  resolve a URL to its licensing terms
GET  /.well-known/brip-keys.json        JWKS (verify tokens/certs offline)
GET  /v1/transparency/anchors           signed Merkle anchors
```

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | local dev URL | Postgres connection string (**required in prod**) |
| `DATABASE_SSL` | — | set to `require` for hosted Postgres (Render/Railway/Fly/Supabase) |
| `PORT` | `3000` | set automatically by most platforms |
| `SEED_ON_BOOT` | `false` | `true` loads the NZZ demo publisher (idempotent) |
| `RUN_MIGRATIONS` | `true` | applies pending migrations on boot; set `false` to manage manually |
| `BRIP_ISSUER` | `https://brip.dev` | `iss` claim on issued tokens |
| `BRIP_SIGNING_KEY_PKCS8` | — | ES256 private key (PEM). If unset, an ephemeral key is generated at boot (fine for a demo; set a stable key for anything real) |

> The signing key here uses the dev `LocalKeyProvider`. For production, wire
> `KmsKeyProvider` (AWS KMS) — the interface is already in place.

---

## Option A — Render (one click, includes Postgres)

This repo has a `render.yaml` blueprint that provisions the web service **and** a free
Postgres, wired together.

1. Push this branch to GitHub (or merge it to your default branch).
2. In Render: **New → Blueprint**, select this repo.
3. Render reads `render.yaml`, creates `brip` + `brip-db`, and deploys.

Or use the button (uses the repo's default branch):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/deusexmachina94/jack)

When it's up, your public URL is `https://brip.onrender.com` (or similar).

## Option B — Railway

1. **New Project → Deploy from Repo** (Railway auto-detects the `Dockerfile`).
2. **Add → Database → PostgreSQL.**
3. On the web service, set variables: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`,
   `DATABASE_SSL=require`, `SEED_ON_BOOT=true`.
4. Deploy. Railway assigns a public domain under **Settings → Networking**.

## Option C — Fly.io

```bash
fly launch --no-deploy            # detects the Dockerfile, writes fly.toml
fly postgres create               # then: fly postgres attach <db>  (sets DATABASE_URL)
fly secrets set DATABASE_SSL=require SEED_ON_BOOT=true
fly deploy
```

## Option D — any Docker host

```bash
docker build -t brip .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@host:5432/brip" \
  -e DATABASE_SSL=require -e SEED_ON_BOOT=true \
  brip
```

## Local (no cloud)

```bash
docker compose -f infra/docker-compose.yml up -d      # Postgres + MinIO
DATABASE_URL=postgres://brip:brip@localhost:5432/brip SEED_ON_BOOT=true \
  pnpm --filter @brip/core dev
open http://localhost:3000
```

---

### Notes

- **Free-tier Postgres** on Render/Railway/Fly is fine for a demo; it may sleep or have
  row limits. Nothing about BRIP requires a paid tier to try.
- The image is **stateless** — all state is in Postgres — so it scales horizontally and
  restarts cleanly. Migrations and seeding are both idempotent.
