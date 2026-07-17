import { describe, expect, it } from 'vitest';
import {
  activePlayer,
  availableToPlace,
  canPlace,
  countRange,
  legalPlacements,
  nextPlacer,
  placedBy,
  record,
  seatOf,
} from '../internal';
import { makeState, withPlacements, expectError } from './helpers';

describe('placement counts', () => {
  it('placedBy / availableToPlace sum a player’s placements across places', () => {
    const state = withPlacements({ forest: { p1: 3 }, hunt: { p1: 1, p2: 2 } });
    expect(placedBy(state, 'p1')).toBe(4);
    expect(availableToPlace(state, 'p1')).toBe(1); // 5 people − 4 placed
    expect(availableToPlace(state, 'p2')).toBe(3);
  });
});

describe('countRange', () => {
  it('tool maker / field take exactly 1 while empty, then are full', () => {
    expect(countRange(makeState(), 'toolMaker', 'p1')).toEqual({ min: 1, max: 1 });
    expect(countRange(withPlacements({ toolMaker: { p2: 1 } }), 'toolMaker', 'p1')).toBeNull();
    expect(countRange(makeState(), 'field', 'p1')).toEqual({ min: 1, max: 1 });
  });

  it('the hut takes exactly 2 and needs two people', () => {
    expect(countRange(makeState(), 'hut', 'p1')).toEqual({ min: 2, max: 2 });
    // Only one person left → can't take the hut.
    const oneLeft = withPlacements({ forest: { p1: 4 } });
    expect(countRange(oneLeft, 'hut', 'p1')).toBeNull();
  });

  it('the hunt takes any number up to the people in hand', () => {
    expect(countRange(makeState(), 'hunt', 'p1')).toEqual({ min: 1, max: 5 });
  });

  it('a resource place shares its cap of 7, up to the people in hand', () => {
    expect(countRange(makeState(), 'forest', 'p1')).toEqual({ min: 1, max: 5 });
    // 6 already there → only 1 of the 7 remains.
    expect(countRange(withPlacements({ forest: { p2: 6 } }), 'forest', 'p1')).toEqual({ min: 1, max: 1 });
    // Full.
    expect(countRange(withPlacements({ forest: { p2: 7 } }), 'forest', 'p1')).toBeNull();
  });

  it('is null on a place you already used this round, or with no people left', () => {
    expect(countRange(withPlacements({ forest: { p1: 2 } }), 'forest', 'p1')).toBeNull();
    expect(countRange(withPlacements({ hunt: { p1: 5 } }), 'toolMaker', 'p1')).toBeNull(); // 0 left
  });
});

describe('canPlace / nextPlacer', () => {
  it('canPlace is false once a player is out of people', () => {
    expect(canPlace(makeState(), 'p1')).toBe(true);
    expect(canPlace(withPlacements({ hunt: { p1: 5 } }), 'p1')).toBe(false);
  });

  it('nextPlacer skips players who can’t place, and returns null when nobody can', () => {
    // p2 has placed all 5; p1 has 1 left → from p1, next is p1 again (p2 skipped).
    const p2Done = withPlacements({ clayPit: { p2: 5 }, forest: { p1: 4 } });
    expect(nextPlacer(p2Done, 0)).toBe(0);
    // Everyone out.
    const allDone = withPlacements({ clayPit: { p2: 5 }, forest: { p1: 5 } });
    expect(nextPlacer(allDone, 0)).toBeNull();
  });
});

describe('legalPlacements', () => {
  it('enumerates one action per legal (place, count) for a fresh board', () => {
    const options = legalPlacements(makeState(), 'p1');
    // toolMaker(1) + field(1) + hut(1) + hunt(1..5)=5 + 4 resource places ×(1..5)=20 → 28.
    expect(options).toHaveLength(28);
    expect(options).toContainEqual({ type: 'PLACE', place: 'hut', count: 2 });
    expect(options).toContainEqual({ type: 'PLACE', place: 'hunt', count: 5 });
    expect(options).toContainEqual({ type: 'PLACE', place: 'toolMaker', count: 1 });
  });

  it('skips places that are no longer available', () => {
    // The tool maker is taken, so it drops out (28 − its one option = 27).
    const options = legalPlacements(withPlacements({ toolMaker: { p2: 1 } }), 'p1');
    expect(options).toHaveLength(27);
    expect(options.some((a) => a.place === 'toolMaker')).toBe(false);
  });
});

describe('record + player helpers', () => {
  it('activePlayer / seatOf resolve the active seat', () => {
    const state = makeState({ activePlayerIndex: 1 });
    expect(activePlayer(state).id).toBe('p2');
    expect(seatOf(state, 'p2')).toBe(1);
    expectError(() => seatOf(state, 'ghost'), 'PLAYER_NOT_FOUND');
  });

  it('record bumps the version and logs with or without a payload', () => {
    const state = makeState();
    const withPayload = record(state, 'X', 'p1', { round: 2 }, { a: 1 });
    expect(withPayload.version).toBe(1);
    expect(withPayload.round).toBe(2);
    expect(withPayload.log.at(-1)).toEqual({ seq: 1, type: 'X', playerId: 'p1', payload: { a: 1 } });
    const noPayload = record(state, 'Y', 'p2');
    expect(noPayload.log.at(-1)).toEqual({ seq: 1, type: 'Y', playerId: 'p2' });
  });
});
