import { ALL_PLACES } from '../core';
import type { PlaceId, StoneAgeState } from '../core';
import { refillDisplay } from './cards';
import { finalScoring } from './scoring';

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
 * Begin a new round (pg. 7, "New round"), unless the game ends first (pg. 8, SA11). Two triggers, both
 * resolved here (the round with the trigger has just finished feeding): a **building stack is empty**, or
 * the **card deck can't refill** the display. Either ends the game now with final scoring and no new
 * round. Otherwise: resupply the card display (SA10), pass the start-player marker one seat left, clear
 * the board, flip every used tool back to unused (SA4b), bump the round, and return to placement.
 */
export function startNewRound(state: StoneAgeState): Partial<StoneAgeState> {
  const n = state.players.length;
  const startPlayerIndex = (state.startPlayerIndex + 1) % n;
  const { display, deck } = refillDisplay(state.cardDisplay, state.cardDeck);

  const stackEmpty = state.buildings.some((stack) => stack.length === 0);
  const cardsShort = display.some((card) => card === null);
  if (stackEmpty || cardsShort) {
    const { results, winnerIds } = finalScoring(state);
    return { status: 'ended', results, winnerIds };
  }

  return {
    round: state.round + 1,
    phase: 'placement',
    startPlayerIndex,
    activePlayerIndex: startPlayerIndex,
    placements: emptyPlacements(),
    cardDisplay: display,
    cardDeck: deck,
    players: state.players.map((player) => ({ ...player, toolsUsed: player.toolsUsed.map(() => false) })),
  };
}
