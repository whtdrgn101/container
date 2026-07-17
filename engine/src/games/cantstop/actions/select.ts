import { GameError } from '../core';
import type { CantStopState } from '../core';
import { activePlayer, applySelection, isLegalSelection, record } from '../internal';

/**
 * Choose which columns to advance for the dice you just rolled (rules "Playing" steps 2–3). The pick
 * must be one of the legal advancements — the engine enforces "if you can place both, you must" and
 * the three-marker cap through `legalSelections`. Advancing never ends the turn: afterwards you may
 * roll again or stop.
 */
export function select(state: CantStopState, playerId: string, columns: readonly number[]): CantStopState {
  if (state.phase !== 'selecting' || state.dice === null) {
    throw new GameError('WRONG_PHASE', 'There are no dice to assign — roll first');
  }
  if (!isLegalSelection(state, columns)) {
    throw new GameError('INVALID_SELECTION', `Columns [${columns.join(', ')}] are not a legal play for these dice`);
  }
  const runners = applySelection(state.runners, activePlayer(state).progress, columns);
  return record(state, 'SELECT', playerId, { runners, phase: 'rolling', dice: null }, { columns: [...columns] });
}
