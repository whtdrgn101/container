import type { FastifyInstance } from 'fastify';
import { StaleVersionError } from '../repository';
import { MAX_GAME_TYPE_LENGTH, MAX_NAME_LENGTH, MAX_SEATS, MAX_TABLE_OPTIONS } from '../security';
import type { NewSeat, AppServices } from '../services';

interface CreateGameBody {
  /** Which game to deal. Omit for the server's default (keeps the hotseat quick-start working). */
  gameType?: string;
  players: NewSeat[];
  /**
   * The table's rule-variant picks (kernel 1.5.0) — ids the chosen game declared in `tableOptions`.
   * Omit for a game's declared defaults, which is what every client sent before the feature existed.
   */
  options?: Record<string, unknown>;
}

interface ActionBody {
  playerId: string;
  action: unknown;
  /**
   * The version the client believes the game is at (REVIEW §4.2). When present and no longer current,
   * the move is refused with `409 STALE_VERSION` — the optimistic-concurrency check that turns a
   * double-click or a stale second device into a no-op instead of a double-apply. Omit for the old
   * unconditional behaviour.
   */
  expectedVersion?: number;
}

/**
 * The core game lifecycle over REST: create a game, list active games to resume, read one (projected
 * per viewer), and apply an action. Game-agnostic — every rule is deferred to the row's `GameModule`.
 */
