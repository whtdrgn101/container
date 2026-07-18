import { describe, expect, it } from 'vitest';
import type { Building, Resource, StoneAgePlayer } from '../core';
import {
  buildingIndex,
  buildingPaymentError,
  buildingPlaceId,
  dealBuildings,
  isBuildingPlace,
  paymentValue,
  totalPaid,
} from '../internal';

/** A player owning the given resources (everything else zero). */
const owning = (resources: Partial<Record<Resource, number>>): StoneAgePlayer => ({
  id: 'p1',
  name: 'A',
  people: 5,
  food: 12,
  foodTrack: 0,
  tools: [],
  toolsUsed: [],
  resources: { wood: 0, brick: 0, stone: 0, gold: 0, ...resources },
  civCards: [],
  buildings: 0,
  score: 0,
});

const fixed = (resources: Partial<Record<Resource, number>>): Building => ({ id: 'f', cost: { kind: 'fixed', resources } });
const choice: Building = { id: 'c', cost: { kind: 'choice', count: 4, kinds: 2 } };
const any: Building = { id: 'a', cost: { kind: 'any', min: 1, max: 7 } };

describe('building slot helpers', () => {
  it('identifies and indexes building slots', () => {
    expect(isBuildingPlace('building1')).toBe(true);
    expect(isBuildingPlace('forest')).toBe(false);
    expect(buildingIndex('building3')).toBe(2);
    expect(buildingPlaceId(0)).toBe('building1');
  });
});

describe('dealBuildings', () => {
  it('deals one stack of 7 per player, in deck order without an rng', () => {
    const stacks = dealBuildings(2);
    expect(stacks).toHaveLength(2);
    expect(stacks.every((s) => s.length === 7)).toBe(true);
    expect(stacks[0]![0]!.id).toBe('b01'); // top of the deck
    expect(dealBuildings(4)).toHaveLength(4);
  });

  it('shuffles with the injected rng', () => {
    const shuffled = dealBuildings(2, () => 0);
    expect(shuffled).toHaveLength(2);
    expect(shuffled[0]!.map((b) => b.id)).not.toEqual(dealBuildings(2)[0]!.map((b) => b.id));
  });
});

describe('payment maths', () => {
  it('totals the count and the scoring value of a payment', () => {
    expect(totalPaid({ wood: 2, brick: 1 })).toBe(3);
    expect(paymentValue({ wood: 2, brick: 1 })).toBe(2 * 3 + 1 * 4); // 10
    expect(paymentValue({})).toBe(0);
  });
});

describe('buildingPaymentError', () => {
  it('accepts an exact payment for a fixed building and rejects a wrong one', () => {
    expect(buildingPaymentError(fixed({ wood: 2, brick: 1 }), { wood: 2, brick: 1 }, owning({ wood: 2, brick: 1 }))).toBeNull();
    expect(buildingPaymentError(fixed({ wood: 2, brick: 1 }), { wood: 2 }, owning({ wood: 2 }))).toMatch(/exact resources/);
  });

  it('rejects a payment the player cannot afford or that is not whole', () => {
    expect(buildingPaymentError(fixed({ wood: 2 }), { wood: 2 }, owning({ wood: 1 }))).toMatch(/Not enough wood/);
    expect(buildingPaymentError(any, { wood: 1.5 }, owning({ wood: 2 }))).toMatch(/whole number/);
  });

  it('enforces a choice building: exactly N resources from exactly K kinds', () => {
    expect(buildingPaymentError(choice, { wood: 2, brick: 2 }, owning({ wood: 2, brick: 2 }))).toBeNull();
    expect(buildingPaymentError(choice, { wood: 3 }, owning({ wood: 3 }))).toMatch(/exactly 4 resources/);
    expect(buildingPaymentError(choice, { wood: 2, brick: 1, stone: 1 }, owning({ wood: 2, brick: 1, stone: 1 }))).toMatch(/2 different kinds/);
  });

  it('enforces an any building: a total within its min..max', () => {
    expect(buildingPaymentError(any, { wood: 3, gold: 1 }, owning({ wood: 3, gold: 1 }))).toBeNull();
    const eight = { wood: 7, brick: 1 };
    expect(buildingPaymentError(any, eight, owning(eight))).toMatch(/1–7 resources/);
  });
});
