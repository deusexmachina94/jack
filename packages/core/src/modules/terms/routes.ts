import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { parse } from '../../shared/validate.js';
import type { Auditor } from '../../shared/audit-port.js';
import { ingestTerms } from './service.js';

const idParam = z.object({ id: z.string().uuid() });
const ingestBody = z.object({
  raw: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});

export interface TermsDeps {
  db: Db;
  auditor: Auditor;
}

export function termsRoutes(deps: TermsDeps) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.post('/v1/domains/:id/terms', async (req, reply) => {
      const { id } = parse(idParam, req.params);
      const body = parse(ingestBody, req.body);
      const term = await ingestTerms(
        deps.db,
        { domainId: id, raw: body.raw, ...(body.sourceUrl ? { sourceUrl: body.sourceUrl } : {}) },
        deps.auditor,
      );
      return reply.code(201).send(term);
    });
  };
}
