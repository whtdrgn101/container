import { DIE_FACES, GameError } from '../core';
import type { PlaceId, StoneAgeState } from '../core';
import { isGatherPlace, record } from '../internal';

/**
 * **Step 1 of a gather (pg. 5–6): roll the dice.** Roll one die per person on a gather place and hold
 * the result as a `pendingGather` — the yield isn't taken yet, because the player may still add tools to
 * the total (step 2 is `takeGather`). The dice are injected (server-only), so the engine stays pure and
 * the roll stays authoritative between the two steps. The people stay on the board until the take.
 */
export function gather(state: StoneAgeState, playerId: string, place: PlaceId, dice: readonly number[]): StoneAgeState {
  if (!isGatherPlace(place) || state.placements[place][playerId] === undefined) {
    throw new GameError('INVALID_GATHER', `Player "${playerId}" has no people to gather at "${place}"`);
  }
  const people = state.placements[place][playerId]!;
  const valid = dice.length === people && dice.every((d) => Number.isInteger(d) && d >= 1 && d <= DIE_FACES);
  if (!valid) {
    throw new GameError('INVALID_GATHER', `A gather at "${place}" needs ${people} dice of 1–${DIE_FACES}`);
  }

  return record(state, 'GATHER', playerId, { pendingGather: { place, dice } }, { place, dice });
}
