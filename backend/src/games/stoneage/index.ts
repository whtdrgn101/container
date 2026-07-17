import { applyAction, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '@game-hub/engine/stoneage';
import type { Action, StoneAgeState, Viewer } from '@game-hub/engine/stoneage';
import type { GameModule, GameSummary } from '../module';
import { newStoneAgeGame } from './createGame';
import { mapStoneAgeError } from './errors';
import { parseStoneAgeAction } from './parseAction';

/**
 * Stone Age, as a `GameModule` — the **bootstrap** (roadmap SA0). A registered, creatable, viewable
 * game with no playable actions yet; the mechanics land one stage at a time. No dice route, no bot, no
 * side-channel, so `routes`/`createBotDriver`/`onStateChanged`/`pendingStep` are omitted (the
 * resource/hunt dice will add a roll route later, exactly as Can't Stop did).
 */
export const stoneAgeModule: GameModule<StoneAgeState, Action> = {
  id: 'stoneage',
  name: 'Stone Age',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

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
};
