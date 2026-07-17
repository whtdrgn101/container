import { GameError } from '../core';
import type { PlaceId, StoneAgeState } from '../core';
import { countRange, nextPlacer, record } from '../internal';

/**
 * Place `count` people on `place` for `playerId` (rulebook pg. 4, phase 1). Validates against the
 * placement rules, records the placement, then passes the turn to the next seat that can still place —
 * or, if nobody can, ends the placement phase and hands the action phase to the start player.
 */
export function place(state: StoneAgeState, playerId: string, placeId: PlaceId, count: number): StoneAgeState {
  const range = countRange(state, placeId, playerId);
  if (!range || count < range.min || count > range.max) {
    throw new GameError(
      'INVALID_PLACEMENT',
      `Player "${playerId}" cannot place ${count} people on "${placeId}"`,
    );
  }

  const withPlacement: StoneAgeState = {
    ...state,
    placements: { ...state.placements, [placeId]: { ...state.placements[placeId], [playerId]: count } },
  };

  const next = nextPlacer(withPlacement, state.activePlayerIndex);
  const payload = { place: placeId, count };
  if (next === null) {
    // Everyone is out of legal placements — the action phase begins with the start player.
    return record(withPlacement, 'PLACE', playerId, { phase: 'actions', activePlayerIndex: state.startPlayerIndex }, payload);
  }
  return record(withPlacement, 'PLACE', playerId, { activePlayerIndex: next }, payload);
}
