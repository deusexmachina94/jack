import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('core app skeleton', () => {
  it('responds on /health', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'brip-core' });
    await app.close();
  });
});
