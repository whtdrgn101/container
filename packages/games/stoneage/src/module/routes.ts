import { applyAction, RESOURCE_PLACES, viewFor } from '../engine';
import type { PlaceId, StoneAgeState, Viewer } from '../engine';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ModuleContext } from './context';
import { rollDice } from './dice';
import { mapStoneAgeError } from './errors';

/**
 * Stone Age's dice-roll endpoint (roadmap SA2) — registered through `GameModule.routes`, so the core
 * never learns what a die is. Gathering resources rolls one die per person on the place; the engine is
 * pure, so the **server** rolls (from `ctx.rng`) and applies a `GATHER` action carrying the result. A
 * client asks to gather a place; it can't choose its own dice. Path is relative to `/games/:id/stoneage`.
 */
export function registerStoneAgeRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  const gameOf = (id: string) => ctx.games.get(id) as StoneAgeState | undefined;

  const notFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: { code: 'GAME_NOT_FOUND', message: `No game with id "${id}"` } });

  const viewerFrom = (raw: string | undefined, state: StoneAgeState): Viewer =>
    raw !== undefined ? raw.split(',').filter(Boolean) : (state.players[state.activePlayerIndex]?.id ?? null);

  app.post<{ Params: { id: string }; Body: { playerId: string; place: PlaceId }; Querystring: { viewer?: string } }>(
    '/roll',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId', 'place'],
          properties: {
            playerId: { type: 'string', minLength: 1 },
            // The dice places: the four resource places + the hunt (food). The engine validates the rest.
            place: { type: 'string', enum: [...RESOURCE_PLACES, 'hunt'] },
          },
        },
      },
    },
    async (request, reply) => {
      const state = gameOf(request.params.id);
      if (!state) return notFound(reply, request.params.id);

      const { playerId, place } = request.body;
      // One die per person the player has on that place (0 if none — the engine then rejects).
      const count = state.placements[place]?.[playerId] ?? 0;
      try {
        const next = applyAction(state, playerId, { type: 'GATHER', place, dice: rollDice(ctx.rng, count) });
        ctx.games.update(next);
        ctx.pushGame(request.params.id, next);
        ctx.bots.tick(request.params.id); // no bots yet — harmless

        const settled = gameOf(request.params.id) ?? next;
        return reply.send({
          game: viewFor(settled, viewerFrom(request.query.viewer, settled)),
          gameType: 'stoneage',
          bots: ctx.botSeats.listForGame(request.params.id),
          colors: ctx.colorsFor(request.params.id, settled),
        });
      } catch (error) {
        const mapped = mapStoneAgeError(error);
        if (!mapped) throw error;
        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );
}
