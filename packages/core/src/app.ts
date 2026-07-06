import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Builds the Fastify app for BRIP core.
 *
 * This is the skeleton only. Module routes (registry, terms, verify, tokens,
 * audit, billing) are registered here as they are implemented, starting in
 * Phase 1a — see docs/SPEC.md. Modules MUST be wired in through their exported
 * plugin/service interface, never by importing another module's internals
 * (CLAUDE.md hard rule).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  // Infrastructure route — liveness only, not part of the versioned API surface.
  app.get('/health', async () => ({ status: 'ok', service: 'brip-core' }));

  // Phase 1a+ : await app.register(registryRoutes, { prefix: '/v1' }); …

  return app;
}
