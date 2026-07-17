import { applyAction, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '@container/engine/cantstop';
import type { Action, CantStopState, Viewer } from '@container/engine/cantstop';
import type { GameModule, GameSummary } from '../module';
import { newCantStopGame } from './createGame';
import { mapCantStopError } from './errors';
import { parseCantStopAction } from './parseAction';
import { registerCantStopRoutes } from './routes';

/**
 * Can't Stop, as a `GameModule` (roadmap C3) — the second game registered on the site, and the honest
 * test of the C0/C1/C2 seams: a game with no hidden information (so `viewFor` is a no-op), no bots, and
 * per-turn randomness the shared core knows nothing about (its dice roll lives behind `routes`, drawn
 * from the injected `ctx.rng`). Nothing Container-shaped leaks into the core to make this work.
 */
export const cantStopModule: GameModule<CantStopState, Action> = {
  id: 'cantstop',
  name: "Can't Stop",
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  createGame: (opts) => newCantStopGame(opts),

  applyAction: (state, playerId, action) => applyAction(state, playerId, action),

  legalActions: (state, playerId) => legalActions(state, playerId),

  // Can't Stop hides nothing — every square and die is public — so this projects the whole state.
  viewFor: (state, viewer) => viewFor(state, viewer as Viewer),

  parseAction: (raw) => parseCantStopAction(raw),

  summarize: (state): GameSummary => ({
    id: state.id,
    turn: state.turn,
    status: state.status,
    activePlayerId: state.players[state.activePlayerIndex]?.id ?? null,
    players: state.players.map((player) => ({ id: player.id, name: player.name })),
  }),

  versionOf: (state) => state.version,

  // The whole log is public by construction (there is nothing secret to record).
  movesOf: (state) => state.log,

  mapError: (error) => mapCantStopError(error),

  // The dice-roll endpoint — the one thing that isn't a plain `/actions` move. No bots, no pending
  // multi-seat step, no side-channel to push, so `pendingStep`/`onStateChanged`/`createBotDriver` are
  // all deliberately omitted.
  routes: (app, ctx) => registerCantStopRoutes(app, ctx),
};
