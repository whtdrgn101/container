import { GameError } from '../core';
import type { RussianRailroadsState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { placeFactory, replaceFactory } from './factory';
import { resolveIdeaCard } from './ideaCard';
import { resolveIdeaToken } from './ideaToken';
import { resolveKey } from './key';
import { flipLoco, placeLoco, replaceLoco } from './locomotive';
import { moveTrack } from './moveTrack';
import { pass } from './pass';
import { place } from './place';
import { resolvePool, skipPool } from './pool';
import { resolveReuse } from './reuse';
import { resolveSetupBonus } from './setupBonus';

/** The three loco-resolution actions, allowed only while a `pendingLoco` lock is set (pg. 10–11). */
function isLocoResolution(type: Action['type']): boolean {
  return type === 'PLACE_LOCO' || type === 'REPLACE_LOCO' || type === 'FLIP_LOCO';
}

/** The two factory-resolution actions, allowed only while a `pendingFactory` lock is set (pg. 12–13). */
function isFactoryResolution(type: Action['type']): boolean {
  return type === 'PLACE_FACTORY' || type === 'REPLACE_FACTORY';
}

/** The two pool-resolution actions, allowed only while the active seat holds pool credits (pg. 7, 13). */
function isPoolResolution(type: Action['type']): boolean {
  return type === 'RESOLVE_POOL' || type === 'SKIP_POOL';
}

/**
 * Apply an action for `playerId` — the single, turn-aware entry point for a move (RR6).
 *
 * Enforces game-over, turn-order (pg. 7), and the engine **locks / phases** (mutually exclusive; checked in
 * strict precedence — a turn resolves one thing at a time). The **choice/lock** tiers come first (a lock
 * means we are mid-resolution, whichever phase we are in):
 *  - **pending-moves** (pg. 8–9) → only `MOVE_TRACK`;
 *  - **pending-key** (pg. 19) → only `RESOLVE_KEY`;
 *  - **pending-idea-token** (pp. 18–19) → only `RESOLVE_IDEA_TOKEN`;
 *  - **pending-idea-card** (pg. 46–47) → only `RESOLVE_IDEA_CARD`;
 *  - **pending-loco** (pg. 10–11) → the loco resolutions;
 *  - **pending-factory** (pg. 12–13) → the factory resolutions;
 *  - a non-empty **action pool** (pg. 13) → `RESOLVE_POOL` / `SKIP_POOL`.
 * Then the **mini-phases**, when no lock is set:
 *  - **setup-bonus** (pg. 6) → only `RESOLVE_SETUP_BONUS`;
 *  - **reuse** (pg. 17) → only `RESOLVE_REUSE`.
 * With nothing pending, the resolution actions are refused (`NO_PENDING_*`). Never mutates; throws typed.
 */
export function applyAction(state: RussianRailroadsState, playerId: string, action: Action): RussianRailroadsState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  // `seatOf` throws PLAYER_NOT_FOUND for an unknown id. The active seat is the head of whatever phase we're
  // in (a mini-phase sets `activePlayerIndex` to its queue head), so this one check covers every phase.
  if (seatOf(state, playerId) !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }

  if (state.pendingMoves) {
    if (action.type !== 'MOVE_TRACK') throw new GameError('MOVES_PENDING', 'Finish resolving your track moves first');
  } else if (state.pendingKey) {
    if (action.type !== 'RESOLVE_KEY') throw new GameError('KEY_PENDING', 'Resolve your key first');
  } else if (state.pendingIdeaToken) {
    if (action.type !== 'RESOLVE_IDEA_TOKEN') throw new GameError('IDEA_TOKEN_PENDING', 'Choose an idea token first');
  } else if (state.pendingIdeaCard) {
    if (action.type !== 'RESOLVE_IDEA_CARD') throw new GameError('IDEA_CARD_PENDING', 'Choose an idea card first');
  } else if (state.pendingLoco) {
    if (!isLocoResolution(action.type)) throw new GameError('LOCO_PENDING', 'Finish placing your locomotive first');
  } else if (state.pendingFactory) {
    if (!isFactoryResolution(action.type)) throw new GameError('FACTORY_PENDING', 'Finish building your factory first');
  } else if (state.players[state.activePlayerIndex]!.actionPool.length > 0) {
    if (!isPoolResolution(action.type))
      throw new GameError('POOL_PENDING', 'Resolve or skip your factory actions first');
  } else if (state.pendingSetupBonus) {
    if (action.type !== 'RESOLVE_SETUP_BONUS')
      throw new GameError('SETUP_BONUS_PENDING', 'Take your starting bonus card first');
  } else if (state.pendingReuse) {
    if (action.type !== 'RESOLVE_REUSE') throw new GameError('REUSE_PENDING', 'Resolve your reuse worker first');
  } else {
    if (action.type === 'MOVE_TRACK') throw new GameError('NO_PENDING_MOVES', 'No track moves are pending');
    if (isLocoResolution(action.type)) throw new GameError('NO_PENDING_LOCO', 'No locomotive is pending placement');
    if (isFactoryResolution(action.type)) throw new GameError('NO_PENDING_FACTORY', 'No factory is pending placement');
    if (isPoolResolution(action.type)) throw new GameError('NO_PENDING_POOL', 'No pool actions are pending');
    if (action.type === 'RESOLVE_KEY') throw new GameError('NO_PENDING_KEY', 'No key is pending');
    if (action.type === 'RESOLVE_IDEA_TOKEN') throw new GameError('NO_PENDING_IDEA_TOKEN', 'No idea token is pending');
    if (action.type === 'RESOLVE_IDEA_CARD') throw new GameError('NO_PENDING_IDEA_CARD', 'No idea card is pending');
    if (action.type === 'RESOLVE_SETUP_BONUS')
      throw new GameError('NO_PENDING_SETUP_BONUS', 'No starting bonus is pending');
    if (action.type === 'RESOLVE_REUSE') throw new GameError('NO_PENDING_REUSE', 'No reuse mini-phase is active');
  }

  switch (action.type) {
    case 'PLACE':
      return place(state, playerId, action.space, action.coins ?? 0, action.build ?? 'loco', action.first ?? 'loco');
    case 'MOVE_TRACK':
      return moveTrack(state, playerId, action.route, action.color);
    case 'PLACE_LOCO':
      return placeLoco(state, playerId, action.route);
    case 'REPLACE_LOCO':
      return replaceLoco(state, playerId, action.route, action.number);
    case 'FLIP_LOCO':
      return flipLoco(state, playerId);
    case 'PLACE_FACTORY':
      return placeFactory(state, playerId, action.from);
    case 'REPLACE_FACTORY':
      return replaceFactory(state, playerId, action.slot, action.from);
    case 'RESOLVE_POOL':
      return resolvePool(state, playerId, action.id);
    case 'SKIP_POOL':
      return skipPool(state, playerId);
    case 'RESOLVE_KEY':
      return resolveKey(state, playerId, action.option);
    case 'RESOLVE_IDEA_TOKEN':
      return resolveIdeaToken(state, playerId, action.token);
    case 'RESOLVE_IDEA_CARD':
      return resolveIdeaCard(state, playerId, action.card);
    case 'RESOLVE_REUSE':
      return resolveReuse(state, playerId, action.space);
    case 'RESOLVE_SETUP_BONUS':
      return resolveSetupBonus(state, playerId, action.card);
    case 'PASS':
      return pass(state, playerId);
  }
}
