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

  it('sees whether a player has an actionable placement (a gather place — resources or hunt)', () => {
    expect(hasActionablePlacements(withPlacements({ forest: { p1: 2 } }), 'p1')).toBe(true);
    expect(hasActionablePlacements(withPlacements({ hunt: { p1: 2 } }), 'p1')).toBe(true);
    expect(hasActionablePlacements(withPlacements({ field: { p1: 1 } }), 'p1')).toBe(false); // not yet implemented
  });
});

describe('enterActionPhase', () => {
  it('seats the start player when they have something to do (incl. the hunt)', () => {
    expect(enterActionPhase(withPlacements({ hunt: { p1: 3 }, forest: { p2: 2 } }))).toMatchObject({
      phase: 'actions',
      activePlayerIndex: 0,
    });
  });

  it('skips a start player with nothing actionable, returning their people', () => {
    // p1 placed only on the field (no action yet); p2 has the forest.
    const change = enterActionPhase(withPlacements({ field: { p1: 1 }, forest: { p2: 2 } }));
    expect(change).toMatchObject({ phase: 'actions', activePlayerIndex: 1 });
    expect(change.placements!.field).toEqual({}); // p1's person returned
  });

  it('goes straight to feeding when nobody placed on a gather place', () => {
    expect(enterActionPhase(withPlacements({ field: { p1: 1 }, toolMaker: { p2: 1 } }))).toMatchObject({
      phase: 'feeding',
      activePlayerIndex: 0,
    });
  });
});

describe('advanceActor', () => {
  it('stays put while the active player has something to do', () => {
    const state = withPlacements({ hunt: { p1: 2 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(advanceActor(state)).toEqual({});
  });

  it('skips a player with nothing actionable to reach the next one', () => {
    // 3 players: p1 (active) is done, p2 has only the field, p3 has the quarry.
    const state = withPlacements(
      { quarry: { p3: 2 }, field: { p2: 1 } },
      { phase: 'actions', activePlayerIndex: 0 },
      ['Ann', 'Bob', 'Cara'],
    );
    const change = advanceActor(state);
    expect(change.activePlayerIndex).toBe(2);
    expect(change.placements!.field).toEqual({}); // p2 returned on the way past
  });

  it('ends the phase when no one else has anything to do', () => {
    const state = withPlacements({ field: { p2: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(advanceActor(state)).toMatchObject({ phase: 'feeding', activePlayerIndex: 0 });
  });
});
