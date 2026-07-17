import { describe, expect, it } from 'vitest';
import { advanceActor, enterActionPhase, hasResourcePlacements, isResourcePlace } from '../internal';
import { withPlacements } from './helpers';

describe('isResourcePlace / hasResourcePlacements', () => {
  it('identifies the four gathering places', () => {
    expect(isResourcePlace('forest')).toBe(true);
    expect(isResourcePlace('river')).toBe(true);
    expect(isResourcePlace('hunt')).toBe(false);
    expect(isResourcePlace('toolMaker')).toBe(false);
  });

  it('sees whether a player has resources left to gather', () => {
    expect(hasResourcePlacements(withPlacements({ forest: { p1: 2 } }), 'p1')).toBe(true);
    expect(hasResourcePlacements(withPlacements({ hunt: { p1: 2 } }), 'p1')).toBe(false);
  });
});

describe('enterActionPhase', () => {
  it('seats the start player when they have resources to gather', () => {
    const state = withPlacements({ forest: { p1: 2 }, clayPit: { p2: 2 } });
    expect(enterActionPhase(state)).toMatchObject({ phase: 'actions', activePlayerIndex: 0 });
  });

  it('skips a start player with no resources (returning their people) to the next gatherer', () => {
    // p1 placed only on the hunt (no resources to gather); p2 has the forest.
    const state = withPlacements({ hunt: { p1: 3 }, forest: { p2: 2 } });
    const change = enterActionPhase(state);
    expect(change).toMatchObject({ phase: 'actions', activePlayerIndex: 1 });
    expect(change.placements!.hunt).toEqual({}); // p1's people returned
  });

  it('goes straight to feeding when nobody placed on a resource place', () => {
    const state = withPlacements({ hunt: { p1: 3 }, field: { p2: 1 } });
    expect(enterActionPhase(state)).toMatchObject({ phase: 'feeding', activePlayerIndex: 0 });
  });
});

describe('advanceActor', () => {
  it('stays put while the active player has resources left', () => {
    const state = withPlacements({ forest: { p1: 2 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(advanceActor(state)).toEqual({});
  });

  it('skips a player with no resources to reach the next gatherer', () => {
    // 3 players: p1 (active) is done, p2 has none, p3 has the quarry.
    const state = withPlacements(
      { quarry: { p3: 2 }, hunt: { p2: 1 } },
      { phase: 'actions', activePlayerIndex: 0 },
      ['Ann', 'Bob', 'Cara'],
    );
    const change = advanceActor(state);
    expect(change.activePlayerIndex).toBe(2);
    expect(change.placements!.hunt).toEqual({}); // p2 returned on the way past
  });

  it('ends the phase when no one else can gather', () => {
    const state = withPlacements({ hunt: { p2: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(advanceActor(state)).toMatchObject({ phase: 'feeding', activePlayerIndex: 0 });
  });
});
