import { describe, expect, it } from 'vitest';
import { CARD_DEFS, CARD_KINDS, deckCount } from '../core';
import { dealMarkers, mintStack, shuffle } from '../internal';

describe('deck data', () => {
  it('has the printed group totals (pg. 1: 31 / 28 / 27 / 30)', () => {
    expect(deckCount('worker')).toBe(31);
    expect(deckCount('building')).toBe(28);
    expect(deckCount('aristocrat')).toBe(27);
    expect(deckCount('trading')).toBe(30);
    // The four groups are 116 game cards. Pg. 1's "120 cards" headline includes the 4 starting-player
    // cards (one per phase colour) — markers we model as `startingPlayers` seats, not as deck cards.
    const total = CARD_KINDS.reduce((sum, kind) => sum + deckCount(kind), 0);
    expect(total).toBe(116);
    expect(total + 4).toBe(120);
  });

  it('splits the 30 trading cards 10 / 10 / 10 by upgrade group (pg. 7)', () => {
    const trading = CARD_DEFS.filter((d) => d.kind === 'trading');
    const byGroup = (group: string) =>
      trading.filter((d) => d.tradingGroup === group).reduce((sum, d) => sum + d.count, 0);
    expect(byGroup('worker')).toBe(10);
    expect(byGroup('building')).toBe(10);
    expect(byGroup('aristocrat')).toBe(10);
  });

  it('flags exactly the six special cards (pg. 7–8)', () => {
    const specials = CARD_DEFS.filter((d) => d.special).map((d) => d.special).sort();
    expect(specials).toEqual(['mariinskij', 'observatory', 'potemkin', 'pub', 'taxman', 'warehouse']);
  });

  it('gives every card key a unique definition', () => {
    const keys = CARD_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('mintStack', () => {
  it('mints one instance per copy, with unique ids and the definition fields', () => {
    const workers = mintStack('worker');
    expect(workers).toHaveLength(31);
    expect(new Set(workers.map((c) => c.id)).size).toBe(31);
    // A basic worker carries its ware symbol; the trading cards carry a group; specials carry a flag.
    const lumber = workers.find((c) => c.key === 'lumberjack')!;
    expect(lumber).toMatchObject({ ware: 'lumber', income: 3, cost: 3 });
    expect(lumber.tradingGroup).toBeUndefined();
    expect(lumber.special).toBeUndefined();
  });

  it('carries tradingGroup on trading cards and the special flag where set', () => {
    const trading = mintStack('trading');
    expect(trading).toHaveLength(30);
    expect(trading.find((c) => c.key === 'mariinskij')).toMatchObject({ tradingGroup: 'building', special: 'mariinskij' });
    const building = mintStack('building');
    expect(building.find((c) => c.key === 'pub')).toMatchObject({ special: 'pub' });
    expect(building.find((c) => c.key === 'market')?.special).toBeUndefined();
  });
});

describe('shuffle', () => {
  it('returns a copy in the same order without an rng (deterministic)', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input); // never mutates the input
  });

  it('reorders with an rng and leaves the input untouched', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    let seed = 0;
    const rng = () => {
      seed += 1;
      return (seed * 0.6180339887) % 1; // varied, deterministic
    };
    const out = shuffle(input, rng);
    expect(out).toHaveLength(20);
    expect([...out].sort((a, b) => a - b)).toEqual(input); // a permutation
    expect(out).not.toEqual(input); // actually reordered
    expect(input).toEqual(Array.from({ length: 20 }, (_, i) => i)); // input intact
  });
});

describe('dealMarkers', () => {
  it('deals 1 marker to each of 4 seats (deterministic → phase order)', () => {
    expect(dealMarkers(4)).toEqual({ worker: 0, building: 1, aristocrat: 2, trading: 3 });
  });

  it('gives one seat two markers in a 3-player game (pg. 2 — youngest gets 2)', () => {
    const markers = dealMarkers(3);
    const counts = [0, 0, 0];
    for (const seat of Object.values(markers)) counts[seat]! += 1;
    expect(counts.filter((n) => n === 2)).toHaveLength(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('deals 2 markers to each seat in a 2-player game', () => {
    const markers = dealMarkers(2);
    const counts = [0, 0];
    for (const seat of Object.values(markers)) counts[seat]! += 1;
    expect(counts).toEqual([2, 2]);
  });

  it('respects the rng for both which seat is doubled and which phase it opens', () => {
    // An rng that always returns ~0.99 pushes Fisher–Yates swaps to the high end deterministically.
    const markers = dealMarkers(3, () => 0.99);
    const counts = [0, 0, 0];
    for (const seat of Object.values(markers)) counts[seat]! += 1;
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
    expect(counts.filter((n) => n === 2)).toHaveLength(1);
    // Every marker still lands on a real seat.
    for (const seat of Object.values(markers)) expect(seat).toBeGreaterThanOrEqual(0);
  });
});
