// @brip/middleware-node — public, Apache-2.0.
//
// Validates the `BRIP-Access-Token` header OFFLINE against a publisher's JWKS
// endpoint and reports access events to BRIP fire-and-forget. Full behavior is
// built in Phase 2c (see docs/SPEC.md). This is the package skeleton.
//
// Design invariants (Phase 2c will enforce with tests):
//   - Reporting is fire-and-forget: it MUST NOT block or fail the publisher's
//     response, even if BRIP is unreachable.
//   - Token validation is offline: verify JWS ES256 against cached JWKS.
//   - The optional 402-for-known-AI-agents behavior is a config flag, default off.

export interface BripMiddlewareOptions {
  /** Publisher's JWKS URL, e.g. https://api.brip.dev/.well-known/brip-keys.json */
  jwksUrl: string;
  /** BRIP event-reporting endpoint. */
  reportUrl?: string;
  /** Return 402 for token-less known-AI user agents. Default false. */
  challenge402?: boolean;
}

export const VERSION = '0.0.0';

// Implemented in Phase 2c:
// export function bripMiddleware(opts: BripMiddlewareOptions): Middleware { … }
export {};
