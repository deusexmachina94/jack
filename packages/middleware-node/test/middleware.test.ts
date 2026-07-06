import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint, type JSONWebKeySet } from 'jose';
import { bripMiddleware, type MinimalReq, type MinimalRes } from '../src/index.js';

const ISSUER = 'https://brip.test';
const DOMAIN = 'nzz.ch';

let jwks: JSONWebKeySet;
let sign: (claims?: Record<string, unknown>, ttl?: string) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const pub = await exportJWK(publicKey);
  pub.alg = 'ES256';
  pub.use = 'sig';
  const kid = await calculateJwkThumbprint(pub);
  pub.kid = kid;
  jwks = { keys: [pub] };

  sign = (claims = {}, ttl = '15m') =>
    new SignJWT({ terms: { id: 't1', contentHash: 'abc' }, ...claims })
      .setProtectedHeader({ alg: 'ES256', kid, typ: 'JWT' })
      .setIssuer(ISSUER).setSubject('acme-ai').setAudience(DOMAIN)
      .setJti('jti-1').setIssuedAt().setExpirationTime(ttl)
      .sign(privateKey);
});

describe('bripMiddleware', () => {
  it('accepts a valid token, attaches claims, and calls next', async () => {
    const token = await sign();
    const req: MinimalReq = { headers: { 'brip-access-token': token }, url: '/a' };
    let nexted = false;
    const reports: unknown[] = [];
    const mw = bripMiddleware({
      jwks, issuer: ISSUER, audience: DOMAIN,
      reportUrl: 'https://api.brip.test/events',
      fetchImpl: (async (_u: string, init: RequestInit) => { reports.push(JSON.parse(String(init.body))); return new Response('ok'); }) as unknown as typeof fetch,
    });
    await mw(req, fakeRes().res, () => { nexted = true; });

    expect(nexted).toBe(true);
    expect(req.brip?.sub).toBe('acme-ai');
    // Report is fire-and-forget; allow the microtask to flush.
    await new Promise((r) => setTimeout(r, 10));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ type: 'access', consumer: 'acme-ai', domain: DOMAIN });
  });

  it('ignores an invalid token but still calls next (never blocks)', async () => {
    const req: MinimalReq = { headers: { 'brip-access-token': 'not.a.jwt' } };
    let nexted = false;
    const mw = bripMiddleware({ jwks, issuer: ISSUER, audience: DOMAIN });
    await mw(req, fakeRes().res, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(req.brip).toBeUndefined();
  });

  it('challenges a token-less known-AI agent with 402 when enabled', async () => {
    const req: MinimalReq = { headers: { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.0)' } };
    const r = fakeRes();
    let nexted = false;
    const mw = bripMiddleware({ jwks, challenge402: true });
    await mw(req, r.res, () => { nexted = true; });
    expect(nexted).toBe(false);
    expect(r.res.statusCode).toBe(402);
    expect(JSON.parse(r.body[0]!).error).toBe('payment_required');
  });

  it('lets a normal browser through untouched', async () => {
    const req: MinimalReq = { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh)' } };
    const r = fakeRes();
    let nexted = false;
    const mw = bripMiddleware({ jwks, challenge402: true });
    await mw(req, r.res, () => { nexted = true; });
    expect(nexted).toBe(true);
    expect(r.res.statusCode).toBe(200);
  });

  it('never throws into the request path when reporting fails', async () => {
    const token = await sign();
    const req: MinimalReq = { headers: { 'brip-access-token': token } };
    let nexted = false;
    let reportErr: unknown;
    const mw = bripMiddleware({
      jwks, issuer: ISSUER, audience: DOMAIN,
      reportUrl: 'https://down.example/events',
      fetchImpl: (async () => { throw new Error('network down'); }) as unknown as typeof fetch,
      onReportError: (e) => { reportErr = e; },
    });
    await mw(req, fakeRes().res, () => { nexted = true; });
    expect(nexted).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect((reportErr as Error).message).toBe('network down');
  });
});

function fakeRes(): { res: MinimalRes; body: string[] } {
  const body: string[] = [];
  const res: MinimalRes = {
    statusCode: 200,
    setHeader() {},
    end(b?: string) { if (b !== undefined) body.push(b); },
  };
  return { res, body };
}
