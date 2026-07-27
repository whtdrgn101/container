import { applyAction, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '../engine';
import type { Action, CantStopState, Viewer } from '../engine';
import type { BotDriver, GameSummary } from '@game-hub/kernel';
import type { GameModule, ModuleContext } from './context';
import { CantStopBotRunner } from './botRunner';
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
  // The four seat tints the board already colours squares/runners with, in seat order (see the UI board).
  colors: ['rose', 'sky', 'amber', 'emerald'],

  // The AI difficulty tiers (CS4). Ordered easy→hard; the UI defaults its picker to 'normal'. The
  // bot package owns what each tier *means* (probability-scaled policies); the module only names them.
  botDifficulties: ['easy', 'normal', 'hard'],

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

  // The dice-roll endpoint — the one thing that isn't a plain `/actions` move. No pending multi-seat
  // step and no side-channel to push, so `pendingStep`/`onStateChanged` stay omitted.
  routes: (app, ctx) => registerCantStopRoutes(app, ctx),

  // AI seats (CS1). The runner draws its dice from the same injected `ctx.rng` the roll route uses.
  createBotDriver: (ctx: ModuleContext): BotDriver =>
    new CantStopBotRunner(
      // The one cast: `ModuleContext.games` is opaque by contract, and this is the boundary where we
      // know the state came from Can't Stop's own `createGame`.
      { get: (id) => ctx.games.get(id) as CantStopState | undefined, update: (state) => ctx.games.update(state) },
      ctx.botSeats,
      ctx.rng,
      (state) => ctx.pushGame(state.id, state),
    ),
};

// The package-contract entry point (Track D / D0): the generated registry imports each game's module
// as a default. Keeps the named export for the callers that reference `cantStopModule` directly.
export default cantStopModule;
