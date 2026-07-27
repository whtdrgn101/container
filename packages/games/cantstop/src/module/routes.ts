import { applyAction, viewFor } from '../engine';
import type { CantStopState, Viewer } from '../engine';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ModuleContext } from './context';
import { rollFourDice } from './dice';
import { mapCantStopError } from './errors';

/**
 * Can't Stop's dice-roll endpoint — registered through `GameModule.routes`, so the shared core never
 * learns what a die is.
 *
 * Why a route rather than an `/actions` move: rolling needs randomness, and the engine is pure. So the
 * server rolls here (from the injected `ctx.rng`) and applies a `ROLL` action carrying the result. A
 * client cannot supply its own dice — it just asks to roll — which is what keeps the game honest.
 *
 * **The path is relative to `/games/:id/cantstop`** (roadmap C1), so `/roll` serves
 * `POST /games/:id/cantstop/roll`. The core's scope guard has already checked the game exists and is a
 * Can't Stop game before any handler runs. Turn order, phase and busting are all the engine's to judge.
 */
export function registerCantStopRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  const gameOf = (id: string) => ctx.games.get(id) as CantStopState | undefined;

  const notFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: { code: 'GAME_NOT_FOUND', message: `No game with id "${id}"` } });

  /** `?viewer=p1,p3` ⇒ those seats; omitted ⇒ follow the active player (hotseat); `?viewer=` ⇒ none. */
  const viewerFrom = (raw: string | undefined, state: CantStopState): Viewer =>
    raw !== undefined ? raw.split(',').filter(Boolean) : (state.players[state.activePlayerIndex]?.id ?? null);

  app.post<{ Params: { id: string }; Body: { playerId: string }; Querystring: { viewer?: string } }>(
    '/roll',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId'],
          properties: { playerId: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const state = gameOf(request.params.id);
      if (!state) return notFound(reply, request.params.id);

      try {
        const next = applyAction(state, request.body.playerId, { type: 'ROLL', dice: rollFourDice(ctx.rng) });
        ctx.games.update(next);
        ctx.pushGame(request.params.id, next); // tell every connected client
        ctx.bots.tick(request.params.id); // no-op today (Can't Stop has no bots yet), harmless

        const settled = gameOf(request.params.id) ?? next;
        // Same `{ game, gameType, bots }` shape the core replies with — a generic client reads this
        // exactly like any other state response and needs `gameType` to pick a board.
        return reply.send({
          game: viewFor(settled, viewerFrom(request.query.viewer, settled)),
          gameType: 'cantstop',
          bots: ctx.botSeats.listForGame(request.params.id),
          colors: ctx.colorsFor(request.params.id, settled),
        });
      } catch (error) {
        const mapped = mapCantStopError(error);
        if (!mapped) throw error;
        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );
}
