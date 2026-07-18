import { describe, expect, it } from 'vitest';
import type { GatherPlaceId, StoneAgePlayer, StoneAgeState } from '../core';
import { takeGather } from '../actions';
import { withPlacements, expectError } from './helpers';

/** An action-phase state where p1 has rolled `dice` at `place` (people still on the board). */
function pending(
  place: GatherPlaceId,
  dice: number[],
  opts: { p1?: Partial<StoneAgePlayer>; placed?: Parameters<typeof withPlacements>[0] } = {},
): StoneAgeState {
  const base = withPlacements({ [place]: { p1: dice.length }, ...opts.placed }, { phase: 'actions', activePlayerIndex: 0 });
  return {
    ...base,
    pendingGather: { place, dice },
    players: base.players.map((p, i) => (i === 0 ? { ...p, ...opts.p1 } : p)),
  };
}

describe('takeGather (take — step 2)', () => {
  it('takes the yield, returns the people, and clears the pending roll', () => {
    const next = takeGather(pending('forest', [3, 4, 3]), 'p1', []); // total 10, wood per full 3 → 3
    expect(next.players[0]!.resources.wood).toBe(3);
    expect(next.placements.forest).toEqual({});
    expect(next.pendingGather).toBeNull();
    expect(next.log.at(-1)).toMatchObject({ type: 'TAKE', payload: { place: 'forest', amount: 3, kind: 'wood', boost: 0 } });
  });

  it('uses each place’s own threshold and yield, and hunts for food', () => {
    expect(takeGather(pending('clayPit', [4, 5]), 'p1', []).players[0]!.resources.brick).toBe(2); // 9/4
    expect(takeGather(pending('quarry', [5, 6]), 'p1', []).players[0]!.resources.stone).toBe(2); // 11/5
    expect(takeGather(pending('river', [6, 6]), 'p1', []).players[0]!.resources.gold).toBe(2); // 12/6
    expect(takeGather(pending('hunt', [6, 4, 4]), 'p1', []).players[0]!.food).toBe(19); // 12 + 14/2
  });

  it('adds the chosen tools to the total and spends them for the round', () => {
    // dice 1+1 = 2; tools 2 and 3 added → total 7 → wood 7/3 = 2. Both tools now used.
    const next = takeGather(pending('forest', [1, 1], { p1: { tools: [2, 3], toolsUsed: [false, false] } }), 'p1', [0, 1]);
    expect(next.players[0]!.resources.wood).toBe(2);
    expect(next.players[0]!.toolsUsed).toEqual([true, true]);
    expect(next.log.at(-1)).toMatchObject({ payload: { boost: 5 } });
  });

  it('leaves other tools available when only some are spent', () => {
    const next = takeGather(pending('forest', [3, 3], { p1: { tools: [1, 2], toolsUsed: [false, false] } }), 'p1', [1]);
    expect(next.players[0]!.toolsUsed).toEqual([false, true]); // only tool 1 spent
  });

  it('advances the turn like a gather: stays, passes, or ends the action phase', () => {
    // Stays: p1 still has the quarry to work.
    expect(takeGather(pending('forest', [1, 1, 1], { placed: { quarry: { p1: 2 } } }), 'p1', []).activePlayerIndex).toBe(0);
    // Passes: p2 has a place to work.
    expect(takeGather(pending('forest', [1, 1, 1], { placed: { clayPit: { p2: 2 } } }), 'p1', []).activePlayerIndex).toBe(1);
    // Ends: nobody else can gather → feeding.
    expect(takeGather(pending('forest', [1, 1, 1]), 'p1', []).phase).toBe('feeding');
  });

  it('rejects a take with no pending roll or a bad tool selection', () => {
    expectError(() => takeGather(withPlacements({}, { phase: 'actions' }), 'p1', []), 'INVALID_TAKE'); // nothing rolled
    expectError(() => takeGather(pending('forest', [1], { p1: { tools: [1], toolsUsed: [false] } }), 'p1', [5]), 'INVALID_TAKE'); // out of range
    expectError(() => takeGather(pending('forest', [1], { p1: { tools: [1, 2], toolsUsed: [true, false] } }), 'p1', [0]), 'INVALID_TAKE'); // already used
    expectError(() => takeGather(pending('forest', [1], { p1: { tools: [1], toolsUsed: [false] } }), 'p1', [0, 0]), 'INVALID_TAKE'); // duplicate
    expectError(() => takeGather(pending('forest', [1], { p1: { tools: [1], toolsUsed: [false] } }), 'p1', [-1]), 'INVALID_TAKE'); // negative
  });
});
