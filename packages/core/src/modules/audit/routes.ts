import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { parse } from '../../shared/validate.js';
import { notFound } from '../../shared/errors.js';
import type { KeyProvider } from '../tokens/keys.js';
import { AuditLog } from './service.js';

const idParam = z.object({ id: z.string().uuid() });

export interface AuditDeps {
  db: Db;
  keyProvider: KeyProvider;
}

export function auditRoutes(deps: AuditDeps) {
  const audit = new AuditLog(deps.db);
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/v1/transparency/anchors', async () => ({ anchors: await audit.listAnchors() }));

    app.get('/v1/transparency/entries/:id/proof', async (req) => {
      const { id } = parse(idParam, req.params);
      const proof = await audit.getProof(id);
      if (!proof) throw notFound('No anchored proof for that entry yet');
      return proof;
    });
  };
}
