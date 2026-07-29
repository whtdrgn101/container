import { applyAction, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '../engine';
import type { Action, StPetersburgState, Viewer } from '../engine';
import { KERNEL_CONTRACT_VERSION } from '@game-hub/kernel';
import type { BotDriver, GameSummary } from '@game-hub/kernel';
import type { GameModule, ModuleContext } from './context';
import { BotRunner } from './botRunner';
import { newStPetersburgGame } from './createGame';
import { mapStPetersburgError } from './errors';
import { parseStPetersburgAction } from './parseAction';

/**
 * Saint Petersburg, as a `GameModule` — the fourth game on the platform. The full game plays over
 * `/actions`: the phase spine (SP1), round loop (SP2), hidden hand (SP3), trading-card displacement (SP4)
 * and the six special cards (SP5). It coexists with Container, Can't Stop and Stone Age.
 *
 * **No `routes`, `pendingStep`, side-channels or per-turn rng** — deliberately. Every special card is a
 * *rule*, so it lives in the engine: the Pub and Observatory interludes are **engine-level turn locks**
 * (`pendingPubBuy`/`pendingDraw`, like Stone Age's `pendingGather`) that refuse other `/actions` moves with
 * a typed error, and the Observatory draw is a **pure engine action** (the stack top is deterministic —
 * shuffled once at setup), so it needs no server-side dice route. The only optional hook it uses is
 * `createBotDriver` (SP9) — its AI seats, driven by the same policy as self-play from a **redacted** view;
 * a bot needs no injected randomness here (no dice), so unlike the other three the runner takes no rng.
 */
export const stPetersburgModule: GameModule<StPetersburgState, Action> = {
  id: 'stpetersburg',
  // The kernel contract this game is built against (design doc §4) — taken from the kernel it compiled
  // against, so it can't drift. The host's registry refuses a mismatch at registration.
  kernelContract: KERNEL_CONTRACT_VERSION,
  name: 'Saint Petersburg',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  // The game's four wood-figure colours, in the order shown on the box/board (pg. 1).
  colors: ['blue', 'yellow', 'green', 'red'],

  createGame: (opts) => newStPetersburgGame(opts),

  applyAction: (state, playerId, action) => applyAction(state, playerId, action),

  legalActions: (state, playerId) => legalActions(state, playerId),

  // Redacts opponents' rubles + hand contents and the draw-stack contents (the game's real secrets).
  viewFor: (state, viewer) => viewFor(state, viewer as Viewer),

  parseAction: (raw) => parseStPetersburgAction(raw),

  summarize: (state): GameSummary => ({
    id: state.id,
    // `turn` surfaces the round counter (the round loop lands in SP2); the phase/turn detail is a
    // Saint Petersburg concept the board/Status render, not something the generic summary carries.
    turn: state.round,
    status: state.status,
    activePlayerId: state.players[state.activePlayerIndex]?.id ?? null,
    players: state.players.map((player) => ({ id: player.id, name: player.name })),
  }),

  versionOf: (state) => state.version,

  movesOf: (state) => state.log,

  mapError: (error) => mapStPetersburgError(error),

  // AI seats (SP9). The first bot on the platform deciding from a genuinely redacted view — it reads only
  // its own seat's rubles/hand. Same policy as self-play, same `applyAction` a human takes; no rng to
  // inject (Saint Petersburg has no dice), so the runner takes none.
  createBotDriver: (ctx: ModuleContext): BotDriver =>
    new BotRunner(
      { get: (id) => ctx.games.get(id) as StPetersburgState | undefined, update: (state) => ctx.games.update(state) },
      ctx.botSeats,
      (state) => ctx.pushGame(state.id, state),
    ),
};

// Re-export the error map so the backend test suite can unit-test the GameError→HTTP mapping directly
// (it lives in `./errors`, but the package only exposes the `./module` barrel — no deep subpath imports).
export { mapStPetersburgError } from './errors';

// The package-contract entry point (Track D / D0): the generated registry imports each game's module
// as a default. Keeps the named export for the callers that reference `stPetersburgModule` directly.
export default stPetersburgModule;
