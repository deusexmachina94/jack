import { zipSync, strToU8 } from 'fflate';
import type { Db } from '../../db/client.js';
import { notFound } from '../../shared/errors.js';
import { getDomainById } from '../registry/index.js';
import { AuditLog } from '../audit/index.js';
import type { KeyProvider } from '../tokens/keys.js';
import { getCertificate } from './service.js';

/**
 * Build a self-contained regulator export: the certificate, the relevant audit
 * entries with Merkle inclusion proofs, the anchors, the JWKS, and a manifest +
 * README explaining how to re-verify everything WITHOUT trusting BRIP
 * (docs/SPEC.md §3.2 / §5).
 */
export async function buildRegulatorExport(
  db: Db,
  keys: KeyProvider,
  certId: string,
): Promise<{ filename: string; zip: Uint8Array }> {
  const cert = await getCertificate(db, certId);
  if (!cert) throw notFound(`No certificate ${certId}`);

  const domain = await getDomainById(db, cert.domainId);
  const domainName = domain?.domain ?? cert.domainId;

  const audit = new AuditLog(db);
  // Ensure every relevant entry is anchored so an inclusion proof exists.
  await audit.buildAnchor(keys);

  const all = await audit.listEntries();
  const relevant = all.filter((e) => {
    const p = e.payload as Record<string, unknown>;
    if (p['domain'] !== domainName) return false;
    if (e.kind === 'terms_ingested') return true;
    if (e.kind === 'token_issued') return p['consumerId'] === cert.consumerId;
    return false;
  });

  const files: Record<string, Uint8Array> = {};
  const entryIndex: { file: string; seq: number; kind: string; entryHash: string }[] = [];

  for (const entry of relevant) {
    const result = await audit.getProof(entry.id);
    const name = `entries/${String(entry.seq).padStart(6, '0')}-${entry.kind}.json`;
    files[name] = strToU8(JSON.stringify({
      entry,
      anchor: result?.anchor ?? null,
      proof: result?.proof ?? null,
    }, null, 2));
    entryIndex.push({ file: name, seq: entry.seq, kind: entry.kind, entryHash: entry.entryHash });
  }

  const anchors = await audit.listAnchors();
  const jwks = await keys.getPublicJwks();

  const manifest = {
    kind: 'brip-regulator-export',
    generatedAt: new Date().toISOString(),
    certificate: { id: cert.id, domain: domainName, consumer: cert.consumerId,
      termsHash: cert.termsHash, period: { start: cert.periodStart, end: cert.periodEnd },
      eventCount: cert.eventCount },
    contents: {
      'certificate.jws': 'the signed provenance certificate (compact JWS, ES256)',
      'certificate.json': 'decoded certificate row for convenience',
      'jwks.json': 'public keys to verify all signatures offline',
      'anchors.json': 'signed Merkle roots covering the audit entries',
      'entries/*.json': 'each relevant audit entry with its Merkle inclusion proof',
      'README.txt': 'how to independently re-verify this bundle',
    },
    entries: entryIndex,
  };

  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['certificate.jws'] = strToU8(cert.jws);
  files['certificate.json'] = strToU8(JSON.stringify(cert, null, 2));
  files['jwks.json'] = strToU8(JSON.stringify(jwks, null, 2));
  files['anchors.json'] = strToU8(JSON.stringify(anchors, null, 2));
  files['README.txt'] = strToU8(README(domainName, cert.id));

  const zip = zipSync(files, { level: 6 });
  return { filename: `brip-export-${cert.id}.zip`, zip };
}

function README(domain: string, certId: string): string {
  return `BRIP regulator export — ${domain} — certificate ${certId}

This bundle lets you verify AI content-licensing provenance WITHOUT trusting BRIP.
Everything here is checkable offline with standard tools (any ES256 JWS verifier
and a SHA-256 implementation).

What each file proves
---------------------
1. jwks.json          The public signing keys. All signatures below verify against
                      these. (BRIP never ships private keys.)
2. certificate.jws    A compact JWS (ES256). Verify it against jwks.json. Its claims
                      bind a consumer to this domain's licensing terms (termsHash),
                      a time period, and a count of verified access events.
3. anchors.json       Each anchor is a signed Merkle root (JWS) over a contiguous
                      range of audit-log entries. Verify each signature against
                      jwks.json.
4. entries/*.json     One audit-log entry per file, each with a Merkle inclusion
                      proof. For each entry:
                        a. Recompute entry_hash = SHA256(canonical_json(payload) || prev_hash).
                           canonical_json = JSON with object keys sorted lexicographically,
                           no insignificant whitespace.
                        b. Confirm proof.leaf === entry.entryHash.
                        c. Fold the proof path with SHA256 (right sibling: SHA256(acc||sib);
                           left sibling: SHA256(sib||acc)) and confirm it equals the
                           anchored Merkle root in anchors.json.

How to re-verify (independently)
--------------------------------
  brip-cli audit verify --url <your BRIP base URL> --entry <entryId>
…or implement steps 1–4 yourself; the algorithm above is complete and standard.
If every signature verifies and every inclusion proof folds to an anchored root,
the log has not been altered since it was anchored, and the certificate's claims
are authentic.
`;
}
