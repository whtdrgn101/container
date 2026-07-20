import { describe, expect, it } from 'vitest';
import { createGame, viewFor } from '@game-hub/engine/stoneage';
import type { Building, Resource, StoneAgePlayer, StoneAgeState } from '@game-hub/engine/stoneage';
import { buildingPaymentFor, cardPaymentFor, chooseTools, foodDeficit, placementScore } from '../policy';

const player = (over: Partial<StoneAgePlayer> = {}): StoneAgePlayer => ({
  id: 'p1',
  name: 'A',
  people: 5,
  food: 12,
  foodTrack: 0,
  tools: [],
  toolsUsed: [],
  resources: { wood: 0, brick: 0, stone: 0, gold: 0 },
  civCards: [],
  buildings: 0,
  score: 0,
  ...over,
});
const fixed = (resources: Partial<Record<Resource, number>>): Building => ({ id: 'f', cost: { kind: 'fixed', resources } });
const base = () => createGame({ id: 'g', players: [{ name: 'Ann' }, { name: 'Bob' }] });

describe('foodDeficit', () => {
  it('is zero with food in hand, positive once it runs low', () => {
    expect(foodDeficit(player({ food: 12, foodTrack: 0 }))).toBe(0); // 12 ≥ people×2
    expect(foodDeficit(player({ food: 2, foodTrack: 0 }))).toBe(8); // wants 10, has 2
  });
});

describe('placementScore', () => {
  it('prefers spending (affordable building/card) and food when hungry', () => {
    const view = viewFor(base(), 'p1');
    const rich = player({ resources: { wood: 2, brick: 1, stone: 0, gold: 0 } }); // affords b01 (2w+1b)
    const poor = player();
    expect(placementScore(view, rich, 'building1')).toBeGreaterThan(placementScore(view, rich, 'forest'));
    expect(placementScore(view, poor, 'building1')).toBeLessThan(1); // can't afford → low
    const hungry = player({ food: 1 });
    expect(placementScore(view, hungry, 'hunt')).toBeGreaterThan(placementScore(view, player(), 'hunt'));
  });
});

describe('building/card payments', () => {
  it('pays a fixed cost only when affordable', () => {
    expect(buildingPaymentFor(fixed({ wood: 2, brick: 1 }), player({ resources: { wood: 2, brick: 1, stone: 0, gold: 0 } }))).toEqual({ wood: 2, brick: 1 });
    expect(buildingPaymentFor(fixed({ wood: 2 }), player())).toBeNull();
  });

  it('builds a valid payment for the flexible kinds', () => {
    const choice: Building = { id: 'c', cost: { kind: 'choice', count: 4, kinds: 2 } };
    const pay = buildingPaymentFor(choice, player({ resources: { wood: 3, brick: 3, stone: 0, gold: 0 } }));
    expect(pay).not.toBeNull();
    expect(Object.values(pay!).reduce((s, n) => s + n, 0)).toBe(4); // exactly 4
    const any: Building = { id: 'a', cost: { kind: 'any', min: 1, max: 7 } };
    expect(buildingPaymentFor(any, player({ resources: { stone: 2, wood: 0, brick: 0, gold: 0 } }))).not.toBeNull();
    expect(buildingPaymentFor(any, player())).toBeNull(); // nothing to pay
  });

  it('pays a card its position cost from cheapest resources, or nothing if too poor', () => {
    expect(cardPaymentFor(0, player({ resources: { wood: 1, brick: 0, stone: 0, gold: 0 } }))).toEqual({ wood: 1 });
    expect(cardPaymentFor(3, player({ resources: { wood: 2, brick: 0, stone: 0, gold: 0 } }))).toBeNull(); // needs 4
  });
});

describe('chooseTools', () => {
  const withRoll = (dice: number[], tools: number[], toolsUsed: boolean[], place: 'forest' | 'hunt' = 'forest'): StoneAgeState => ({
    ...base(),
    pendingGather: { place, dice },
    players: base().players.map((p, i) => (i === 0 ? { ...p, tools, toolsUsed } : p)),
    activePlayerIndex: 0,
  });

  it('spends the minimal tools to reach the next threshold, and none when already on one', () => {
    // forest total 8, threshold 3 → remainder 2 → need 1 to reach 9. A value-1 tool does it.
    expect(chooseTools(viewFor(withRoll([2, 2, 2, 2], [1, 2], [false, false]), 'p1'))).toEqual([0]);
    // total 9 is already a multiple of 3 → no tool helps.
    expect(chooseTools(viewFor(withRoll([3, 3, 3], [1], [false]), 'p1'))).toEqual([]);
    // can't reach the next multiple (need 1, but the only tool is already used) → spend none.
    expect(chooseTools(viewFor(withRoll([2, 2, 2, 2], [1], [true]), 'p1'))).toEqual([]);
  });

  it('is empty with no pending roll', () => {
    expect(chooseTools(viewFor(base(), 'p1'))).toEqual([]);
  });
});
