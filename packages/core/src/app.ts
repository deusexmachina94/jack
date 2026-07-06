import Fastify, { type FastifyInstance } from 'fastify';
import { AppError } from './shared/errors.js';
import type { Db } from './db/client.js';
import type { DnsResolver } from './modules/registry/dns.js';
import type { KeyProvider } from './modules/tokens/keys.js';
import type { Auditor } from './shared/audit-port.js';
import { registryRoutes } from './modules/registry/index.js';
import { termsRoutes } from './modules/terms/index.js';
import { verifyRoutes, VerifyService } from './modules/verify/index.js';
import { tokenRoutes, TokenService } from './modules/tokens/index.js';
import { auditRoutes } from './modules/audit/index.js';

export interface AppDeps {
  db: Db;
  dns: DnsResolver;
  keyProvider: KeyProvider;
  auditor: Auditor;
  /** Issuer identity embedded in access tokens (`iss` claim). */
  issuer: string;
}

/**
 * Assemble the Fastify app from its dependencies. Modules are wired here through
 * their exported route factories only — no module reaches into another's internals.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Internal error' });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'brip-core' }));

  const verifyService = new VerifyService(deps.db);
  const tokenService = new TokenService(deps.db, deps.keyProvider, deps.auditor, deps.issuer);

  await app.register(registryRoutes({ db: deps.db, dns: deps.dns }));
  await app.register(termsRoutes({ db: deps.db, auditor: deps.auditor }));
  await app.register(verifyRoutes({ verifyService, keyProvider: deps.keyProvider }));
  await app.register(tokenRoutes({ db: deps.db, tokenService }));
  await app.register(auditRoutes({ db: deps.db, keyProvider: deps.keyProvider }));

  return app;
}
