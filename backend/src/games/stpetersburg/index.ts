import { applyAction, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '@game-hub/engine/stpetersburg';
import type { Action, StPetersburgState, Viewer } from '@game-hub/engine/stpetersburg';
import type { GameModule, GameSummary } from '../module';
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
 * shuffled once at setup), so it needs no server-side dice route. `createBotDriver` still arrives at SP9.
 */
export const stPetersburgModule: GameModule<StPetersburgState, Action> = {
  id: 'stpetersburg',
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
};
