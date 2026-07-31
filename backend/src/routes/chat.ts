import type { FastifyInstance } from 'fastify';
import { MAX_CHAT_LENGTH } from '../security';
import type { AppServices } from '../services';

interface ChatBody {
  /** The seat this message is sent as. Must be a real seat in the game — spectators are read-only. */
  playerId: string;
  body: string;
}

/**
 * In-game chat — send a message (presence + chat feature).
 *
 * **REST-authoritative, WS push-only.** Chat is sent here over REST (never up the push-only socket) and
 * fanned out to every viewer as a `{ type: 'chat' }` envelope on the same hub the state pushes ride. It
 * is coordination state, **game-agnostic** and **table-public**: no `GameModule` is consulted, the engine
 * never learns a message exists, and every viewer of the game sees every message (no per-seat redaction),
 * consistent with "everything logged is public" (design-patterns §3).
 *
 * Sender identity follows the platform's no-auth, trusted-LAN model (like abandon/rematch): a send must
 * **name a real seat** (`playerId`), and the seat's current display name is captured as the message's
 * `sender`. A spectator holds no seat, so it cannot send — read-only by construction. Backfill on resume
 * is delivered by the stream route (`routes/stream.ts`).
 */
export function registerChatRoutes(app: FastifyInstance, services: AppServices): void {
  const { load, chats, hub, badRequest } = services;

  app.post<{ Params: { id: string }; Body: ChatBody }>(
    '/games/:id/chat',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId', 'body'],
          properties: {
            playerId: { type: 'string', minLength: 1 },
            // Bounded (§4.7): chat is stored and echoed to every viewer, so an unbounded body would be a
            // storage/broadcast amplifier. `minLength: 1` rejects an empty message before any handler runs.
            body: { type: 'string', minLength: 1, maxLength: MAX_CHAT_LENGTH },
          },
        },
      },
    },
    async (request, reply) => {
      const loaded = load(reply, request.params.id);
      if (!loaded) return reply;
      const { state, module } = loaded;

      // Trim to reject whitespace-only bodies the schema's minLength lets through; a message is either
      // real text or a 400. (The schema already bounds the raw length.)
      const body = request.body.body.trim();
      if (body.length === 0) return badRequest(reply, 'A chat message cannot be empty');

      // The sender must be a real seat in this game. This is what makes spectators read-only and gives
      // every message a stable, secret-free identity — the seat's own display name from `summarize`.
      const sender = module.summarize(state).players.find((player) => player.id === request.body.playerId);
      if (!sender) {
        return reply.code(400).send({
          error: { code: 'INVALID_SENDER', message: 'Only a seated player can send chat messages' },
        });
      }

      const message = chats.append(
        request.params.id,
        { senderId: sender.id, sender: sender.name, body },
        new Date().toISOString(),
      );
      // Fan out to every viewer of the game — table-public, so the same frame for everyone. A single
      // new message travels as a one-element `messages` list, the same shape the resume backfill uses.
      hub.broadcastEach(request.params.id, () => ({ type: 'chat', messages: [message] }));
      return reply.code(201).send({ message });
    },
  );
}
