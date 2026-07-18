import { ALL_PLACES } from '../core';
import type { PlaceId, StoneAgeState } from '../core';

/**
 * The feeding phase (rulebook pg. 7, phase 3) and the roll into the next round (pg. 7, "New round").
 * Feeding is sequential in start-player order; the feed mechanic itself lives in `actions/feed.ts`.
 */

/** An empty placement board — every place (fixed + building slots) holds nobody (between rounds). */
export function emptyPlacements(): StoneAgeState['placements'] {
  const placements = {} as Record<PlaceId, Record<string, number>>;
  for (const place of ALL_PLACES) placements[place] = {};
  return placements;
}

/**
 * After a player feeds, seat the next player in start-player order. Once everyone has fed (the next seat
 * wraps back to the start player), the round rolls over. Returns only the fields that change.
 */
export function advanceFeeder(state: StoneAgeState): Partial<StoneAgeState> {
  const n = state.players.length;
  const nextSeat = (state.activePlayerIndex + 1) % n;
  if (nextSeat === state.startPlayerIndex) return startNewRound(state);
  return { activePlayerIndex: nextSeat };
}

/**
 * Begin a new round (pg. 7, "New round"): pass the start-player marker one seat to the left, clear the
 * board, flip every used tool back to unused (pg. 5, SA4b), bump the round counter, and return to the
 * placement phase with the new start player up.
 *
 * *(The card/building resupply arrives with SA9/SA10.)*
 */
export function startNewRound(state: StoneAgeState): Partial<StoneAgeState> {
  const n = state.players.length;
  const startPlayerIndex = (state.startPlayerIndex + 1) % n;
  return {
    round: state.round + 1,
    phase: 'placement',
    startPlayerIndex,
    activePlayerIndex: startPlayerIndex,
    placements: emptyPlacements(),
    players: state.players.map((player) => ({ ...player, toolsUsed: player.toolsUsed.map(() => false) })),
  };
}
