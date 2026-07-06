import {
  generateKeyPair, exportJWK, importPKCS8, calculateJwkThumbprint,
  type JWK, type KeyLike,
} from 'jose';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { signingKeys } from '../../db/schema.js';

export interface SigningMaterial {
  kid: string;
  alg: 'ES256';
  privateKey: KeyLike;
  publicJwk: JWK;
}

/**
 * Source of signing keys and the public JWKS (docs/SPEC.md §4). Implementations
 * never expose private key material outside `sign`-adjacent use. Private keys are
 * never persisted to the database.
 */
export interface KeyProvider {
  getActiveSigningKey(): Promise<SigningMaterial>;
  getPublicJwks(): Promise<{ keys: JWK[] }>;
}

/**
 * Dev/local provider. Uses an ES256 keypair from `BRIP_SIGNING_KEY_PKCS8` (PEM) or,
 * if unset, generates an ephemeral one at init. The public JWK is registered in
 * signing_keys so the JWKS endpoint and rotation work; the private key stays in memory.
 */
export class LocalKeyProvider implements KeyProvider {
  private material?: SigningMaterial;

  constructor(private readonly db: Db, private readonly pkcs8Pem?: string) {}

  async init(): Promise<void> {
    let privateKey: KeyLike;
    let publicJwk: JWK;

    if (this.pkcs8Pem) {
      privateKey = await importPKCS8(this.pkcs8Pem, 'ES256', { extractable: false });
      // Derive the public JWK from the private key's public component.
      const full = await importPKCS8(this.pkcs8Pem, 'ES256', { extractable: true });
      const jwk = await exportJWK(full);
      publicJwk = stripPrivate(jwk);
    } else {
      const pair = await generateKeyPair('ES256', { extractable: true });
      privateKey = pair.privateKey;
      publicJwk = stripPrivate(await exportJWK(pair.publicKey));
    }

    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';
    const kid = await calculateJwkThumbprint(publicJwk);
    publicJwk.kid = kid;

    await this.db.insert(signingKeys)
      .values({ kid, publicJwk, alg: 'ES256', active: true })
      .onConflictDoNothing();

    this.material = { kid, alg: 'ES256', privateKey, publicJwk };
  }

  async getActiveSigningKey(): Promise<SigningMaterial> {
    if (!this.material) throw new Error('LocalKeyProvider.init() was not called');
    return this.material;
  }

  async getPublicJwks(): Promise<{ keys: JWK[] }> {
    const rows = await this.db.select().from(signingKeys).where(eq(signingKeys.active, true));
    return { keys: rows.map((r) => r.publicJwk as JWK) };
  }
}

/** Production provider backed by AWS KMS — interface only for now (SPEC §4). */
export class KmsKeyProvider implements KeyProvider {
  getActiveSigningKey(): Promise<SigningMaterial> {
    throw new Error('NotImplemented: KmsKeyProvider (Phase 2a+ hardening)');
  }
  getPublicJwks(): Promise<{ keys: JWK[] }> {
    throw new Error('NotImplemented: KmsKeyProvider (Phase 2a+ hardening)');
  }
}

function stripPrivate(jwk: JWK): JWK {
  const { d: _d, ...pub } = jwk;
  return pub;
}
