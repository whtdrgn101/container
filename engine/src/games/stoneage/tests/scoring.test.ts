import { describe, expect, it } from 'vitest';
import type { StoneAgePlayer } from '../core';
import { finalScoring, scorePlayer } from '../internal';
import { makeState } from './helpers';

const p = (over: Partial<StoneAgePlayer>): StoneAgePlayer => ({
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

describe('scorePlayer (pg. 8)', () => {
  it('sums banked points, green² , each multiplier, and leftover resources', () => {
    // 3 distinct green symbols (writing/pottery/art) → 9; farmer×foodTrack, toolMaker×toolValue,
    // builder×buildings, shaman×people; +2 leftover resources; +10 banked.
    const player = p({
      civCards: ['cv01', 'cv04', 'cv07', 'cv25', 'cv28', 'cv31', 'cv34'],
      foodTrack: 2,
      tools: [2, 3], // value 5
      buildings: 1,
      people: 5,
      resources: { wood: 1, brick: 1, stone: 0, gold: 0 },
      score: 10,
    });
    expect(scorePlayer(player)).toEqual({
      base: 10,
      green: 9, // 3²
      farmers: 2, // 1 × foodTrack 2
      toolMakers: 5, // 1 × tool value 5
      builders: 1, // 1 × buildings 1
      shamen: 5, // 1 × people 5
      resources: 2, // 1 + 1
      total: 34,
    });
  });

  it('counts only *distinct* green symbols', () => {
    // Two "writing" cards → still one distinct symbol → 1² = 1.
    expect(scorePlayer(p({ civCards: ['cv01', 'cv02'] })).green).toBe(1);
  });
});

describe('finalScoring', () => {
  it('ranks players and picks the winner by total', () => {
    const state = makeState();
    const players = [p({ id: 'p1', name: 'A', score: 20 }), p({ id: 'p2', name: 'B', score: 5 })];
    const { results, winnerIds } = finalScoring({ ...state, players });
    expect(results.map((r) => [r.playerId, r.total])).toEqual([['p1', 20], ['p2', 5]]);
    expect(winnerIds).toEqual(['p1']);
  });

  it('breaks a tie by food production + tools + people, sharing if still level', () => {
    const state = makeState();
    // Equal totals; p2 has the higher tiebreak (more tools).
    const tie = [p({ id: 'p1', name: 'A', score: 10 }), p({ id: 'p2', name: 'B', score: 10, tools: [4] })];
    expect(finalScoring({ ...state, players: tie }).winnerIds).toEqual(['p2']);
    // Fully identical → shared win.
    const dead = [p({ id: 'p1', name: 'A', score: 10 }), p({ id: 'p2', name: 'B', score: 10 })];
    expect(finalScoring({ ...state, players: dead }).winnerIds).toEqual(['p1', 'p2']);
  });
});
