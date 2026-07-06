import type { Db } from '../../db/client.js';
import { getDomainByName } from '../registry/service.js';
import { getCurrentTerms } from '../terms/service.js';
import type { Policy } from '../terms/rsl.js';

export interface VerifyResult {
  domain: string | null;
  verified: boolean;
  terms: {
    id: string;
    version: number;
    policy: Policy;
    contentHash: string;
  } | null;
  asOf: string;
}

/** Extract candidate registrable domains from a URL, longest-subdomain first. */
export function candidateDomains(url: string): string[] {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Allow a bare host to be passed instead of a full URL.
    host = String(url).trim().toLowerCase();
  }
  host = host.replace(/\.$/, '');
  if (!host) return [];
  const labels = host.split('.');
  const out: string[] = [];
  for (let i = 0; i + 2 <= labels.length; i++) {
    out.push(labels.slice(i).join('.'));
  }
  return out.length ? out : [host];
}

interface CacheEntry { value: VerifyResult; expires: number; }

/**
 * Resolves a URL to the current licensing terms of its verified domain.
 * Results are cached in-process for `ttlMs` (default 60s per SPEC §3.2).
 */
export class VerifyService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly db: Db, private readonly ttlMs = 60_000) {}

  async verify(url: string): Promise<VerifyResult> {
    const now = Date.now();
    const key = url.trim().toLowerCase();
    const hit = this.cache.get(key);
    if (hit && hit.expires > now) return hit.value;

    const value = await this.resolve(url);
    this.cache.set(key, { value, expires: now + this.ttlMs });
    return value;
  }

  private async resolve(url: string): Promise<VerifyResult> {
    const asOf = new Date().toISOString();
    for (const candidate of candidateDomains(url)) {
      const domain = await getDomainByName(this.db, candidate);
      if (!domain) continue;

      if (domain.status !== 'verified') {
        return { domain: domain.domain, verified: false, terms: null, asOf };
      }
      const terms = await getCurrentTerms(this.db, domain.id);
      return {
        domain: domain.domain,
        verified: true,
        terms: terms
          ? {
              id: terms.id,
              version: terms.version,
              policy: terms.policy as Policy,
              contentHash: terms.contentHash,
            }
          : null,
        asOf,
      };
    }
    return { domain: null, verified: false, terms: null, asOf };
  }

  /** Test/ops hook to drop cached entries. */
  clearCache(): void {
    this.cache.clear();
  }
}
