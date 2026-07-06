import { describe, it, expect } from 'vitest';
import { makeTestApp } from './helpers/app.js';

describe('core app', () => {
  it('responds on /health', async () => {
    const t = await makeTestApp();
    const res = await t.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'brip-core' });
    await t.close();
  });

  it('serves a JWKS with an ES256 key', async () => {
    const t = await makeTestApp();
    const res = await t.app.inject({ method: 'GET', url: '/.well-known/brip-keys.json' });
    expect(res.statusCode).toBe(200);
    const jwks = res.json();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig' });
    expect(jwks.keys[0].d).toBeUndefined(); // never leak the private component
    await t.close();
  });

  it('maps validation failures to 400', async () => {
    const t = await makeTestApp();
    const res = await t.app.inject({ method: 'POST', url: '/v1/publishers', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
    await t.close();
  });
});
