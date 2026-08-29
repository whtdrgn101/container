import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Lobby, LobbyMember } from '../lobbies';
import { MAX_GAME_TYPE_LENGTH, MAX_NAME_LENGTH, MAX_TABLE_OPTIONS } from '../security';
import type { AppServices } from '../services';

/**
 * Lobbies: create an empty room, join by code with a name, re-pick a colour while waiting, and start
 * when every seat is filled. Coordination state outside the engine, like bots and rematches.
 */
export function registerLobbyRoutes(app: FastifyInstance, services: AppServices): void {
  const {
    registry,
    lobbies,
    defaultGameType,
    startGame,
    gamePayload,
    sendGameError,
    rejectDifficulty,
    tableOptionsOrReject,
  } = services;

  const lobbyNotFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: { code: 'LOBBY_NOT_FOUND', message: `No lobby with id "${id}"` } });

  /**
   * The colour palette a lobby offers, from its game's module (the module owns the palette, C1-style —
   * the seat range comes from the same place). Empty if the game is no longer hosted.
   */
  const paletteOf = (lobby: Lobby): readonly string[] => registry.get(lobby.gameType)?.colors ?? [];

  /** The AI difficulty tiers a lobby's game offers (CS4), or `undefined` if it declares none. */
  const difficultiesOf = (lobby: Lobby): readonly string[] | undefined => registry.get(lobby.gameType)?.botDifficulties;

  /**
   * Reject a colour pick that isn't in the palette (`INVALID_COLOR`, 400) or is already held by
   * another seat (`COLOR_TAKEN`, 409). `exceptSeat` is the seat doing the picking, so re-selecting your
   * own colour is fine. Returns the sent reply to reject, or `null` to accept.
   */
  const rejectColor = (
    reply: FastifyReply,
    palette: readonly string[],
    color: string,
    members: readonly (LobbyMember | null)[],
    exceptSeat: number,
  ): FastifyReply | null => {
    if (!palette.includes(color)) {
      return reply
        .code(400)
        .send({ error: { code: 'INVALID_COLOR', message: `"${color}" is not a colour in this game` } });
    }
    if (members.some((member, seat) => seat !== exceptSeat && member?.color === color)) {
      return reply.code(409).send({ error: { code: 'COLOR_TAKEN', message: `Colour "${color}" is already taken` } });
    }
    return null;
  };

  app.post<{ Body: { seats?: number; gameType?: string; options?: Record<string, unknown> } }>(
    '/lobbies',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            seats: { type: 'number' },
            gameType: { type: 'string', minLength: 1, maxLength: MAX_GAME_TYPE_LENGTH },
            // The table's rule variants, chosen when the room is opened (kernel 1.5.0). Bounded here;
            // validated against the chosen game's declaration below. See `POST /games` for why the
            // values themselves are unconstrained at the schema layer.
            options: { type: 'object', maxProperties: MAX_TABLE_OPTIONS },
          },
        },
      },
    },
    async (request, reply) => {
      const gameType = request.body?.gameType ?? defaultGameType;
      const module = registry.get(gameType);
      if (!module) {
        return reply.code(400).send({
          error: { code: 'UNKNOWN_GAME_TYPE', message: `This server does not host a game called "${gameType}"` },
        });
      }
      // The seat range is the *chosen game's*, not a constant — Container's 3–5 is Container's rule.
      const { minPlayers, maxPlayers } = module;
      const seats = request.body?.seats ?? minPlayers;
      if (!Number.isInteger(seats) || seats < minPlayers || seats > maxPlayers) {
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_SEAT_COUNT', message: `Seats must be ${minPlayers}–${maxPlayers}` } });
      }
      // Resolve the house rules once, here, and store them on the room — so every player who joins is
      // looking at the same agreed table, and `start` needs no second validation pass.
      const options = tableOptionsOrReject(reply, module, request.body?.options);
      if (!options) return reply;
      const lobby: Lobby = {
        id: randomUUID(),
        gameType,
        seats,
        members: Array.from({ length: seats }, () => null),
        status: 'open',
        gameId: null,
        options,
      };
      lobbies.create(lobby);
      return reply.code(201).send({ lobby });
    },
  );

  // The home-screen "waiting for players" list: open lobbies with a free seat.
  app.get('/lobbies', async () => ({ lobbies: lobbies.listOpen() }));

  app.get<{ Params: { id: string } }>('/lobbies/:id', async (request, reply) => {
    const lobby = lobbies.get(request.params.id);
    if (!lobby) return lobbyNotFound(reply, request.params.id);
    return reply.send({ lobby });
  });

  app.post<{ Params: { id: string }; Body: { name: string; bot?: boolean; color?: string; difficulty?: string } }>(
    '/lobbies/:id/join',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            // Bounded (§4.7): the claimed name is persisted and echoed to every waiting-room poll.
            name: { type: 'string', minLength: 1, maxLength: MAX_NAME_LENGTH },
            bot: { type: 'boolean' },
            // Optional colour pick, validated against this game's palette + the other seats' picks.
            color: { type: 'string' },
            // Optional bot-difficulty tier (CS4), validated against this game's declared tiers.
            difficulty: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const lobby = lobbies.get(request.params.id);
      if (!lobby) return lobbyNotFound(reply, request.params.id);
      if (lobby.status !== 'open') {
        return reply.code(409).send({ error: { code: 'LOBBY_STARTED', message: 'This game has already started' } });
      }
      const seat = lobby.members.findIndex((member) => member === null);
      if (seat === -1) {
        return reply.code(409).send({ error: { code: 'LOBBY_FULL', message: 'All seats are taken' } });
      }
      const color = request.body.color;
      if (color !== undefined && rejectColor(reply, paletteOf(lobby), color, lobby.members, seat)) return reply;
      const isBot = request.body.bot === true;
      const difficulty = request.body.difficulty;
      if (rejectDifficulty(reply, difficultiesOf(lobby), difficulty, isBot)) return reply;
      const claimed: LobbyMember = {
        name: request.body.name.trim(),
        bot: isBot,
        ...(color !== undefined ? { color } : {}),
        ...(difficulty !== undefined ? { difficulty } : {}),
      };
      const members = lobby.members.map((member, i) => (i === seat ? claimed : member));
      const updated: Lobby = { ...lobby, members };
      lobbies.update(updated);
      return reply.send({ lobby: updated, seat });
    },
  );

  /**
   * Change a seat's colour while waiting in the lobby (the waiting room polls, so a re-pick shows up
   * live for everyone). Seats aren't authenticated — the client names the seat it's changing, the same
   * trusted-LAN bargain as resuming a game or rejoining a lobby. The pick is validated against the
   * palette + the other seats, so two seats can't end up the same colour.
   */
  app.post<{ Params: { id: string }; Body: { seat: number; color: string } }>(
    '/lobbies/:id/color',
    {
      schema: {
        body: {
          type: 'object',
          required: ['seat', 'color'],
          properties: { seat: { type: 'number' }, color: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const lobby = lobbies.get(request.params.id);
      if (!lobby) return lobbyNotFound(reply, request.params.id);
      if (lobby.status !== 'open') {
        return reply.code(409).send({ error: { code: 'LOBBY_STARTED', message: 'This game has already started' } });
      }
      const { seat, color } = request.body;
      const member = lobby.members[seat];
      if (!Number.isInteger(seat) || seat < 0 || seat >= lobby.members.length || !member) {
        return reply.code(409).send({ error: { code: 'SEAT_NOT_CLAIMED', message: `Seat ${seat} is not claimed` } });
      }
      if (rejectColor(reply, paletteOf(lobby), color, lobby.members, seat)) return reply;
      const members = lobby.members.map((existing, i) => (i === seat ? { ...member, color } : existing));
      const updated: Lobby = { ...lobby, members };
      lobbies.update(updated);
      return reply.send({ lobby: updated, seat });
    },
  );

  app.post<{ Params: { id: string } }>('/lobbies/:id/start', async (request, reply) => {
    const lobby = lobbies.get(request.params.id);
    if (!lobby) return lobbyNotFound(reply, request.params.id);
    if (lobby.status === 'started') {
      return reply.code(409).send({ error: { code: 'LOBBY_STARTED', message: 'This game has already started' } });
    }
    if (lobby.members.some((member) => member === null)) {
      return reply.code(409).send({ error: { code: 'LOBBY_NOT_READY', message: 'Every seat must be filled first' } });
    }
    // The lobby chose its game when it was created; a module removed since then is the one way this
    // can fail, and it should say so rather than deal the wrong game.
    const module = registry.get(lobby.gameType);
    if (!module) {
      return reply.code(409).send({
        error: {
          code: 'GAME_TYPE_UNAVAILABLE',
          message: `This lobby is for "${lobby.gameType}", which this server does not host`,
        },
      });
    }
    try {
      const members = lobby.members as LobbyMember[];
      const started = startGame(
        module,
        members.map((member) => ({
          name: member.name,
          bot: member.bot,
          color: member.color,
          difficulty: member.difficulty,
        })),
        // The house rules agreed when the room was opened. Absent on a lobby written before the
        // feature, which `startGame` resolves to this game's declared defaults.
        lobby.options,
      );
      const gameId = module.summarize(started).id;
      lobbies.update({ ...lobby, status: 'started', gameId });
      return reply.code(201).send(gamePayload(module, gameId, started, module.summarize(started).activePlayerId));
    } catch (error) {
      return sendGameError(reply, module, error);
    }
  });
}
