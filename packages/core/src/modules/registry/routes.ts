import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { parse } from '../../shared/validate.js';
import type { DnsResolver } from './dns.js';
import { addDomain, createPublisher, verifyDomain } from './service.js';

const createPublisherBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});
const addDomainBody = z.object({ domain: z.string().min(1) });
const idParam = z.object({ id: z.string().uuid() });

export interface RegistryDeps {
  db: Db;
  dns: DnsResolver;
}

export function registryRoutes(deps: RegistryDeps) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.post('/v1/publishers', async (req, reply) => {
      const body = parse(createPublisherBody, req.body);
      const publisher = await createPublisher(deps.db, body);
      return reply.code(201).send(publisher);
    });

    app.post('/v1/publishers/:id/domains', async (req, reply) => {
      const { id } = parse(idParam, req.params);
      const { domain } = parse(addDomainBody, req.body);
      const row = await addDomain(deps.db, id, domain);
      return reply.code(201).send({
        ...row,
        instructions: {
          recordType: 'TXT',
          host: `_brip.${row.domain}`,
          value: row.challenge,
        },
      });
    });

    app.post('/v1/domains/:id/verify', async (req) => {
      const { id } = parse(idParam, req.params);
      return verifyDomain(deps.db, id, deps.dns);
    });
  };
}
