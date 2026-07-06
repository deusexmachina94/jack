import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { parse } from '../../shared/validate.js';
import type { KeyProvider } from '../tokens/keys.js';
import { issueCertificate, verifyCertificate } from './service.js';
import { buildRegulatorExport } from './export.js';

const issueBody = z.object({
  consumerId: z.string().min(1),
  domain: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
const certIdParam = z.object({ certId: z.string().uuid() });

export interface CertificateDeps {
  db: Db;
  keyProvider: KeyProvider;
}

export function certificateRoutes(deps: CertificateDeps) {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.post('/v1/certificates', async (req, reply) => {
      const body = parse(issueBody, req.body);
      const { certificate, jws } = await issueCertificate(deps.db, deps.keyProvider, {
        consumerId: body.consumerId,
        domain: body.domain,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
      });
      return reply.code(201).send({ ...certificate, jws });
    });

    app.get('/v1/transparency/verify/:certId', async (req) => {
      const { certId } = parse(certIdParam, req.params);
      return verifyCertificate(deps.db, deps.keyProvider, certId);
    });

    app.get('/v1/certificates/:certId/export', async (req, reply) => {
      const { certId } = parse(certIdParam, req.params);
      const { filename, zip } = await buildRegulatorExport(deps.db, deps.keyProvider, certId);
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(Buffer.from(zip));
    });
  };
}
