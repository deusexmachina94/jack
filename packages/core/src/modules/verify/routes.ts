import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../../shared/validate.js';
import type { KeyProvider } from '../tokens/keys.js';
import { VerifyService } from './service.js';

const verifyQuery = z.object({ url: z.string().min(1) });

export interface VerifyDeps {
  verifyService: VerifyService;
  keyProvider: KeyProvider;
}

export function verifyRoutes(deps: VerifyDeps) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/v1/verify', async (req) => {
      const { url } = parse(verifyQuery, req.query);
      return deps.verifyService.verify(url);
    });

    app.get('/.well-known/brip-keys.json', async (_req, reply) => {
      const jwks = await deps.keyProvider.getPublicJwks();
      return reply.header('cache-control', 'public, max-age=300').send(jwks);
    });
  };
}
