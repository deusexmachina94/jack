import { createVerifier, type BripClaims, type VerifierConfig } from './verify.js';

/** Minimal request/response shapes so we depend on neither Express nor Fastify. */
export interface MinimalReq {
  headers: Record<string, string | string[] | undefined>;
  method?: string | undefined;
  url?: string | undefined;
  /** Populated with verified BRIP claims when a valid token is present. */
  brip?: BripClaims | undefined;
}
export interface MinimalRes {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}
export type Next = () => void;

export interface BripMiddlewareOptions extends VerifierConfig {
  /** Where to report access events. Reporting is fire-and-forget. */
  reportUrl?: string;
  /** Answer token-less known-AI agents with 402. Default false. */
  challenge402?: boolean;
  /** Override the AI user-agent matcher. */
  aiUserAgents?: RegExp;
  /** Injectable fetch (defaults to global fetch); used for reporting. */
  fetchImpl?: typeof fetch;
  /** Called when reporting fails — never throws into the request path. */
  onReportError?: (err: unknown) => void;
}

const DEFAULT_AI_UA =
  /GPTBot|ClaudeBot|anthropic-ai|CCBot|Google-Extended|PerplexityBot|Bytespider|Amazonbot|cohere-ai/i;

const HEADER = 'brip-access-token';

function headerValue(req: MinimalReq, name: string): string | undefined {
  const v = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Express/Connect-style BRIP middleware.
 *
 * Invariants (SPEC §3.4 / Prompt Pack Phase 2c):
 *  - Verification is offline (cached JWKS); the hot path never calls BRIP.
 *  - Reporting is fire-and-forget and MUST NOT block or fail the response,
 *    even if BRIP is unreachable.
 *  - A valid token attaches `req.brip`; an invalid one is ignored (not rejected)
 *    unless challenge402 applies to a token-less known-AI agent.
 */
export function bripMiddleware(options: BripMiddlewareOptions) {
  const verify = createVerifier(options);
  const aiUa = options.aiUserAgents ?? DEFAULT_AI_UA;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  const report = (event: Record<string, unknown>): void => {
    if (!options.reportUrl || !doFetch) return;
    // Fire-and-forget: swallow every failure so the publisher is never affected.
    Promise.resolve()
      .then(() => doFetch(options.reportUrl!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      }))
      .then(() => undefined)
      .catch((err) => options.onReportError?.(err));
  };

  return async function middleware(req: MinimalReq, res: MinimalRes, next: Next): Promise<void> {
    const token = headerValue(req, HEADER);
    const ua = headerValue(req, 'user-agent') ?? '';

    if (token) {
      try {
        const claims = await verify(token);
        req.brip = claims;
        report({
          type: 'access',
          jti: claims.jti,
          consumer: claims.sub,
          domain: claims.aud,
          url: req.url,
          userAgent: ua,
          at: new Date().toISOString(),
        });
      } catch {
        // Invalid/expired token: treat as anonymous, do not block.
        req.brip = undefined;
      }
      return next();
    }

    if (options.challenge402 && aiUa.test(ua)) {
      res.statusCode = 402;
      res.setHeader('content-type', 'application/json');
      res.setHeader('link', '</.well-known/brip-keys.json>; rel="brip-keys"');
      res.end(JSON.stringify({
        error: 'payment_required',
        message: 'This content requires a BRIP access token for AI use.',
      }));
      return;
    }

    return next();
  };
}
