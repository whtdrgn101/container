import { describe, expect, it } from 'vitest';
import { createGame, viewFor } from '../../engine';
import type { Building, Resource, StoneAgePlayer, StoneAgeState, StoneAgeView } from '../../engine';
import {
  buildingPaymentFor,
  cardPaymentFor,
  chooseTools,
  foodDeficit,
  pickPlacement,
  placementValue,
  remainingRounds,
  residualAfterCommitments,
  WEIGHTS,
} from '../policy';

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
const fixed = (resources: Partial<Record<Resource, number>>): Building => ({
  id: 'f',
  cost: { kind: 'fixed', resources },
});
const base = () => createGame({ id: 'g', players: [{ name: 'Ann' }, { name: 'Bob' }] });
/** `base()` with player 1 replaced — the view most tests score placements against. */
const viewWith = (p1: Partial<StoneAgePlayer>, over: Partial<StoneAgeState> = {}): StoneAgeView => {
  const s = base();
  // Cast bridges the end-state discriminated union — this fixture fabricates an arbitrary position.
  const state = { ...s, ...over, players: s.players.map((p, i) => (i === 0 ? { ...p, ...p1 } : p)) } as StoneAgeState;
  return viewFor(state, 'p1');
};
const p1Of = (view: StoneAgeView) => view.players[0]!;
/** Gross placement value at a fresh board, full horizon. */
const value = (view: StoneAgeView, place: Parameters<typeof placementValue>[2], count = 1) =>
  placementValue(view, p1Of(view), place, count, remainingRounds(view));

describe('foodDeficit', () => {
  it('is zero with food in hand, positive once it runs low', () => {
    expect(foodDeficit(player({ food: 12, foodTrack: 0 }))).toBe(0); // 12 ≥ people×2
    expect(foodDeficit(player({ food: 2, foodTrack: 0 }))).toBe(8); // wants 10, has 2
  });
});

describe('remainingRounds', () => {
  it('is bounded by the shallowest building stack', () => {
    const s = base();
    const short = { ...s, buildings: s.buildings.map((stack, i) => (i === 0 ? stack.slice(0, 2) : stack)) };
    expect(remainingRounds(viewFor(short, 'p1'))).toBe(2);
  });

  it('is bounded by the card deck draining at the table buy rate, and clamped to [1, 12]', () => {
    const s = base();
    // 2 players → 2 buys/round; a 6-card deck lasts ~3 rounds.
    expect(remainingRounds(viewFor({ ...s, cardDeck: s.cardDeck.slice(0, 6) }, 'p1'))).toBe(3);
    expect(remainingRounds(viewFor({ ...s, cardDeck: [] }, 'p1'))).toBe(1); // never 0
    expect(remainingRounds(viewFor(s, 'p1'))).toBeLessThanOrEqual(12); // full 7-tile stacks → 7, capped anyway
  });
});

describe('residualAfterCommitments — the phantom-affordability fix', () => {
  it('subtracts the planned payment for a building slot the bot already occupies', () => {
    const s = base(); // building1 top is b01: 2 wood + 1 brick (deck order)
    const view = viewFor({ ...s, placements: { ...s.placements, building1: { p1: 1 } } }, 'p1');
    const rich = player({ resources: { wood: 2, brick: 1, stone: 0, gold: 0 } });
    const residual = residualAfterCommitments(view, rich);
    expect(residual.resources).toEqual({ wood: 0, brick: 0, stone: 0, gold: 0 });
  });

  it('makes a second purchase slot score as unaffordable once the first eats the stock', () => {
    const s = base();
    const view = viewFor({ ...s, placements: { ...s.placements, building1: { p1: 1 } } }, 'p1');
    const rich = player({ resources: { wood: 2, brick: 1, stone: 0, gold: 0 } }); // affords exactly one b01
    const residual = residualAfterCommitments(view, rich);
    const roundsLeft = remainingRounds(view);
    // card1 costs 1 resource — affordable on raw stock, not after the building commitment.
    expect(placementValue(view, rich, 'card1', 1, roundsLeft, residual)).toBe(WEIGHTS.unaffordable);
    expect(placementValue(view, rich, 'card1', 1, roundsLeft, rich)).toBeGreaterThan(WEIGHTS.unaffordable);
  });
});

