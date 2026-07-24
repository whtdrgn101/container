import type { ErrorResponse, GameModule, GameSummary, ParseResult, Viewer } from '@game-hub/kernel';
import { applyAction, createGame, GameError, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '../engine';
import type { Action, RussianRailroadsState } from '../engine';

/**
 * Validate opaque JSON into a typed Russian Railroads `Action` (RR1: `PLACE` / `PASS`). The core route
 * accepts arbitrary JSON and delegates *all* action validation here. There are **no server-only actions**
 * in RR1 (no dice, no shuffles mid-game — base-game randomness is setup-only), so every action a client
 * may send is validated here.
 */
function parseAction(raw: unknown): ParseResult<Action> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'action must be an object' };
  }
  const action = raw as { type?: unknown; space?: unknown; coins?: unknown };

  if (action.type === 'PASS') {
    return { ok: true, action: { type: 'PASS' } };
  }

  if (action.type === 'PLACE') {
    if (typeof action.space !== 'string') {
      return { ok: false, message: 'PLACE.space must be a string' };
    }
    if (
      action.coins !== undefined &&
      (typeof action.coins !== 'number' || !Number.isInteger(action.coins) || action.coins < 0)
    ) {
      return { ok: false, message: 'PLACE.coins must be a non-negative integer when present' };
    }
    return {
      ok: true,
      action: { type: 'PLACE', space: action.space, ...(action.coins !== undefined ? { coins: action.coins } : {}) },
    };
  }

  return { ok: false, message: `unknown action type: ${String(action.type)}` };
}

/**
 * Map Russian Railroads' domain errors onto HTTP — the same shape the other games use:
 *   404 — the thing you named doesn't exist (an unknown player)
 *   400 — the request could never be valid (a bad player count)
 *   409 — a legal-looking move this state refuses (wrong turn, occupied space, game over)
 *
 * Checks `instanceof` the game's own `GameError` subclass (not the kernel base) so a base-class error from
 * elsewhere falls through to a 500 rather than being mislabelled (REVIEW §3.2).
 */
function mapError(error: unknown): ErrorResponse | null {
  if (!(error instanceof GameError)) return null;
  const status = error.code === 'PLAYER_NOT_FOUND' ? 404 : error.code === 'INVALID_PLAYER_COUNT' ? 400 : 409;
  return { status, code: error.code, message: error.message };
}

/**
 * Russian Railroads, as a `GameModule` — the **fifth** game on the platform, and the **Track D pilot**:
 * the first game hosted from its own in-workspace **package** (`@game-hub/game-russianrailroads`) rather
 * than a folder in the backend. It coexists with Container, Can't Stop, Stone Age and Saint Petersburg.
 *
 * RR1 is the worker-placement spine (`PLACE`/`PASS` over `/actions`). **No `routes`, `pendingStep`,
 * side-channels, per-turn rng or bots** — base-game randomness is setup-only, every rule is an engine
 * rule, and the AI seats land RR10. `schemaVersion` is undeclared (v1). The host-parameter hooks
 * (`routes`/`onStateChanged`/`createBotDriver`) are simply omitted — proof, again, that they are optional.
 */
const russianRailroadsModule: GameModule<RussianRailroadsState, Action> = {
  id: 'russianrailroads',
  name: 'Russian Railroads',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  // Four sensible player-colour ids, one per seat (the box uses green/blue/red/yellow engines).
  colors: ['green', 'blue', 'red', 'yellow'],

  createGame(opts) {
    return createGame({ id: opts.id, players: opts.players.map((p) => ({ name: p.name })), rng: opts.rng });
  },

  applyAction(state, playerId, action) {
    return applyAction(state, playerId, action);
  },

  legalActions(state, playerId) {
    return legalActions(state, playerId);
  },

  // Redacts each opponent's held end-bonus card + the end-bonus pile contents (the game's only secrets).
  viewFor(state, viewer) {
    return viewFor(state, viewer as Viewer);
  },

  parseAction(raw) {
    return parseAction(raw);
  },

  summarize(state): GameSummary {
    return {
      id: state.id,
      // `turn` surfaces the round counter; the turn-order detail is a Russian Railroads concept the
      // board/Status render, not something the generic summary carries.
      turn: state.round,
      status: state.status,
      activePlayerId: state.players[state.activePlayerIndex]?.id ?? null,
      players: state.players.map((p) => ({ id: p.id, name: p.name })),
    };
  },

  versionOf(state) {
    return state.version;
  },

  movesOf(state) {
    return state.log;
  },

  mapError(error) {
    return mapError(error);
  },
};

// The package-contract entry point (Track D): the generated registry imports each game's module as a
// default.
export default russianRailroadsModule;
