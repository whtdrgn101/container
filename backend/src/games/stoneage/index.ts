import { applyAction, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '@game-hub/engine/stoneage';
import type { Action, StoneAgeState, Viewer } from '@game-hub/engine/stoneage';
import type { BotDriver, GameModule, GameSummary, ModuleContext } from '../module';
import { BotRunner } from './botRunner';
import { newStoneAgeGame } from './createGame';
import { mapStoneAgeError } from './errors';
import { parseStoneAgeAction } from './parseAction';
import { registerStoneAgeRoutes } from './routes';

/**
 * Stone Age, as a `GameModule` — a fully playable worker-placement Euro (roadmap SA0–SA12). Its per-turn
 * dice go through a server-side roll route (`routes`, like Can't Stop) and its AI seats through
 * `createBotDriver` (like Container). No side-channel state, so `onStateChanged`/`pendingStep` stay off —
 * the gather's pending step lives inside the engine state, not beside it.
 */
export const stoneAgeModule: GameModule<StoneAgeState, Action> = {
  id: 'stoneage',
  name: 'Stone Age',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  // The four seat tints the board already colours meeples/ribbons with, in seat order (see its Board.tsx).
  colors: ['red', 'blue', 'green', 'yellow'],

  createGame: (opts) => newStoneAgeGame(opts),

  applyAction: (state, playerId, action) => applyAction(state, playerId, action),

  legalActions: (state, playerId) => legalActions(state, playerId),

  // Stone Age is a public-information Euro — the view is the whole state (near-identity).
  viewFor: (state, viewer) => viewFor(state, viewer as Viewer),

  parseAction: (raw) => parseStoneAgeAction(raw),

  summarize: (state): GameSummary => ({
    id: state.id,
    turn: state.round,
    status: state.status,
    activePlayerId: state.players[state.activePlayerIndex]?.id ?? null,
    players: state.players.map((player) => ({ id: player.id, name: player.name })),
  }),

  versionOf: (state) => state.version,

  movesOf: (state) => state.log,

  mapError: (error) => mapStoneAgeError(error),

  // The resource/hunt dice roll (SA2). Server-only, drawn from the injected `ctx.rng`.
  routes: (app, ctx) => registerStoneAgeRoutes(app, ctx),

  // AI seats (SA12). Same policies as self-play, same `applyAction` a human takes; the gather dice come
  // from `ctx.rng`, so a bot rolls exactly as a human does.
  createBotDriver: (ctx: ModuleContext): BotDriver =>
    new BotRunner(
      { get: (id) => ctx.games.get(id) as StoneAgeState | undefined, update: (state) => ctx.games.update(state) },
      ctx.botSeats,
      ctx.rng,
      (state) => ctx.pushGame(state.id, state),
    ),
};

// The package-contract entry point (Track D / D0): the generated registry imports each game's module
// as a default. Keeps the named export for the callers that reference `stoneAgeModule` directly.
export default stoneAgeModule;
