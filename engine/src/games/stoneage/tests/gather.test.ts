import { describe, expect, it } from 'vitest';
import { gather } from '../actions';
import { withPlacements, expectError } from './helpers';

/** An action-phase state with the given placements and p1 (Ann) on the clock. */
const acting = (placed: Parameters<typeof withPlacements>[0]) =>
  withPlacements(placed, { phase: 'actions', activePlayerIndex: 0 });

describe('gather', () => {
  it('takes 1 resource per full threshold and returns the people', () => {
    const state = acting({ forest: { p1: 3 } });
    const next = gather(state, 'p1', 'forest', [3, 4, 3]); // total 10, wood per full 3 → 3 wood
    expect(next.players[0]!.resources.wood).toBe(3);
    expect(next.placements.forest).toEqual({}); // people returned
    expect(next.log.at(-1)).toEqual({
      seq: 1,
      type: 'GATHER',
      playerId: 'p1',
      payload: { place: 'forest', dice: [3, 4, 3], resource: 'wood', amount: 3 },
    });
  });

  it('uses each place’s own threshold and yield', () => {
    expect(gather(acting({ clayPit: { p1: 2 } }), 'p1', 'clayPit', [4, 5]).players[0]!.resources.brick).toBe(2); // 9/4
    expect(gather(acting({ quarry: { p1: 2 } }), 'p1', 'quarry', [5, 6]).players[0]!.resources.stone).toBe(2); // 11/5
    expect(gather(acting({ river: { p1: 2 } }), 'p1', 'river', [6, 6]).players[0]!.resources.gold).toBe(2); // 12/6
  });

  it('stays on the same player while they have more resource places to gather', () => {
    const state = acting({ forest: { p1: 3 }, quarry: { p1: 2 } });
    const next = gather(state, 'p1', 'forest', [1, 1, 1]);
    expect(next.activePlayerIndex).toBe(0); // still Ann — quarry remains
    expect(next.phase).toBe('actions');
  });

  it('passes to the next gatherer once a player is done', () => {
    const state = acting({ forest: { p1: 3 }, clayPit: { p2: 2 } });
    const next = gather(state, 'p1', 'forest', [1, 1, 1]);
    expect(next.activePlayerIndex).toBe(1); // Bob is up
  });

  it('ends the action phase (→ feeding) when nobody else can gather', () => {
    const next = gather(acting({ forest: { p1: 3 } }), 'p1', 'forest', [1, 1, 1]);
    expect(next.phase).toBe('feeding');
    expect(next.activePlayerIndex).toBe(0); // start player
  });

  it('rejects gathering where you have no people, a non-resource place, or the wrong dice', () => {
    expectError(() => gather(acting({}), 'p1', 'forest', []), 'INVALID_GATHER'); // no placement
    expectError(() => gather(acting({ hunt: { p1: 2 } }), 'p1', 'hunt', [1, 1]), 'INVALID_GATHER'); // not a resource place
    expectError(() => gather(acting({ forest: { p1: 3 } }), 'p1', 'forest', [1, 1]), 'INVALID_GATHER'); // needs 3 dice
    expectError(() => gather(acting({ forest: { p1: 1 } }), 'p1', 'forest', [7]), 'INVALID_GATHER'); // die out of range
  });
});