describe('placementValue', () => {
  it('values the hut by the remaining horizon (no round gate) and decays it late', () => {
    const s = base();
    const early = viewFor(s, 'p1');
    const late = viewFor({ ...s, buildings: s.buildings.map((st) => st.slice(0, 1)) }, 'p1'); // 1 round left
    expect(value(early, 'hut', 2)).toBeGreaterThan(value(late, 'hut', 2));
    // Even outside rounds 1–2 the hut stays attractive while the horizon is long (the old gate is gone).
    const round5 = viewFor({ ...s, round: 5 }, 'p1');
    expect(value(round5, 'hut', 2) - 2 * WEIGHTS.workerShadow).toBeGreaterThan(
      value(round5, 'forest', 1) - WEIGHTS.workerShadow,
    );
  });

  it('keeps valuing tools past two, until the ladder is maxed', () => {
    const twoTools = viewWith({ tools: [1, 1], toolsUsed: [false, false] });
    expect(value(twoTools, 'toolMaker')).toBeGreaterThan(1); // old policy scored this 0.3
    const maxed = viewWith({ tools: [4, 4, 4], toolsUsed: [false, false, false] });
    expect(value(maxed, 'toolMaker')).toBeLessThan(0.5); // a 13th tool is a no-op
  });

  it('keeps valuing the field once fed (tapered), and boosts it per farmer card held', () => {
    const fed = viewWith({ foodTrack: 5 }); // foodTrack ≥ people → tapered, not abandoned
    expect(value(fed, 'field')).toBeGreaterThan(1);
    const farmer = viewWith({ civCards: ['cv25'] }); // a farmer multiplier card
    expect(value(farmer, 'field')).toBeGreaterThan(value(viewWith({}), 'field'));
  });

  it('values a capped hut or field as a block only (pg. 2 caps: 10 people, food track 10)', () => {
    const cappedPeople = viewWith({ people: 10 });
    expect(value(cappedPeople, 'hut', 2)).toBeLessThanOrEqual(WEIGHTS.denial.hut); // denial at most
    const cappedTrack = viewWith({ foodTrack: 10 });
    expect(value(cappedTrack, 'field')).toBeLessThanOrEqual(WEIGHTS.denial.field);
    // A shaman card's projection also respects the population cap.
    const nearCap = viewWith({ people: 10, resources: { wood: 1, brick: 0, stone: 0, gold: 0 } });
    expect(value(nearCap, 'hut', 2)).toBeLessThan(value(viewWith({}), 'hut', 2));
  });

  it('adds denial value only while an opponent still has people to place', () => {
    const s = base();
    const open = viewFor(s, 'p1');
    // Opponent fully placed → no denial left in taking the hut.
    const done = viewFor({ ...s, placements: { ...s.placements, hunt: { p2: 5 } } }, 'p1');
    expect(value(open, 'hut', 2) - value(done, 'hut', 2)).toBeCloseTo(WEIGHTS.denial.hut, 5);
  });

  it('prices a new green symbol at its squared marginal (2s+1) and a duplicate at ~0 scoring', () => {
    // Deck order: card1 is cv01 (green, writing). One resource to pay with.
    const noSymbols = viewWith({ resources: { wood: 1, brick: 0, stone: 0, gold: 0 } });
    const hasWriting = viewWith({ resources: { wood: 1, brick: 0, stone: 0, gold: 0 }, civCards: ['cv02'] }); // already holds writing
    const hasOther = viewWith({ resources: { wood: 1, brick: 0, stone: 0, gold: 0 }, civCards: ['cv04'] }); // holds pottery: s=1 → 2s+1 = 3
    const fresh = value(noSymbols, 'card1'); // s=0 → marginal 1
    expect(value(hasOther, 'card1')).toBeGreaterThan(fresh); // 3 > 1
    expect(value(hasWriting, 'card1')).toBeLessThan(fresh); // duplicate symbol scores 0
  });

  it('scores an affordable building by payment value net of resource worth, and unaffordable slots low', () => {
    const rich = viewWith({ resources: { wood: 2, brick: 1, stone: 0, gold: 0 } }); // affords b01 (2w+1b = 10 pts)
    expect(value(rich, 'building1')).toBeGreaterThan(4);
    const poor = viewWith({});
    expect(value(poor, 'building1')).toBe(WEIGHTS.unaffordable);
  });

  it('values hunt food steeply when starving and mildly when stocked', () => {
    const starving = viewWith({ food: 1 });
    const stocked = viewWith({ food: 20 });
    expect(value(starving, 'hunt', 3)).toBeGreaterThan(value(stocked, 'hunt', 3) * 2);
  });
});

