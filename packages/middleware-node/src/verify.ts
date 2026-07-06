import {
  jwtVerify, createRemoteJWKSet, createLocalJWKSet,
  type JWTPayload, type JSONWebKeySet,
} from 'jose';

export interface BripClaims extends JWTPayload {
  terms?: { id: string; contentHash: string };
}

export interface VerifierConfig {
  /** Publisher's JWKS endpoint. Fetched and cached by jose. */
  jwksUrl?: string;
  /** Inline JWKS (testing/air-gapped). Takes precedence over jwksUrl. */
  jwks?: JSONWebKeySet;
  /** Expected `iss`. Optional but recommended. */
  issuer?: string;
  /** Expected `aud` (usually the publisher's domain). */
  audience?: string;
}

type KeyGetter = Parameters<typeof jwtVerify>[1];

function buildKeyGetter(config: VerifierConfig): KeyGetter {
  if (config.jwks) return createLocalJWKSet(config.jwks);
  if (config.jwksUrl) return createRemoteJWKSet(new URL(config.jwksUrl));
  throw new Error('BRIP verifier needs either `jwks` or `jwksUrl`');
}

/**
 * Offline access-token verification. The JWKS is cached by jose, so the hot path
 * never calls BRIP. Resolves with claims on success, rejects on any failure.
 */
export function createVerifier(config: VerifierConfig): (token: string) => Promise<BripClaims> {
  const getKey = buildKeyGetter(config);
  return async (token: string): Promise<BripClaims> => {
    const { payload } = await jwtVerify(token, getKey, {
      algorithms: ['ES256'],
      ...(config.issuer ? { issuer: config.issuer } : {}),
      ...(config.audience ? { audience: config.audience } : {}),
    });
    return payload as BripClaims;
  };
}
