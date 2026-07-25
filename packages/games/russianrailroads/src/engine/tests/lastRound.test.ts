import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import { LAST_ROUND_INDUSTRY_ID, spaceAvailable, actionSpace } from '../core';
import type { RussianRailroadsState } from '../core';
import { activeId, expectError, newGame } from './helpers';

/** The same game, moved to its final round (round === rounds), so the last-round tile is in play (pg. 22). */
function lastRound(count = 2): RussianRailroadsState {
  const s = newGame(count);
  return { ...s, round: s.rounds };
}

const placedSpaces = (state: RussianRailroadsState): Set<string> =>
  new Set(legalActions(state, activeId(state)).flatMap((a) => (a.type === 'PLACE' ? [a.space] : [])));

describe('the last-round tile (pg. 22)', () => {
  it('spaceAvailable swaps the turn-order claim spaces for the last-round industry space', () => {
    const turn = actionSpace('turnorder-1')!;
    const last = actionSpace(LAST_ROUND_INDUSTRY_ID)!;
    // Rounds 1..rounds-1: claim spaces available, the last-round space is not.
    expect(spaceAvailable(turn, 1, 6)).toBe(true);
    expect(spaceAvailable(last, 1, 6)).toBe(false);
    // The final round: the claim spaces are covered, the last-round space is live.
    expect(spaceAvailable(turn, 6, 6)).toBe(false);
    expect(spaceAvailable(last, 6, 6)).toBe(true);
  });

  it('refuses a turn-order claim in the final round (SPACE_UNAVAILABLE)', () => {
    const s = lastRound();
    expectError(() => applyAction(s, activeId(s), { type: 'PLACE', space: 'turnorder-1' }), 'SPACE_UNAVAILABLE');
    expectError(() => applyAction(s, activeId(s), { type: 'PLACE', space: 'turnorder-2' }), 'SPACE_UNAVAILABLE');
  });

  it('refuses the last-round industry space outside the final round (SPACE_UNAVAILABLE)', () => {
    const s = newGame(2); // round 1 of 6
    expectError(
      () => applyAction(s, activeId(s), { type: 'PLACE', space: LAST_ROUND_INDUSTRY_ID }),
      'SPACE_UNAVAILABLE',
    );
  });

  it('lets a seat advance 3 industry steps on the last-round space in the final round', () => {
    const s = lastRound();
    const seat = s.activePlayerIndex;
    const after = applyAction(s, activeId(s), { type: 'PLACE', space: LAST_ROUND_INDUSTRY_ID });
    expect(after.players[seat]!.industry.wrench).toBe(3); // advanced 3 from START (no gap before lane 5)
  });

  it('legalActions offers the last-round space (not the claim spaces) only in the final round', () => {
    const last = placedSpaces(lastRound());
    expect(last.has(LAST_ROUND_INDUSTRY_ID)).toBe(true);
    expect(last.has('turnorder-1')).toBe(false);
    expect(last.has('turnorder-2')).toBe(false);

    const early = placedSpaces(newGame(2));
    expect(early.has(LAST_ROUND_INDUSTRY_ID)).toBe(false);
    // The first-place seat can't claim first (its own pawn) but can claim second place.
    expect(early.has('turnorder-2')).toBe(true);
  });
});
