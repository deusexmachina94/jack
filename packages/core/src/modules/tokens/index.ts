// tokens module — key provider, ES256 access-token issuance, offline verification.
export {
  TokenService, verifyAccessToken, TOKEN_TTL_SECONDS,
  type IssuedToken, type AccessTokenClaims,
} from './service.js';
export { tokenRoutes, type TokenDeps } from './routes.js';
export {
  LocalKeyProvider, KmsKeyProvider,
  type KeyProvider, type SigningMaterial,
} from './keys.js';