export function registerGameRoutes(app: FastifyInstance, services: AppServices): void {
  const {
    registry,
    repo,
    defaultGameType,
    load,
    tick,
    startGame,
    gamePayload,
    pushGame,
    viewerFrom,
    sendError,
    sendGameError,
    badRequest,
    rejectColorPicks,
    rejectDifficultyPicks,
    tableOptionsOrReject,
  } = services;

  app.post<{ Body: CreateGameBody }>(
    '/games',
    {
      schema: {
        body: {
          type: 'object',
          required: ['players'],
          properties: {
            // Which game to deal. Optional: a bare POST still starts the default (the hotseat
            // quick-start posts no type), while C2's picker names one explicitly.
            gameType: { type: 'string', minLength: 1, maxLength: MAX_GAME_TYPE_LENGTH },
            // The table's rule variants. Values stay unconstrained here because only the *module*
            // knows which ids exist and what each accepts — `tableOptionsOrReject` does that check
            // below, against the game's own declaration. The schema's job is just to bound the object
            // (§4.7) so a hostile body can't be parsed before that check runs.
            options: { type: 'object', maxProperties: MAX_TABLE_OPTIONS },
            players: {
              type: 'array',
              // Bounded (§4.7): above any module's max seats (5 today), so no game is constrained, but
              // a hostile list of thousands of seats can't be stored in the state JSON.
              maxItems: MAX_SEATS,
              items: {
                type: 'object',
                required: ['name'],
                properties: {
                  // Bounded (§4.7): an unbounded name is stored in state JSON and echoed on every poll.
                  name: { type: 'string', minLength: 1, maxLength: MAX_NAME_LENGTH },
                  // A player-colour pick (a palette id). Honoured if valid/unique, else defaulted.
                  color: { type: 'string' },
                  bot: { type: 'boolean' },
                  // A bot seat's difficulty tier (CS4), validated against the game's declared tiers.
                  difficulty: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const gameType = request.body.gameType ?? defaultGameType;
      const module = registry.get(gameType);
      if (!module) {
        return reply.code(400).send({
          error: { code: 'UNKNOWN_GAME_TYPE', message: `This server does not host a game called "${gameType}"` },
        });
      }
      // Validate each seat's colour pick against this game's palette (invalid → 400) and for duplicates
      // (→ 409), rather than let `assignColors` quietly default a bad pick. An absent/all-unpicked list
      // passes untouched, so a colour-less create still behaves exactly as it did before this feature.
      if (
        rejectColorPicks(
          reply,
          module.colors,
          request.body.players.map((seat) => seat.color),
        )
      )
        return reply;
      // Validate each bot seat's difficulty against this game's declared tiers (CS4). A game with no
      // tiers rejects any difficulty at all; an unset tier always passes.
      if (rejectDifficultyPicks(reply, module.botDifficulties, request.body.players)) return reply;
      // Validate the table's rule variants against this game's declaration and fill in its defaults
      // (kernel 1.5.0). `null` ⇒ a 400 has already been sent naming the offending option.
      const options = tableOptionsOrReject(reply, module, request.body.options);
      if (!options) return reply;
      try {
        const started = startGame(module, request.body.players, options);
        const gameId = module.summarize(started).id;
        return reply.code(201).send(gamePayload(module, gameId, started, module.summarize(started).activePlayerId));
      } catch (error) {
        return sendGameError(reply, module, error);
      }
    },
  );

  // In-progress games, for the home-screen "resume" list. Summaries only — no secret scoring cards.
  // Abandoned games are excluded — that's what abandoning one is for.
  app.get('/games', async () => ({ games: repo.listActive((gameType) => registry.get(gameType)) }));

  app.get<{ Params: { id: string }; Querystring: { viewer?: string } }>('/games/:id', async (request, reply) => {
    const loaded = load(reply, request.params.id);
    if (!loaded) return reply;
    // Looking at a game is enough to drive it. Bot turns are normally played by whatever mutation
    // preceded them, but nothing mutates while it is *already* a bot's move — after a restart, or a
    // game seeded any other way, the AI would sit there forever and no human could unstick it,
    // because it isn't their turn. Ticking on read makes that self-healing; it's a no-op with no
    // bots, or when a human is on the clock.
    tick(request.params.id);
    const { module } = loaded;
    // Re-read: the bots may have moved it on since `load` (which already migrated the row).
    const state = repo.get(module, request.params.id)!;
    return reply.send({
      ...gamePayload(module, request.params.id, state, viewerFrom(request.query.viewer, module, state)),
      // Readable but not playable — say so, so a client that holds a link can show it rather than
      // offering moves that will only 409.
      ...(repo.isAbandoned(request.params.id) ? { abandoned: true } : {}),
    });
  });

  app.post<{ Params: { id: string }; Body: ActionBody; Querystring: { viewer?: string } }>(
    '/games/:id/actions',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId', 'action'],
          properties: {
            playerId: { type: 'string', minLength: 1 },
            // Deliberately opaque: the route can't enumerate every game's action types, so validation
            // is `module.parseAction`'s job in full. Don't re-add a `type` enum here.
            action: { type: 'object' },
            // Optimistic concurrency (§4.2): the client's known version. Optional — absent ⇒ today's
            // unconditional apply, so the field is backward-compatible.
            expectedVersion: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      // Abandonment is already refused by the preHandler above, before we get here.
      const loaded = load(reply, request.params.id);
      if (!loaded) return reply;
      const { state, module } = loaded;

      // Optimistic concurrency (§4.2): if the client told us the version it acted against and the game
      // has since moved on, refuse rather than apply to a state the client never saw. This is what
      // makes a double-click / stale second device a no-op — the UI refetches on this code, not errors.
      const loadedVersion = module.versionOf(state);
      const expected = request.body.expectedVersion;
      if (expected !== undefined && expected !== loadedVersion) {
        return reply.code(409).send({
          error: {
            code: 'STALE_VERSION',
            message: `Game is at version ${loadedVersion}, not ${expected}; reload before acting`,
          },
        });
      }

      const parsed = module.parseAction(request.body.action);
      if (!parsed.ok) return badRequest(reply, parsed.message);

      // The module may own this action through a flow of its own (Container's delivery auction
      // collects sealed bids server-side), in which case `/actions` is the wrong door.
      const pending = module.pendingStep?.(state, parsed.action);
      if (pending) return sendError(reply, pending);

      try {
        // ⚠️ Load → apply → update is race-free **only because this stretch is synchronous**:
        // better-sqlite3 is synchronous and there is no `await` between `load` (above) and
        // `repo.update` (below), so two concurrent POSTs cannot interleave a read and a write. Do NOT
        // add an `await` into this block — a single one silently opens a lost-update / double-apply
        // race (a double-click applying the same action twice). The `WHERE version = ?` guard threaded
        // below (§4.2) is the backstop that would catch such a race, refusing the second write with
        // `StaleVersionError` rather than clobbering the first; keep this stretch synchronous anyway.
        const next = module.applyAction(state, request.body.playerId, parsed.action);
        repo.update(module, next, loadedVersion);
        pushGame(request.params.id, next); // tell every connected client
        // Let the AI take any seats that are now on the clock, before we reply — so the caller gets
        // back the state as it stands once the bots have finished, not a snapshot mid-round.
        tick(request.params.id);
        // Read back rather than replying with `next`: the bots may have played several turns since.
        const settled = repo.get(module, request.params.id) ?? next;
        // Project the reply for the acting client's own seats (not the active player), so ending a
        // turn never leaks the next player's card. No `?viewer` ⇒ follow the active player (hotseat).
        return reply.send(
          gamePayload(module, request.params.id, settled, viewerFrom(request.query.viewer, module, settled)),
        );
      } catch (error) {
        // The `WHERE version` backstop fired: a concurrent write beat this one. Same client-facing
        // contract as the pre-check above — 409 STALE_VERSION, so the UI refetches rather than erroring.
        if (error instanceof StaleVersionError) {
          return reply.code(409).send({
            error: { code: 'STALE_VERSION', message: error.message },
          });
        }
        return sendGameError(reply, module, error);
      }
    },
  );
}
