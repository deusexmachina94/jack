import { SignJWT, jwtVerify, createLocalJWKSet, type JWTPayload, type JSONWebKeySet } from 'jose';
import type { Db } from '../../db/client.js';
import { accessTokens } from '../../db/schema.js';
import { unprocessable } from '../../shared/errors.js';
import type { Auditor } from '../../shared/audit-port.js';
import { getDomainByName } from '../registry/service.js';
import { getCurrentTerms } from '../terms/service.js';
import type { KeyProvider } from './keys.js';

export const TOKEN_TTL_SECONDS = 15 * 60;

export interface IssuedToken {
  token: string;
  jti: string;
  expiresAt: string;
}

export interface AccessTokenClaims extends JWTPayload {
  terms?: { id: string; contentHash: string };
}

export class TokenService {
  constructor(
    private readonly db: Db,
    private readonly keys: KeyProvider,
    private readonly auditor: Auditor,
    private readonly issuer: string,
  ) {}

  /** Issue a short-lived access token binding a consumer to a domain's current terms. */
  async issue(consumerId: string, domainName: string): Promise<IssuedToken> {
    const domain = await getDomainByName(this.db, domainName);
    if (!domain) throw unprocessable(`Unknown domain: ${domainName}`);
    if (domain.status !== 'verified') throw unprocessable(`Domain not verified: ${domainName}`);

    const terms = await getCurrentTerms(this.db, domain.id);
    if (!terms) throw unprocessable(`No published terms for ${domainName}`);

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + TOKEN_TTL_SECONDS;

    const [row] = await this.db.insert(accessTokens).values({
      consumerId,
      domainId: domain.id,
      termsId: terms.id,
      expiresAt: new Date(exp * 1000),
    }).returning();
    const jti = row!.jti;

    const { kid, privateKey } = await this.keys.getActiveSigningKey();
    const token = await new SignJWT({ terms: { id: terms.id, contentHash: terms.contentHash } })
      .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
      .setIssuer(this.issuer)
      .setSubject(consumerId)
      .setAudience(domain.domain)
      .setJti(jti)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(privateKey);

    await this.auditor.appendEntry('token_issued', {
      jti,
      consumerId,
      domain: domain.domain,
      termsId: terms.id,
      contentHash: terms.contentHash,
      expiresAt: new Date(exp * 1000).toISOString(),
    });

    return { token, jti, expiresAt: new Date(exp * 1000).toISOString() };
  }
}

/**
 * Offline verification of an access token against a JWKS. Exported for reuse and
 * mirrored by the standalone @brip/middleware-node package (which cannot import
 * core, so it keeps its own copy).
 */
export async function verifyAccessToken(
  token: string,
  jwks: JSONWebKeySet,
  opts: { issuer?: string; audience?: string } = {},
): Promise<AccessTokenClaims> {
  const keySet = createLocalJWKSet(jwks);
  const { payload } = await jwtVerify(token, keySet, {
    algorithms: ['ES256'],
    ...(opts.issuer ? { issuer: opts.issuer } : {}),
    ...(opts.audience ? { audience: opts.audience } : {}),
  });
  return payload as AccessTokenClaims;
}
