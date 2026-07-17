import { describe, expect, it } from 'vitest';
import { use } from '../actions';
import { isUsePlace, legalUses } from '../internal';
import { withPlacements, expectError } from './helpers';

/** An action-phase state with p1 on the clock. */
const acting = (placed: Parameters<typeof withPlacements>[0]) =>
  withPlacements(placed, { phase: 'actions', activePlayerIndex: 0 });

describe('use', () => {
  it('tool maker → take a tool', () => {
    const next = use(acting({ toolMaker: { p1: 1 } }), 'p1', 'toolMaker');
    expect(next.players[0]!.tools).toEqual([1]);
    expect(next.placements.toolMaker).toEqual({}); // person returned
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'USE', playerId: 'p1', payload: { place: 'toolMaker' } });
  });

  it('hut → gain a person; field → raise food production', () => {
    expect(use(acting({ hut: { p1: 2 } }), 'p1', 'hut').players[0]!.people).toBe(6); // 5 + 1
    expect(use(acting({ field: { p1: 1 } }), 'p1', 'field').players[0]!.foodTrack).toBe(1);
  });

  it('advances the turn once the player is done', () => {
    // p1 uses their only placement → Bob (forest) is up.
    const next = use(acting({ field: { p1: 1 }, forest: { p2: 2 } }), 'p1', 'field');
    expect(next.activePlayerIndex).toBe(1);
  });

  it('rejects using a place with no people, or a dice place', () => {
    expectError(() => use(acting({}), 'p1', 'hut'), 'INVALID_USE'); // no placement
    expectError(() => use(acting({ forest: { p1: 2 } }), 'p1', 'forest'), 'INVALID_USE'); // dice place, not USE
  });
});

describe('use helpers', () => {
  it('isUsePlace covers the three non-dice places', () => {
    expect(isUsePlace('toolMaker')).toBe(true);
    expect(isUsePlace('hut')).toBe(true);
    expect(isUsePlace('field')).toBe(true);
    expect(isUsePlace('forest')).toBe(false);
  });

  it('legalUses lists the active player’s non-dice placements', () => {
    const state = acting({ toolMaker: { p1: 1 }, field: { p1: 1 }, forest: { p1: 2 } });
    expect(legalUses(state, 'p1')).toEqual([
      { type: 'USE', place: 'toolMaker' },
      { type: 'USE', place: 'field' },
    ]);
  });
});
