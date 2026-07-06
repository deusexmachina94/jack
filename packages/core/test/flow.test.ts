import { describe, it, expect } from 'vitest';
import { makeTestApp, type TestApp } from './helpers/app.js';
import { verifyAccessToken } from '../src/modules/tokens/index.js';

const NZZ_RSL = `<rsl><content url="https://nzz.ch/"><license>
    <permits type="usage">search</permits>
    <prohibits type="usage">ai-train</prohibits>
    <payment type="per-crawl" currency="CHF" amount="2.00"><usage>ai-input</usage></payment>
    <legal url="https://nzz.ch/license"/>
  </license></content></rsl>`;

async function onboardNzz(t: TestApp): Promise<{ domainId: string }> {
  const pub = (await t.app.inject({
    method: 'POST', url: '/v1/publishers',
    payload: { name: 'NZZ', email: 'ops@nzz.ch' },
  })).json();

  const domain = (await t.app.inject({
    method: 'POST', url: `/v1/publishers/${pub.id}/domains`,
    payload: { domain: 'nzz.ch' },
  })).json();

  // Publisher "adds" the DNS TXT record, then verification passes.
  t.dnsRecords[`_brip.nzz.ch`] = [domain.challenge];
  const verified = (await t.app.inject({
    method: 'POST', url: `/v1/domains/${domain.id}/verify`,
  })).json();
  expect(verified.status).toBe('verified');

  await t.app.inject({
    method: 'POST', url: `/v1/domains/${domain.id}/terms`,
    payload: { raw: NZZ_RSL, sourceUrl: 'https://nzz.ch/.well-known/rsl.xml' },
  });

  return { domainId: domain.id };
}

describe('end-to-end licensing flow', () => {
  it('register → verify domain → ingest terms → /v1/verify returns them', async () => {
    const t = await makeTestApp();
    await onboardNzz(t);

    const res = await t.app.inject({ method: 'GET', url: '/v1/verify?url=https://nzz.ch/article/123' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.domain).toBe('nzz.ch');
    expect(body.verified).toBe(true);
    expect(body.terms.version).toBe(1);
    expect(body.terms.policy.usage['ai-train']).toBe('denied');
    expect(body.terms.policy.pricing).toEqual({ unit: 'per-crawl', amountMinor: 200, currency: 'CHF' });

    await t.close();
  });

  it('issues an access token that verifies offline against the JWKS', async () => {
    const t = await makeTestApp();
    await onboardNzz(t);

    const issued = (await t.app.inject({
      method: 'POST', url: '/v1/access-tokens',
      payload: { consumerId: 'acme-ai', domain: 'nzz.ch' },
    })).json();
    expect(issued.token).toBeTypeOf('string');
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const jwks = (await t.app.inject({ method: 'GET', url: '/.well-known/brip-keys.json' })).json();
    const claims = await verifyAccessToken(issued.token, jwks, {
      issuer: t.issuer, audience: 'nzz.ch',
    });
    expect(claims.sub).toBe('acme-ai');
    expect(claims.jti).toBe(issued.jti);
    expect(claims.terms?.contentHash).toMatch(/^[0-9a-f]{64}$/);

    await t.close();
  });

  it('rejects a token for an unverified or termsless domain', async () => {
    const t = await makeTestApp();
    const res = await t.app.inject({
      method: 'POST', url: '/v1/access-tokens',
      payload: { consumerId: 'acme-ai', domain: 'unknown.example' },
    });
    expect(res.statusCode).toBe(422);
    await t.close();
  });

  it('unverified domain reports verified:false', async () => {
    const t = await makeTestApp();
    const res = await t.app.inject({ method: 'GET', url: '/v1/verify?url=https://nobody.example/' });
    expect(res.json()).toMatchObject({ domain: null, verified: false, terms: null });
    await t.close();
  });
});
