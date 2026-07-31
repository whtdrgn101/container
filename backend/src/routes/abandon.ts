import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../services';

/**
 * Abandoning a game (soft delete) and the platform-wide guard that keeps an abandoned game out of
 * play. Both are game-agnostic — abandonment is a platform concern, not a rule, so no `GameModule`
 * hook is involved.
 *
 * ⚠️ The guard is a `preHandler` that must be registered **before** every mutating route it protects
 * (Fastify binds hooks to routes at registration time). `buildApp` calls this registrar early, ahead
 * of the game, module and lobby routes, for exactly that reason — move it after them and it silently
 * stops protecting the routes it skipped.
 */
export function registerAbandonRoutes(app: FastifyInstance, services: AppServices): void {
  const { repo, hub, notFound, abandoned } = services;

  /**
   * Refuse every mutating request against an abandoned game, whatever route it targets.
   *
   * A hook rather than a check per route, because **modules register their own mutating endpoints**
   * (Container's `/auction/bids` and `/auction/resolve` both reach `applyAction`) and those would
   * otherwise sail straight past an abandon check that only `/actions` did. Gating centrally means a
   * game never has to know what abandonment is — which is the whole point of it being a platform
   * concern rather than a rule.
   *
   * ⚠️ Fastify binds hooks to routes **at registration time**, so this must stay above every route
   * registered after it. Register this group before the mutating routes and it silently stops
   * protecting the ones it skipped.
   */
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    // The route *pattern* ('/games/:id/actions'), not the URL — so a query string can't fool it.
    const route = request.routeOptions?.url;
    if (!route?.startsWith('/games/:id/')) return;
    if (route === '/games/:id/abandon') return; // idempotent: abandoning twice is a success
    const gameId = (request.params as { id?: string }).id;
    if (gameId && repo.isAbandoned(gameId)) return abandoned(reply, gameId);
  });

  /**
   * Abandon a game: close out something nobody intends to finish, so it stops cluttering the resume
   * list. A **soft delete** — the row and its move log survive, and the game stays readable; it just
   * can't be played on, and its bots stop.
   *
   * Deliberately **not** scored. `status: 'ended'` means a game reached its real end and
   * `finalScoring` ran; an abandoned game has no legitimate winner, and inventing one would make
   * `results`/`winnerIds` lie about a game nobody finished.
   *
   * Game-agnostic on purpose: abandoning needs to know nothing about containers or bids, so it lives
   * in the core and every future game gets it for free. No `GameModule` hook required.
   *
   * Idempotent — abandoning twice is a success, so a double-click or a retry is harmless. Not
   * authenticated, like every other seat action here (trusted-LAN use).
   */
  app.post<{ Params: { id: string } }>('/games/:id/abandon', async (request, reply) => {
    if (!repo.exists(request.params.id)) return notFound(reply, request.params.id);
    repo.abandon(request.params.id);
    // Tell anyone still watching, so a client sitting on the board finds out rather than discovering
    // it on its next rejected move.
    hub.broadcastEach(request.params.id, () => ({ type: 'abandoned', gameId: request.params.id }));
    return reply.send({ abandoned: true });
  });
}
