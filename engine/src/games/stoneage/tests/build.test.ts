import { describe, expect, it } from 'vitest';
import type { Building, Resource, StoneAgeState } from '../core';
import { build } from '../actions';
import { makeState, withPlacements, expectError } from './helpers';

const nextTile: Building = { id: 'next', cost: { kind: 'fixed', resources: { wood: 1 } } };

/** An action-phase game where p1 has a person on building stack 0, whose top is `top`. */
function scenario(top: Building, p1res: Partial<Record<Resource, number>>): StoneAgeState {
  const base = withPlacements({ building1: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
  return {
    ...base,
    buildings: [[top, nextTile], base.buildings[1]!],
    players: base.players.map((p, i) =>
      i === 0 ? { ...p, resources: { wood: 0, brick: 0, stone: 0, gold: 0, ...p1res } } : p,
    ),
  };
}

const fixed = (resources: Partial<Record<Resource, number>>): Building => ({
  id: 'f',
  cost: { kind: 'fixed', resources },
});

describe('build', () => {
  it('buys a fixed building: pays it, scores its value, and reveals the next tile', () => {
    const next = build(scenario(fixed({ wood: 2, brick: 1 }), { wood: 2, brick: 1 }), 'p1', 0, { wood: 2, brick: 1 });
    expect(next.players[0]!.score).toBe(10); // 2×3 + 1×4
    expect(next.players[0]!.buildings).toBe(1);
    expect(next.players[0]!.resources).toEqual({ wood: 0, brick: 0, stone: 0, gold: 0 });
    expect(next.buildings[0]![0]!.id).toBe('next'); // the stack advanced
    expect(next.placements.building1).toEqual({}); // the person came back
    expect(next.log.at(-1)).toMatchObject({ type: 'BUILD', payload: { points: 10 } });
  });

  it('scores a choice building (exactly 4 from 2 kinds) by the value paid', () => {
    const next = build(
      scenario({ id: 'c', cost: { kind: 'choice', count: 4, kinds: 2 } }, { wood: 2, brick: 2 }),
      'p1',
      0,
      { wood: 2, brick: 2 },
    );
    expect(next.players[0]!.score).toBe(14); // 2×3 + 2×4
  });

  it('scores an any building (1–7, any kinds) by the value paid', () => {
    const next = build(scenario({ id: 'a', cost: { kind: 'any', min: 1, max: 7 } }, { stone: 2 }), 'p1', 0, {
      stone: 2,
    });
    expect(next.players[0]!.score).toBe(10); // 2×5
  });

  it('declines with an empty payment: keeps the building and resources, returns the person', () => {
    const next = build(scenario(fixed({ wood: 2 }), { wood: 2 }), 'p1', 0, {});
    expect(next.players[0]!.score).toBe(0);
    expect(next.players[0]!.buildings).toBe(0);
    expect(next.players[0]!.resources.wood).toBe(2); // not spent
    expect(next.buildings[0]![0]!.id).toBe('f'); // building still on top
    expect(next.placements.building1).toEqual({}); // person returned
    expect(next.log.at(-1)).toMatchObject({ payload: { declined: true } });
    expect(next.phase).toBe('feeding'); // p1's board is now clear, nobody else placed → feeding
  });

  it('rejects a payment that does not satisfy the tile, and a slot with no person', () => {
    expectError(() => build(scenario(fixed({ wood: 2 }), { wood: 2 }), 'p1', 0, { wood: 1 }), 'INVALID_BUILD');
    expectError(() => build(makeState({ phase: 'actions' }), 'p1', 0, { wood: 1 }), 'INVALID_BUILD'); // no person there
  });

  it('rejects building on an empty stack', () => {
    const empty = withPlacements({ building1: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expectError(() => build({ ...empty, buildings: [[], empty.buildings[1]!] }, 'p1', 0, { wood: 1 }), 'INVALID_BUILD');
  });
});
