import { KERNEL_CONTRACT_VERSION } from '@game-hub/kernel';
import type { ErrorResponse, GameModule, GameSummary, ParseResult, Viewer } from '@game-hub/kernel';
import { applyAction, createGame, GameError, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '../engine';
import type { Action, IdeaCardId, IdeaTokenType, RouteId, RussianRailroadsState, TrackColor } from '../engine';

/**
 * Validate opaque JSON into a typed Russian Railroads `Action` (RR4: `PLACE` / `MOVE_TRACK` / the loco
 * resolutions `PLACE_LOCO` / `REPLACE_LOCO` / `FLIP_LOCO` / `PASS`). The core route accepts arbitrary JSON
 * and delegates *all* action validation here. There are **no server-only actions** (no dice, no shuffles
 * mid-game — base-game randomness is setup-only), so every action a client may send is validated here. The
 * engine does the domain validation (route/colour/loco legality, the pending locks); this only shapes JSON.
 */
function parseAction(raw: unknown): ParseResult<Action> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'action must be an object' };
  }
  const action = raw as {
    type?: unknown;
    space?: unknown;
    coins?: unknown;
    route?: unknown;
    color?: unknown;
    number?: unknown;
    build?: unknown;
    first?: unknown;
    from?: unknown;
    slot?: unknown;
    id?: unknown;
    option?: unknown;
    token?: unknown;
    card?: unknown;
    engineerId?: unknown;
  };

  /** The engineer #15 end-bonus choice (pg. 48), when present: `'draw'` | `'score'`. */
  const engineerOption: { readonly option?: 'draw' | 'score' } =
    action.option === 'draw' || action.option === 'score' ? { option: action.option } : {};

  if (action.type === 'PASS') {
    return { ok: true, action: { type: 'PASS' } };
  }

  // Engineers (pg. 15–16, RR7). The engine validates hireability / ownership / once-per-round / inert; this
  // only shapes the JSON.
  if (action.type === 'HIRE_ENGINEER') {
    return { ok: true, action: { type: 'HIRE_ENGINEER' } };
  }

  if (action.type === 'USE_ENGINEER') {
    if (typeof action.engineerId !== 'string')
      return { ok: false, message: 'USE_ENGINEER.engineerId must be a string' };
    if (action.option !== undefined && action.option !== 'draw' && action.option !== 'score') {
      return { ok: false, message: "USE_ENGINEER.option must be 'draw' or 'score' when present" };
    }
    return { ok: true, action: { type: 'USE_ENGINEER', engineerId: action.engineerId, ...engineerOption } };
  }

  if (action.type === 'USE_VARIABLE_ENGINEER') {
    if (typeof action.slot !== 'number' || !Number.isInteger(action.slot)) {
      return { ok: false, message: 'USE_VARIABLE_ENGINEER.slot must be an integer' };
    }
    if (action.option !== undefined && action.option !== 'draw' && action.option !== 'score') {
      return { ok: false, message: "USE_VARIABLE_ENGINEER.option must be 'draw' or 'score' when present" };
    }
    return { ok: true, action: { type: 'USE_VARIABLE_ENGINEER', slot: action.slot, ...engineerOption } };
  }

  // RR6 choice / phase resolutions. The engine does the domain validation (a used token, an unknown card,
  // an illegal reuse space, no lock set); parseAction only shapes the JSON.
  if (action.type === 'RESOLVE_KEY') {
    if (action.option !== 'moves' && action.option !== 'points') {
      return { ok: false, message: "RESOLVE_KEY.option must be 'moves' or 'points'" };
    }
    return { ok: true, action: { type: 'RESOLVE_KEY', option: action.option } };
  }

  if (action.type === 'RESOLVE_IDEA_TOKEN') {
    if (typeof action.token !== 'string') return { ok: false, message: 'RESOLVE_IDEA_TOKEN.token must be a string' };
    return { ok: true, action: { type: 'RESOLVE_IDEA_TOKEN', token: action.token as IdeaTokenType } };
  }

  if (action.type === 'RESOLVE_IDEA_CARD') {
    if (typeof action.card !== 'string') return { ok: false, message: 'RESOLVE_IDEA_CARD.card must be a string' };
    return { ok: true, action: { type: 'RESOLVE_IDEA_CARD', card: action.card as IdeaCardId } };
  }

  if (action.type === 'RESOLVE_REUSE') {
    if (typeof action.space !== 'string') return { ok: false, message: 'RESOLVE_REUSE.space must be a string' };
    return { ok: true, action: { type: 'RESOLVE_REUSE', space: action.space } };
  }

  if (action.type === 'RESOLVE_SETUP_BONUS') {
    if (typeof action.card !== 'string') return { ok: false, message: 'RESOLVE_SETUP_BONUS.card must be a string' };
    return { ok: true, action: { type: 'RESOLVE_SETUP_BONUS', card: action.card } };
  }

  if (action.type === 'FLIP_LOCO') {
    return { ok: true, action: { type: 'FLIP_LOCO' } };
  }

  if (action.type === 'SKIP_POOL') {
    return { ok: true, action: { type: 'SKIP_POOL' } };
  }

  if (action.type === 'RESOLVE_POOL') {
    if (typeof action.id !== 'string') return { ok: false, message: 'RESOLVE_POOL.id must be a string' };
    return { ok: true, action: { type: 'RESOLVE_POOL', id: action.id } };
  }

  if (action.type === 'PLACE_FACTORY' || action.type === 'REPLACE_FACTORY') {
    // `from` (optional) names a returned factory to use; absent = the lowest locomotive (pg. 12).
    if (action.from !== undefined && (typeof action.from !== 'number' || !Number.isInteger(action.from))) {
      return { ok: false, message: `${action.type}.from must be an integer when present` };
    }
    const from = action.from as number | undefined;
    if (action.type === 'REPLACE_FACTORY') {
      if (typeof action.slot !== 'number' || !Number.isInteger(action.slot)) {
        return { ok: false, message: 'REPLACE_FACTORY.slot must be an integer' };
      }
      return {
        ok: true,
        action: { type: 'REPLACE_FACTORY', slot: action.slot, ...(from !== undefined ? { from } : {}) },
      };
    }
    return { ok: true, action: { type: 'PLACE_FACTORY', ...(from !== undefined ? { from } : {}) } };
  }

  if (action.type === 'PLACE_LOCO') {
    if (typeof action.route !== 'string') {
      return { ok: false, message: 'PLACE_LOCO.route must be a string' };
    }
    // The engine validates the route id + slot capacity, so an unknown value becomes a typed engine error.
    return { ok: true, action: { type: 'PLACE_LOCO', route: action.route as RouteId } };
  }

  if (action.type === 'REPLACE_LOCO') {
    if (typeof action.route !== 'string') {
      return { ok: false, message: 'REPLACE_LOCO.route must be a string' };
    }
    if (typeof action.number !== 'number' || !Number.isInteger(action.number)) {
      return { ok: false, message: 'REPLACE_LOCO.number must be an integer' };
    }
    return { ok: true, action: { type: 'REPLACE_LOCO', route: action.route as RouteId, number: action.number } };
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
    // `build` (loco/factory) and `first` (loco/factory) drive the loco-space options (pg. 12); the engine
    // ignores them on other spaces.
    if (action.build !== undefined && action.build !== 'loco' && action.build !== 'factory') {
      return { ok: false, message: "PLACE.build must be 'loco' or 'factory' when present" };
    }
    if (action.first !== undefined && action.first !== 'loco' && action.first !== 'factory') {
      return { ok: false, message: "PLACE.first must be 'loco' or 'factory' when present" };
    }
    return {
      ok: true,
      action: {
        type: 'PLACE',
        space: action.space,
        ...(action.coins !== undefined ? { coins: action.coins } : {}),
        ...(action.build !== undefined ? { build: action.build as 'loco' | 'factory' } : {}),
        ...(action.first !== undefined ? { first: action.first as 'loco' | 'factory' } : {}),
      },
    };
  }

  if (action.type === 'MOVE_TRACK') {
    if (typeof action.route !== 'string') {
      return { ok: false, message: 'MOVE_TRACK.route must be a string' };
    }
    if (action.color !== undefined && typeof action.color !== 'string') {
      return { ok: false, message: 'MOVE_TRACK.color must be a string when present' };
    }
    // Cast at the JSON boundary: the engine (`moveTrack`) validates the route id and colour against the
    // player's board and the current lock, so an unknown value becomes a typed `UNKNOWN_ROUTE` /
    // `INVALID_TRACK_COLOR` rather than a parse failure.
    return {
      ok: true,
      action: {
        type: 'MOVE_TRACK',
        route: action.route as RouteId,
        ...(action.color !== undefined ? { color: action.color as TrackColor } : {}),
      },
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
 * RR2 adds track extension: `PLACE`/`MOVE_TRACK`/`PASS` over `/actions`, plus per-round scoring. **No
 * `routes`, `pendingStep`, side-channels, per-turn rng or bots** — the track-extension lock is an *engine*
 * lock (`state.pendingMoves`), resolved by ordinary `MOVE_TRACK` actions the engine gates, **not** a
 * backend `pendingStep` (that hook is for a *flow the module owns*, like Container's auction). Base-game
 * randomness is setup-only and the AI seats land RR10. `schemaVersion` is undeclared (v1). The
 * host-parameter hooks are simply omitted — proof, again, that they are optional.
 */
const russianRailroadsModule: GameModule<RussianRailroadsState, Action> = {
  id: 'russianrailroads',
  // The kernel contract this game is built against (design doc §4) — taken from the kernel it compiled
  // against, so it can't drift. The host's registry refuses a mismatch at registration.
  kernelContract: KERNEL_CONTRACT_VERSION,
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
