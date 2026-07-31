import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/**
 * Serve the built web app (production single-container deploy). API routes registered before this take
 * precedence; any other GET falls back to `index.html` since the UI is a single page.
 *
 * ⚠️ **The SPA-fallback allowlist regex is a maintained hazard.** `/^\/(games|lobbies|health)\b/` is
 * the set of top-level API path prefixes that must 404-as-JSON rather than fall through to the SPA.
 * When you add a top-level API route, add its prefix here — otherwise a genuine 404 under it silently
 * serves `index.html` instead (CLAUDE.md / DEPLOY.md flag this too).
 */
export function registerStaticServing(app: FastifyInstance, staticDir: string): void {
  app.register(fastifyStatic, { root: staticDir });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !/^\/(games|lobbies|health)\b/.test(request.url)) {
      return reply.sendFile('index.html');
    }
    return reply
      .code(404)
      .send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
  });
}
