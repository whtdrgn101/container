import { describe, expect, it } from 'vitest';
import { endBonusScore, engineerMajority, finalScoring, scoreEndBonusCard } from '../internal';
import type { EndBonusCard, Engineer, RussianRailroadsPlayer, TrackColor } from '../core';
import { newGame } from './helpers';

/** A base player (fresh setup), patched per test. */
const BASE: RussianRailroadsPlayer = newGame(2).players[0]!;
function mk(over: Partial<RussianRailroadsPlayer>): RussianRailroadsPlayer {
  return { ...BASE, ...over };
}

/** A hired engineer with a printed number (only its number matters for majority). */
function eng(id: string, number: number): Engineer {
  return { id, number, stack: 'A', action: { kind: 'coins', count: 1 } };
}

/** A route whose track tiles are placed at the given 1-based spaces (index = space − 1). */
function route(id: RussianRailroadsPlayer['routes'][number]['id'], tiles: Record<number, TrackColor>, length = 9) {
  const spaces = Array.from({ length }, (_, i) => tiles[i + 1] ?? null);
  return { id, spaces };
}

const card = (id: string, rule: EndBonusCard['rule']): EndBonusCard => ({ id, rule });

describe('end-bonus card scoring (pg. 47)', () => {
  const s = (c: EndBonusCard, p: RussianRailroadsPlayer, startingWorkers = 6) =>
    scoreEndBonusCard(c, p, startingWorkers);

  it('per-factory: 4 points per filled gap', () => {
    const p = mk({ industry: { wrench: 0, factories: [2, 3, null, 5, null], secondWrench: null } });
    expect(s(card('f', { kind: 'per-factory', points: 4 }), p)).toBe(12); // 3 factories × 4
  });

  it('per-engineer: 6 per hired engineer, and the extra-engineer card counts', () => {
    const rule = { kind: 'per-engineer', points: 6 } as const;
    expect(s(card('e', rule), mk({ hiredEngineers: [eng('a', 5), eng('b', 8)] }))).toBe(12); // 2 × 6
    // With the "extra engineer" end-bonus card also held, it counts as a third.
    const withExtra = mk({
      hiredEngineers: [eng('a', 5), eng('b', 8)],
      endBonusCards: [card('x', { kind: 'extra-engineer' })],
    });
    expect(s(card('e', rule), withExtra)).toBe(18); // 3 × 6
  });

  it('per-end-station: 10 per route whose last space you reached', () => {
    const p = mk({
      routes: [route('transsiberian', { 15: 'gold' }, 15), route('stpetersburg', { 9: 'silver' }), route('kyiv', {})],
    });
    expect(s(card('k', { kind: 'per-end-station', points: 10 }), p)).toBe(20); // 2 routes reached the end
  });

  it('per-track: 1 per space moved with each named colour, summed over routes', () => {
    // green at Trans-Sib space 3 (3 moved) + Kyiv space 2 (2); bronze at St. Pete space 4 (4).
    const p = mk({
      routes: [
        route('transsiberian', { 3: 'green' }, 15),
        route('stpetersburg', { 4: 'bronze' }),
        route('kyiv', { 2: 'green' }),
      ],
    });
    expect(s(card('gb', { kind: 'per-track', colors: ['green', 'bronze'], points: 1 }), p)).toBe(9); // 3+2 + 4
    expect(s(card('w', { kind: 'per-track', colors: ['wood'], points: 1 }), p)).toBe(0); // no wood tiles here
  });

  it('keys: tiered by keys received (2–3/15, 4–5/25, 6+/40)', () => {
    const rule = {
      kind: 'keys',
      tiers: [
        { min: 2, points: 15 },
        { min: 4, points: 25 },
        { min: 6, points: 40 },
      ],
    } as const;
    expect(s(card('k', rule), mk({ keysReceived: 1 }))).toBe(0); // below the first tier
    expect(s(card('k', rule), mk({ keysReceived: 3 }))).toBe(15);
    expect(s(card('k', rule), mk({ keysReceived: 5 }))).toBe(25);
    expect(s(card('k', rule), mk({ keysReceived: 8 }))).toBe(40);
  });

  it('doublers: tiered by doubler tiles (4–6/20, 7+/30)', () => {
    const rule = {
      kind: 'doublers',
      tiers: [
        { min: 4, points: 20 },
        { min: 7, points: 30 },
      ],
    } as const;
    expect(s(card('d', rule), mk({ doublers: 3 }))).toBe(0);
    expect(s(card('d', rule), mk({ doublers: 5 }))).toBe(20);
    expect(s(card('d', rule), mk({ doublers: 8 }))).toBe(30);
  });

  it('per-idea-token: 7 per idea token placed', () => {
    const p = mk({ usedIdeaTokens: ['keys', 'twenty-points'] });
    expect(s(card('i', { kind: 'per-idea-token', points: 7 }), p)).toBe(14);
  });

  it('extra-engineer: no direct points', () => {
    expect(s(card('x', { kind: 'extra-engineer' }), mk({}))).toBe(0);
  });

  it('top-locomotives: sum of the count highest-numbered locos', () => {
    const p = mk({
      locomotives: [
        { number: 9, route: 'transsiberian' },
        { number: 7, route: 'transsiberian' },
        { number: 4, route: 'stpetersburg' },
        { number: 2, route: 'kyiv' },
        { number: 3, route: 'kyiv' },
      ],
    });
    expect(s(card('l', { kind: 'top-locomotives', count: 4 }), p)).toBe(9 + 7 + 4 + 3); // 23
  });

  it('per-extra-worker: 10 per extra worker over the starting count, capped at the max', () => {
    const rule = { kind: 'per-extra-worker', points: 10, max: 3 } as const;
    expect(s(card('w', rule), mk({ workersTotal: 6 }), 6)).toBe(0); // no extra
    expect(s(card('w', rule), mk({ workersTotal: 8 }), 6)).toBe(20); // 2 extra
    expect(s(card('w', rule), mk({ workersTotal: 10 }), 6)).toBe(30); // 4 extra, capped at 3
  });

  it('endBonusScore sums all a player’s held cards', () => {
    const p = mk({
      keysReceived: 3,
      usedIdeaTokens: ['keys'],
      endBonusCards: [
        card('k', { kind: 'keys', tiers: [{ min: 2, points: 15 }] }),
        card('i', { kind: 'per-idea-token', points: 7 }),
      ],
    });
    expect(endBonusScore(p, 6)).toBe(15 + 7);
  });
});

