import { applyAction, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '@game-hub/engine/stpetersburg';
import type { Action, StPetersburgState, Viewer } from '@game-hub/engine/stpetersburg';
import type { GameModule, GameSummary } from '../module';
import { newStPetersburgGame } from './createGame';
import { mapStPetersburgError } from './errors';
import { parseStPetersburgAction } from './parseAction';

/**
 * Saint Petersburg, as a `GameModule` — the fourth game on the platform (roadmap SP0). A registered,
 * creatable, viewable scaffold that coexists with Container, Can't Stop and Stone Age; its actions are
 * refused until SP1. No routes, bots, or side-channels yet — those arrive with the mechanics that need
 * them (`routes` for the Observatory's server-side draw, `createBotDriver` at SP8).
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
