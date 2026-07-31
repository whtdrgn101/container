import type { FastifyInstance } from 'fastify';
import type { Rematch } from '../rematch';
import type { NewSeat, AppServices } from '../services';

/**
 * Rematch (play again, same players) — propose/accept and the read of a current proposal.
 *
 * Game-agnostic, like abandon: a rematch is "start another game with the same seats", true of every
 * game, so it lives in the core with no `GameModule` hook.
 */
export function registerRematchRoutes(app: FastifyInstance, services: AppServices): void {
  const { load, notFound, repo, botSeats, colorSeats, rematches, startGame, hub } = services;

  /**
   * Propose or accept a **rematch** of a finished game — play again with the same players.
   *
   * One human proposes, another agrees, and a fresh game of the same type starts with the same seats
   * **and** bot assignments; every watching client is pushed the new game's id and navigates to it.
   *
   * `controlledIds` is the caller's own seats (`null` ⇒ hotseat, one device drives everyone). The
   * server resolves those to human seats and needs **two distinct** to agree before starting — a lone
   * human vs bots needs only itself, and an all-bot table anyone watching can restart in one click.
   * Not seat-authenticated, like every other action here (trusted-LAN use).
   */
  app.post<{ Params: { id: string }; Body: { controlledIds?: readonly string[] | null } }>(
    '/games/:id/rematch',
    {
      schema: {
        body: {
          type: 'object',
          properties: { controlledIds: { type: ['array', 'null'], items: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const loaded = load(reply, request.params.id);
      if (!loaded) return reply;
      const { state, module } = loaded;

      const summary = module.summarize(state);
      if (summary.status !== 'ended') {
        return reply
          .code(409)
          .send({ error: { code: 'REMATCH_NOT_READY', message: 'A rematch can only start once the game has ended' } });
      }

      const botIds = new Set(botSeats.listForGame(request.params.id));
      const humanSeats = summary.players.map((p) => p.id).filter((id) => !botIds.has(id));

      const existing = rematches.get(request.params.id);
      // Already started — hand the new game id to a late caller so it navigates too (idempotent).
      if (existing?.newGameId) return reply.send({ rematch: existing });

      // `null`/omitted ⇒ hotseat: this device drives every seat, so it agrees for all human seats.
      const requested = request.body?.controlledIds;
      const agreeing = requested == null ? humanSeats : requested.filter((id) => humanSeats.includes(id));
      const agreed = [...new Set([...(existing?.agreed ?? []), ...agreeing])];

      // Two distinct humans must agree (proposer + accepter); one human vs bots needs only itself; an
      // all-bot table (no humans) can be restarted by anyone watching.
      const threshold = humanSeats.length === 0 ? 0 : Math.min(2, humanSeats.length);
      let newGameId: string | null = null;
      if (agreed.length >= threshold) {
        // Carry colours and bot difficulties over too, the same way bot assignments carry: the rematch
        // is the same table (CS4).
        const oldColors = colorSeats.listForGame(request.params.id);
        const oldDifficulties = botSeats.difficultiesForGame(request.params.id);
        const seats: NewSeat[] = summary.players.map((p) => ({
          name: p.name,
          bot: botIds.has(p.id),
          ...(oldColors[p.id] !== undefined ? { color: oldColors[p.id] } : {}),
          ...(botIds.has(p.id) && oldDifficulties[p.id] !== undefined ? { difficulty: oldDifficulties[p.id] } : {}),
        }));
        newGameId = module.summarize(startGame(module, seats)).id;
      }

      const rematch: Rematch = { gameId: request.params.id, agreed, newGameId };
      rematches.save(rematch, new Date().toISOString());
      // Everyone watching the finished game hears it: a proposal lights up "Accept", a start sends them
      // all to `newGameId`.
      hub.broadcastEach(request.params.id, () => ({ type: 'rematch', agreed, newGameId }));
      return reply.send({ rematch });
    },
  );

  /** The current rematch proposal for a game (for a client entering an already-finished game). */
  app.get<{ Params: { id: string } }>('/games/:id/rematch', async (request, reply) => {
    if (!repo.exists(request.params.id)) return notFound(reply, request.params.id);
    const rematch = rematches.get(request.params.id) ?? {
      gameId: request.params.id,
      agreed: [],
      newGameId: null,
    };
    return reply.send({ rematch });
  });
}
