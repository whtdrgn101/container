import { describe, expect, it } from 'vitest';
import { gather } from '../actions';
import { withPlacements, expectError } from './helpers';

/** An action-phase state with the given placements and p1 (Ann) on the clock. */
const acting = (placed: Parameters<typeof withPlacements>[0]) =>
  withPlacements(placed, { phase: 'actions', activePlayerIndex: 0 });

describe('gather (roll — step 1)', () => {
  it('records the roll as a pending gather without taking any yield yet', () => {
    const state = acting({ forest: { p1: 3 } });
    const next = gather(state, 'p1', 'forest', [3, 4, 3]);
    expect(next.pendingGather).toEqual({ place: 'forest', dice: [3, 4, 3] });
    expect(next.players[0]!.resources.wood).toBe(0); // nothing taken until the take step
    expect(next.placements.forest).toEqual({ p1: 3 }); // people stay on the board
    expect(next.activePlayerIndex).toBe(0); // turn does not advance yet
    expect(next.log.at(-1)).toEqual({
      seq: 1,
      type: 'GATHER',
      playerId: 'p1',
      payload: { place: 'forest', dice: [3, 4, 3] },
    });
  });

  it('rejects rolling where you have no people, a non-dice place, or the wrong dice', () => {
    expectError(() => gather(acting({}), 'p1', 'forest', []), 'INVALID_GATHER'); // no placement
    expectError(() => gather(acting({ toolMaker: { p1: 1 } }), 'p1', 'toolMaker', [1]), 'INVALID_GATHER'); // not a dice place
    expectError(() => gather(acting({ forest: { p1: 3 } }), 'p1', 'forest', [1, 1]), 'INVALID_GATHER'); // needs 3 dice
    expectError(() => gather(acting({ forest: { p1: 1 } }), 'p1', 'forest', [7]), 'INVALID_GATHER'); // die out of range
  });
});
