import { GameError } from '../core';
import type { LocomotiveSupply, RussianRailroadsState } from '../core';
import {
  afterBuild,
  allGapsFilled,
  firstUnfilledGap,
  lowestAvailableLoco,
  placeFactoryInGap,
  record,
  replaceFactoryInSlot,
  returnFactory,
  seatOf,
  takeLowestLoco,
  takeReturnedFactory,
  withPlayer,
} from '../internal';

/**
 * Resolve the pending-factory lock (pg. 12–13) — building a factory onto the industry track. The lock's
 * presence and the turn checks are in `applyAction`; these own the placement rules. A factory tile is the
 * **lowest-numbered locomotive** (drawn now) **or** a **returned factory** of a chosen number (pg. 12); the
 * tile keeps its number (which decides its later indirect action, pg. 13). Never mutates; throws typed.
 */

/** Take a factory tile from the supply (pg. 12): a returned factory of `from`, or the lowest loco if absent. */
function takeFactoryTile(
  supply: LocomotiveSupply,
  from: number | undefined,
): { readonly number: number; readonly supply: LocomotiveSupply } {
  if (from === undefined) {
    if (lowestAvailableLoco(supply) === null) {
      throw new GameError('FACTORY_UNAVAILABLE', 'No locomotive to flip into a factory (name a returned factory)');
    }
    return takeLowestLoco(supply);
  }
  // `takeReturnedFactory` throws NO_SUCH_FACTORY when that number isn't in the supply.
  return { number: from, supply: takeReturnedFactory(supply, from) };
}

/**
 * `PLACE_FACTORY` — build a factory into the **leftmost unfilled gap** (pg. 12, left→right). Illegal once
 * all 5 gaps are filled (`ILLEGAL_FACTORY_PLACEMENT` — use `REPLACE_FACTORY` then). Settles the turn via
 * `afterBuild` (the pg. 12 "loco and factory" ordering, or pass).
 */
export function placeFactory(state: RussianRailroadsState, playerId: string, from?: number): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (allGapsFilled(player.industry)) {
    throw new GameError('ILLEGAL_FACTORY_PLACEMENT', 'All 5 gaps are filled — replace a factory instead (pg. 12)');
  }

  const { number, supply } = takeFactoryTile(state.supplies.locomotives, from);
  const slot = firstUnfilledGap(player.industry);
  const industry = placeFactoryInGap(player.industry, number);
  const updated = { ...player, industry };

  const next = { ...state, players: withPlayer(state, seat, updated), supplies: { ...state.supplies, locomotives: supply } };
  return record(state, 'PLACE_FACTORY', playerId, afterBuild(next, seat), { number, slot });
}

/**
 * `REPLACE_FACTORY` — build a factory by **replacing** an existing one (pg. 12): only once all 5 gaps are
 * filled, any slot (no left→right rule). The replaced factory returns to the supply (as a returned factory,
 * keeping its number). Settles the turn via `afterBuild`.
 */
export function replaceFactory(
  state: RussianRailroadsState,
  playerId: string,
  slot: number,
  from?: number,
): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (!allGapsFilled(player.industry)) {
    throw new GameError('ILLEGAL_FACTORY_PLACEMENT', 'Fill all 5 gaps before replacing a factory (pg. 12)');
  }
  if (slot < 0 || slot >= player.industry.factories.length) {
    throw new GameError('ILLEGAL_FACTORY_PLACEMENT', `No factory slot ${slot} to replace`);
  }

  const drawn = takeFactoryTile(state.supplies.locomotives, from);
  const { industry, replaced } = replaceFactoryInSlot(player.industry, slot, drawn.number);
  // The displaced factory returns to the supply as a returned factory of its own number (pg. 12).
  const supply = returnFactory(drawn.supply, replaced);
  const updated = { ...player, industry };

  const next = { ...state, players: withPlayer(state, seat, updated), supplies: { ...state.supplies, locomotives: supply } };
  return record(state, 'REPLACE_FACTORY', playerId, afterBuild(next, seat), { number: drawn.number, slot, replaced });
}
