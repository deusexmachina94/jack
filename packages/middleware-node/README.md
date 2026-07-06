# @brip/middleware-node

> **Status: scaffold.** Public interface is stubbed; behavior lands in Phase 2c.
> This README is the intended shape, so the open-source launch has a target.

Drop-in Node middleware that lets a publisher accept and validate **BRIP access
tokens** at their edge — verifying them *offline* and reporting access to BRIP
without ever blocking a response.

## Why

A crawler that has licensed your content presents a short-lived `BRIP-Access-Token`.
This middleware:

1. **Validates** the token offline (JWS ES256) against your JWKS endpoint — no
   round-trip to BRIP on the hot path.
2. **Reports** the access event to BRIP fire-and-forget — if BRIP is down, your
   site is unaffected.
3. **Optionally** answers token-less known-AI user agents with `402 Payment
   Required` and a pointer to your license terms (off by default).

## Quickstart (target API)

```ts
import Fastify from 'fastify';
import { bripMiddleware } from '@brip/middleware-node';

const app = Fastify();

app.addHook('onRequest', bripMiddleware({
  jwksUrl: 'https://api.brip.dev/.well-known/brip-keys.json',
  reportUrl: 'https://api.brip.dev/v1/events',
  challenge402: false, // opt-in monetization of unlicensed AI traffic
}));
```

Express adapter ships in the same package.

## Guarantees

- **Never blocks your response.** Reporting is best-effort and out-of-band.
- **No internal BRIP imports.** This package depends on nothing from `@brip/core`.
- **Apache-2.0.** Use it anywhere.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
