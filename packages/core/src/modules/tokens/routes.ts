import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { parse } from '../../shared/validate.js';
import type { TokenService } from './service.js';

const issueBody = z.object({
  consumerId: z.string().min(1),
  domain: z.string().min(1),
});

export interface TokenDeps {
  db: Db;
  tokenService: TokenService;
}

export function tokenRoutes(deps: TokenDeps) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.post('/v1/access-tokens', async (req, reply) => {
      const body = parse(issueBody, req.body);
      const issued = await deps.tokenService.issue(body.consumerId, body.domain);
      return reply.code(201).send(issued);
    });
  };
}
