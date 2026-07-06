import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { parse } from '../../shared/validate.js';
import { recordAccessEvent } from './service.js';

// Shape reported by @brip/middleware-node (fire-and-forget).
const eventBody = z.object({
  type: z.literal('access').optional(),
  domain: z.string().min(1),
  consumer: z.string().optional(),
  jti: z.string().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional(),
});

export interface BillingDeps {
  db: Db;
}

export function billingRoutes(deps: BillingDeps) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.post('/v1/events', async (req, reply) => {
      const body = parse(eventBody, req.body);
      await recordAccessEvent(deps.db, {
        domain: body.domain,
        ...(body.consumer ? { consumerId: body.consumer } : {}),
        ...(body.jti ? { tokenJti: body.jti } : {}),
        ...(body.userAgent ? { userAgent: body.userAgent } : {}),
        ...(body.url ? { url: body.url } : {}),
      });
      return reply.code(202).send({ accepted: true });
    });
  };
}
