import type { LocomotiveSupply, RussianRailroadsState } from '../core';
import { takeLowestLoco } from './locomotives';
import { nextActiveSeat } from './round';

/**
 * The next seat to give the turn to after a resolution completes — **or the current seat**, if it still
 * has an unresolved action pool (pg. 7, 13: pool credits are resolved on your own turn, before it passes).
 * So a `MOVE_TRACK` that clears a pool-credit lock returns control to the pool rather than the next player.
 */
export function nextSeatOrHold(state: RussianRailroadsState, seat: number): number {
  return state.players[seat]!.actionPool.length > 0 ? state.activePlayerIndex : nextActiveSeat(state)!;
}

/**
 * Decide what happens after a locomotive **or** factory build finishes (pg. 11–13), given the loco supply
 * *after* that build's own draws (`supply`). Handles the 3-worker "loco **and** factory" ordering (pg. 12)
 * via `pendingThen`:
 *
 *  - `pendingThen === 'factory'` (a loco step just finished, factory owed next): open the pending-factory
 *    lock, keep the turn.
 *  - `pendingThen === 'loco'` (a factory step just finished, loco owed next): take the lowest locomotive
 *    now (so an upgrade earlier this turn can't have changed the pick), open the pending-loco lock, keep
 *    the turn.
 *  - otherwise: clear both locks and pass the turn (or hold for a still-pending pool — never the case after
 *    a build, but honoured for safety).
 *
 * Returns the top-level state changes to fold into the mechanic's `record()`.
 */
export function afterBuild(
  state: RussianRailroadsState,
  seat: number,
  supply: LocomotiveSupply,
): Partial<RussianRailroadsState> {
  const locomotives = { ...state.supplies, locomotives: supply };
  if (state.pendingThen === 'factory') {
    return { pendingLoco: null, pendingFactory: { owed: true }, pendingThen: null, supplies: locomotives };
  }
  if (state.pendingThen === 'loco') {
    const drawn = takeLowestLoco(supply);
    return {
      pendingFactory: null,
      pendingLoco: { number: drawn.number },
      pendingThen: null,
      supplies: { ...state.supplies, locomotives: drawn.supply },
    };
  }
  return {
    pendingLoco: null,
    pendingFactory: null,
    supplies: locomotives,
    activePlayerIndex: nextSeatOrHold(state, seat),
  };
}
