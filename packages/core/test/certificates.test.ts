import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { makeTestApp, type TestApp } from './helpers/app.js';

const NZZ_RSL = `<rsl><content url="https://nzz.ch/"><license>
    <permits type="usage">search</permits>
    <payment type="per-crawl" currency="CHF" amount="2.00"><usage>ai-input</usage></payment>
  </license></content></rsl>`;

async function onboardAndAccess(t: TestApp): Promise<void> {
  const pub = (await t.app.inject({ method: 'POST', url: '/v1/publishers', payload: { name: 'NZZ', email: 'o@nzz.ch' } })).json();
  const domain = (await t.app.inject({ method: 'POST', url: `/v1/publishers/${pub.id}/domains`, payload: { domain: 'nzz.ch' } })).json();
  t.dnsRecords['_brip.nzz.ch'] = [domain.challenge];
  await t.app.inject({ method: 'POST', url: `/v1/domains/${domain.id}/verify` });
  await t.app.inject({ method: 'POST', url: `/v1/domains/${domain.id}/terms`, payload: { raw: NZZ_RSL } });
  await t.app.inject({ method: 'POST', url: '/v1/access-tokens', payload: { consumerId: 'acme-ai', domain: 'nzz.ch' } });
  // one reported access event
  await t.app.inject({ method: 'POST', url: '/v1/events', payload: { type: 'access', domain: 'nzz.ch', consumer: 'acme-ai', url: '/a/1' } });
}

const period = () => ({
  periodStart: new Date(Date.now() - 86_400_000).toISOString(),
  periodEnd: new Date(Date.now() + 86_400_000).toISOString(),
});

describe('certificates (Phase 3)', () => {
  it('issues a certificate that the public verifier accepts', async () => {
    const t = await makeTestApp();
    await onboardAndAccess(t);

    const cert = (await t.app.inject({
      method: 'POST', url: '/v1/certificates',
      payload: { consumerId: 'acme-ai', domain: 'nzz.ch', ...period() },
    })).json();
    expect(cert.eventCount).toBe(1);
    expect(cert.jws).toBeTypeOf('string');

    const verified = (await t.app.inject({ method: 'GET', url: `/v1/transparency/verify/${cert.id}` })).json();
    expect(verified.valid).toBe(true);
    expect(verified.claims.domain).toBe('nzz.ch');
    expect(verified.claims.consumer).toBe('acme-ai');

    await t.close();
  });

  it('produces a regulator export whose inclusion proofs re-verify independently', async () => {
    const t = await makeTestApp();
    await onboardAndAccess(t);
    const cert = (await t.app.inject({
      method: 'POST', url: '/v1/certificates',
      payload: { consumerId: 'acme-ai', domain: 'nzz.ch', ...period() },
    })).json();

    const res = await t.app.inject({ method: 'GET', url: `/v1/certificates/${cert.id}/export` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');

    const files = unzipSync(new Uint8Array(res.rawPayload));
    const names = Object.keys(files);
    expect(names).toContain('manifest.json');
    expect(names).toContain('certificate.jws');
    expect(names).toContain('jwks.json');
    expect(names).toContain('README.txt');
    expect(names.some((n) => n.startsWith('entries/'))).toBe(true);

    // Independently re-verify one entry's inclusion proof with our own SHA-256.
    const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
    const entryFile = names.find((n) => n.startsWith('entries/'))!;
    const { entry, proof } = JSON.parse(strFromU8(files[entryFile]!));
    expect(proof.leaf).toBe(entry.entryHash);
    let acc = proof.leaf;
    for (const step of proof.path) {
      acc = step.position === 'right' ? sha(acc + step.hash) : sha(step.hash + acc);
    }
    expect(acc).toBe(proof.root);

    await t.close();
  });
});
