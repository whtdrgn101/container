import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../services';

/**
 * Liveness/readiness (`/health`) and the game catalogue (`/games/catalog`) — the two read-only,
 * gameless probes the shell and the compose healthcheck hit before any game exists.
 */
export function registerHealthRoutes(app: FastifyInstance, services: AppServices): void {
  const { registry, db } = services;

  /**
   * Liveness **and** readiness: actually touch the database with a cheap `SELECT 1`, so the compose
   * healthcheck (and `restart: unless-stopped`) can fire when the `/data` volume is unmounted, the
   * file is locked, or the handle is closed. The old constant `{ status: 'ok' }` proved only that the
   * event loop was alive — a database that had vanished still read as healthy (REVIEW §4.4). Kept
   * fast because it's polled every 30s. 503 on failure so `fetch(...).ok` in the compose check is false.
   */
  app.get('/health', async (_request, reply) => {
    try {
      db.prepare('SELECT 1').get();
      return { status: 'ok' };
    } catch (error) {
      app.log.error({ err: error }, 'health check failed: database unreachable');
      return reply.code(503).send({ status: 'unhealthy' });
    }
  });

  /** The games this site can host — what C2's picker lists. */
  app.get('/games/catalog', async () => ({ games: registry.list() }));
}
