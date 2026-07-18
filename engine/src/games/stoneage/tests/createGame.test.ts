import { describe, expect, it } from 'vitest';
import { ALL_PLACES, BUILDING_STACK_SIZE, STARTING_FOOD, STARTING_PEOPLE } from '../core';
import { createGame } from '../createGame';
import { expectError } from './helpers';

describe('createGame', () => {
  it('sets up each player with the starting people, food and empty holdings', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'Ann' }, { name: 'Bob' }] });
    expect(state.players).toEqual([
      { id: 'p1', name: 'Ann', people: STARTING_PEOPLE, food: STARTING_FOOD, foodTrack: 0, tools: [], toolsUsed: [], resources: { wood: 0, brick: 0, stone: 0, gold: 0 }, civCards: [], buildings: 0, score: 0 },
      { id: 'p2', name: 'Bob', people: STARTING_PEOPLE, food: STARTING_FOOD, foodTrack: 0, tools: [], toolsUsed: [], resources: { wood: 0, brick: 0, stone: 0, gold: 0 }, civCards: [], buildings: 0, score: 0 },
    ]);
  });

  it('starts round 1 in the placement phase with an empty board', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    expect(state).toMatchObject({
      round: 1,
      phase: 'placement',
      startPlayerIndex: 0,
      activePlayerIndex: 0,
      status: 'active',
      winnerIds: [],
      version: 0,
      log: [],
    });
    // Every place (fixed + building slots) exists and is empty.
    expect(Object.keys(state.placements).sort()).toEqual([...ALL_PLACES].sort());
    expect(Object.values(state.placements).every((p) => Object.keys(p).length === 0)).toBe(true);
  });

  it('deals one building stack of 7 per player (setup step 9)', () => {
    const two = createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }] });
    expect(two.buildings).toHaveLength(2);
    expect(two.buildings.every((stack) => stack.length === BUILDING_STACK_SIZE)).toBe(true);

    // The rng shuffles: a seeded order differs from the deterministic deck order.
    const seeded = createGame({ id: 'g2', players: [{ name: 'A' }, { name: 'B' }], rng: () => 0.42 });
    expect(seeded.buildings[0]!.map((b) => b.id)).not.toEqual(two.buildings[0]!.map((b) => b.id));
    expect(seeded.buildings).toHaveLength(2);
  });

  it('supports 2–4 players', () => {
    const four = createGame({ id: 'g1', players: ['A', 'B', 'C', 'D'].map((name) => ({ name })) });
    expect(four.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(four.buildings).toHaveLength(4); // 4 stacks with 4 players
  });

  it('rejects fewer than two or more than four players', () => {
    expectError(() => createGame({ id: 'g1', players: [{ name: 'Solo' }] }), 'INVALID_PLAYER_COUNT');
    const five = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name }));
    expectError(() => createGame({ id: 'g1', players: five }), 'INVALID_PLAYER_COUNT');
  });
});
