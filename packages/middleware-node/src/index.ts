// @brip/middleware-node — public, Apache-2.0.
//
// Offline BRIP access-token validation + fire-and-forget access reporting for Node.
// Standalone by design: it does NOT import from @brip/core (the JWS/JWKS contract is
// the only coupling), so publishers can adopt it without the rest of BRIP.

export { createVerifier, type BripClaims, type VerifierConfig } from './verify.js';
export {
  bripMiddleware,
  type BripMiddlewareOptions,
  type MinimalReq,
  type MinimalRes,
  type Next,
} from './middleware.js';

export const VERSION = '0.1.0';