describe('pickPlacement', () => {
  it('always returns a legal placement and chooses worker count by marginal value', () => {
    const view = viewFor(base(), 'p1');
    const { place, count } = pickPlacement(view, 'p1');
    expect(count).toBeGreaterThanOrEqual(1);
    expect(place).toBeTruthy();
    // Per-worker value on a resource place is linear but the shadow price is too — the argmax never
    // buys workers whose marginal value is below the shadow price (here: gold at 3.5/6 × worth).
    const riverOnly = pickPlacement(view, 'p1');
    expect(riverOnly.count).toBeLessThanOrEqual(view.players[0]!.people);
  });

  it('contests the hut early instead of spreading onto resources (the old bot never did)', () => {
    const view = viewFor(base(), 'p1');
    const { place } = pickPlacement(view, 'p1');
    expect(place).toBe('hut'); // fresh 2p game, full horizon: population compounding wins the argmax
  });
});

describe('building/card payments', () => {
  it('pays a fixed cost only when affordable', () => {
    expect(
      buildingPaymentFor(fixed({ wood: 2, brick: 1 }), player({ resources: { wood: 2, brick: 1, stone: 0, gold: 0 } })),
    ).toEqual({ wood: 2, brick: 1 });
    expect(buildingPaymentFor(fixed({ wood: 2 }), player())).toBeNull();
  });

  it('builds a valid payment for the choice kind', () => {
    const choice: Building = { id: 'c', cost: { kind: 'choice', count: 4, kinds: 2 } };
    const pay = buildingPaymentFor(choice, player({ resources: { wood: 3, brick: 3, stone: 0, gold: 0 } }));
    expect(pay).not.toBeNull();
    expect(Object.values(pay!).reduce((s, n) => s + n, 0)).toBe(4); // exactly 4
  });

  it('pays an "any" building to the max, richest resources first (the payment is the score)', () => {
    const any: Building = { id: 'a', cost: { kind: 'any', min: 1, max: 7 } };
    // 10 banked, max 7 → dump the 7 dearest (5 gold + 2 wood), not a minimum single wood.
    const rich = player({ resources: { wood: 5, brick: 0, stone: 0, gold: 5 } });
    expect(buildingPaymentFor(any, rich)).toEqual({ gold: 5, wood: 2 });
    // Fewer than max banked → spend everything; below min → null.
    expect(buildingPaymentFor(any, player({ resources: { stone: 2, wood: 0, brick: 0, gold: 0 } }))).toEqual({
      stone: 2,
    });
    expect(buildingPaymentFor(any, player())).toBeNull();
  });

  it('pays a card its position cost from cheapest resources, or nothing if too poor', () => {
    expect(cardPaymentFor(0, player({ resources: { wood: 1, brick: 0, stone: 0, gold: 0 } }))).toEqual({ wood: 1 });
    expect(cardPaymentFor(3, player({ resources: { wood: 2, brick: 0, stone: 0, gold: 0 } }))).toBeNull(); // needs 4
  });
});

describe('chooseTools', () => {
  const withRoll = (
    dice: number[],
    tools: number[],
    toolsUsed: boolean[],
    place: 'forest' | 'hunt' = 'forest',
  ): StoneAgeState => ({
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