describe('engineer majority (pg. 22)', () => {
  it('the pg. 22 example: 3 engineers → 40; two tied on 2, the #13 holder → 20; the rest 0', () => {
    const you = mk({ id: 'you', hiredEngineers: [eng('a', 3), eng('b', 5), eng('c', 8)] });
    const blue = mk({ id: 'blue', hiredEngineers: [eng('d', 4), eng('e', 6)] });
    const red = mk({ id: 'red', hiredEngineers: [eng('f', 7), eng('g', 13)] }); // holds #13
    const yellow = mk({ id: 'yellow', hiredEngineers: [] });
    const m = engineerMajority([you, blue, red, yellow]);
    expect(m.get('you')).toBe(40);
    expect(m.get('red')).toBe(20); // beat blue on the highest number (13 > 6)
    expect(m.get('blue')).toBeUndefined();
    expect(m.get('yellow')).toBeUndefined();
  });

  it('players with no engineers cannot score, and a lone holder takes 40 only', () => {
    const solo = mk({ id: 'solo', hiredEngineers: [eng('a', 2)] });
    const none = mk({ id: 'none', hiredEngineers: [] });
    const m = engineerMajority([solo, none]);
    expect(m.get('solo')).toBe(40);
    expect(m.size).toBe(1); // no 20 awarded — nobody else has an engineer
  });

  it('a first-place tie is broken by the highest engineer number (winner 40, loser 20)', () => {
    const a = mk({ id: 'a', hiredEngineers: [eng('a1', 3), eng('a2', 10), eng('a3', 5)] });
    const b = mk({ id: 'b', hiredEngineers: [eng('b1', 4), eng('b2', 9), eng('b3', 2)] });
    const m = engineerMajority([a, b]);
    expect(m.get('a')).toBe(40); // 10 > 9
    expect(m.get('b')).toBe(20);
  });

  it('the extra-engineer end-bonus card raises a player’s engineer count for majority', () => {
    const boosted = mk({
      id: 'boost',
      hiredEngineers: [eng('a', 6)],
      endBonusCards: [card('x', { kind: 'extra-engineer' })],
    });
    const plain = mk({ id: 'plain', hiredEngineers: [eng('b', 9)] });
    const m = engineerMajority([boosted, plain]); // 2 (1 + card) vs 1
    expect(m.get('boost')).toBe(40);
    expect(m.get('plain')).toBe(20);
  });
});

describe('finalScoring (pg. 22)', () => {
  it('assembles each player’s base + end-bonus + majority breakdown and total', () => {
    const p1 = mk({
      id: 'p1',
      score: 30,
      hiredEngineers: [eng('a', 8), eng('b', 3)],
      keysReceived: 5,
      endBonusCards: [
        card('k', {
          kind: 'keys',
          tiers: [
            { min: 2, points: 15 },
            { min: 4, points: 25 },
          ],
        }),
      ],
    });
    const p2 = mk({ id: 'p2', score: 40, hiredEngineers: [eng('c', 4)] });
    const p3 = mk({ id: 'p3', score: 12, hiredEngineers: [] }); // no engineers → no majority award
    const results = finalScoring([p1, p2, p3]);
    // p1: base 30 + endBonus 25 (5 keys) + majority 40 (most engineers) = 95.
    expect(results[0]).toEqual({ playerId: 'p1', base: 30, endBonus: 25, majority: 40, total: 95 });
    // p2: base 40 + 0 + majority 20 (second-most) = 60.
    expect(results[1]).toEqual({ playerId: 'p2', base: 40, endBonus: 0, majority: 20, total: 60 });
    // p3: base 12 + 0 + 0 (no engineers) = 12.
    expect(results[2]).toEqual({ playerId: 'p3', base: 12, endBonus: 0, majority: 0, total: 12 });
    // total is always base + endBonus + majority.
    for (const r of results) expect(r.total).toBe(r.base + r.endBonus + r.majority);
  });
});
