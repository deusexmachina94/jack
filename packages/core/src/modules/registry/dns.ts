import { resolveTxt } from 'node:dns/promises';

/**
 * Minimal DNS surface the registry depends on, so domain verification can be
 * driven by a fake in tests (CLAUDE.md: DNS lookups must be mockable).
 */
export interface DnsResolver {
  /** Resolve TXT records for a host; each record is its array of strings. */
  resolveTxt(host: string): Promise<string[][]>;
}

export const nodeDnsResolver: DnsResolver = {
  resolveTxt: (host) => resolveTxt(host),
};

/** In-memory resolver for tests: map of host → TXT record strings. */
export function fakeDnsResolver(records: Record<string, string[]>): DnsResolver {
  return {
    async resolveTxt(host) {
      const found = records[host];
      if (!found) {
        const err = new Error(`ENOTFOUND ${host}`) as Error & { code: string };
        err.code = 'ENOTFOUND';
        throw err;
      }
      return found.map((r) => [r]);
    },
  };
}
