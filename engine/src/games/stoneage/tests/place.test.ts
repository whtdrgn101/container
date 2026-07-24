import { describe, expect, it } from 'vitest';
import { place } from '../actions';
import { makeState, withPlacements, expectError } from './helpers';

describe('place', () => {
  it('records a placement and passes the turn to the next player', () => {
    const next = place(makeState(), 'p1', 'toolMaker', 1);
    expect(next.placements.toolMaker).toEqual({ p1: 1 });
    expect(next.activePlayerIndex).toBe(1); // Bob is up
    expect(next.phase).toBe('placement');
    expect(next.log.at(-1)).toEqual({
      seq: 1,
      type: 'PLACE',
      playerId: 'p1',
      payload: { place: 'toolMaker', count: 1 },
    });
  });

  it('places the hut’s two people and a chosen number on the hunt', () => {
    expect(place(makeState(), 'p1', 'hut', 2).placements.hut).toEqual({ p1: 2 });
    expect(place(makeState(), 'p1', 'hunt', 3).placements.hunt).toEqual({ p1: 3 });
  });

  it('ends the placement phase when nobody can place, handing the action phase to the start player', () => {
    // p2 has placed all 5; p1 has 1 left and places it — now everyone is out.
    const state = withPlacements({ clayPit: { p2: 5 }, forest: { p1: 4 } });
    const next = place(state, 'p1', 'hunt', 1);
    expect(next.phase).toBe('actions');
    expect(next.activePlayerIndex).toBe(0); // start player
  });

  it('rejects the wrong count for a place', () => {
    expectError(() => place(makeState(), 'p1', 'toolMaker', 2), 'INVALID_PLACEMENT'); // max 1
    expectError(() => place(makeState(), 'p1', 'hut', 1), 'INVALID_PLACEMENT'); // needs 2
    expectError(() => place(makeState(), 'p1', 'forest', 6), 'INVALID_PLACEMENT'); // only 5 people
  });

  it('rejects placing on a place you already used this round', () => {
    expectError(() => place(withPlacements({ forest: { p1: 2 } }), 'p1', 'forest', 1), 'INVALID_PLACEMENT');
  });
});
