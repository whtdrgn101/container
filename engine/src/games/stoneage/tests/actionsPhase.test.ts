import { describe, expect, it } from 'vitest';
import { advanceActor, enterActionPhase, hasActionablePlacements, isGatherPlace, isResourcePlace } from '../internal';
import { withPlacements } from './helpers';

describe('place classification', () => {
  it('identifies resource places and gather (dice) places', () => {
    expect(isResourcePlace('forest')).toBe(true);
    expect(isResourcePlace('hunt')).toBe(false); // the hunt yields food, not a resource
    expect(isGatherPlace('hunt')).toBe(true); // …but it still rolls dice
    expect(isGatherPlace('river')).toBe(true);
    expect(isGatherPlace('toolMaker')).toBe(false);
  });

  it('sees whether a player has any placement to resolve (every place is now actionable)', () => {
    expect(hasActionablePlacements(withPlacements({ forest: { p1: 2 } }), 'p1')).toBe(true);
    expect(hasActionablePlacements(withPlacements({ hunt: { p1: 2 } }), 'p1')).toBe(true);
    expect(hasActionablePlacements(withPlacements({ field: { p1: 1 } }), 'p1')).toBe(true); // field is a USE action now
    expect(hasActionablePlacements(withPlacements({ forest: { p2: 2 } }), 'p1')).toBe(false); // p1 placed nothing
  });
});

describe('enterActionPhase', () => {
  it('seats the start player when they have something to do', () => {
    expect(enterActionPhase(withPlacements({ hunt: { p1: 3 }, forest: { p2: 2 } }))).toMatchObject({
      phase: 'actions',
      activePlayerIndex: 0,
    });
  });

  it('skips a start player who placed nothing, seating the next one', () => {
    const change = enterActionPhase(withPlacements({ forest: { p2: 2 } })); // p1 placed nothing
    expect(change).toMatchObject({ phase: 'actions', activePlayerIndex: 1 });
  });

  it('goes straight to feeding when nobody has a placement', () => {
    expect(enterActionPhase(withPlacements({}))).toMatchObject({ phase: 'feeding', activePlayerIndex: 0 });
  });
});

describe('advanceActor', () => {
  it('stays put while the active player has something to do', () => {
    const state = withPlacements({ hunt: { p1: 2 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(advanceActor(state)).toEqual({});
  });

  it('skips a player with nothing to do to reach the next one', () => {
    // 3 players: p1 (active) is done, p2 placed nothing, p3 has the quarry.
    const state = withPlacements(
      { quarry: { p3: 2 } },
      { phase: 'actions', activePlayerIndex: 0 },
      ['Ann', 'Bob', 'Cara'],
    );
    expect(advanceActor(state).activePlayerIndex).toBe(2);
  });

  it('ends the phase when no one else has anything to do', () => {
    const state = withPlacements({}, { phase: 'actions', activePlayerIndex: 0 });
    expect(advanceActor(state)).toMatchObject({ phase: 'feeding', activePlayerIndex: 0 });
  });
});
