import { describe, expect, it } from 'vitest';
import { PLACES, STARTING_FOOD, STARTING_PEOPLE } from '../core';
import { createGame } from '../createGame';
import { expectError } from './helpers';

describe('createGame', () => {
  it('sets up each player with the starting people, food and empty holdings', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'Ann' }, { name: 'Bob' }] });
    expect(state.players).toEqual([
      { id: 'p1', name: 'Ann', people: STARTING_PEOPLE, food: STARTING_FOOD, foodTrack: 0, tools: [], resources: { wood: 0, brick: 0, stone: 0, gold: 0 }, civCards: [], buildings: 0, score: 0 },
      { id: 'p2', name: 'Bob', people: STARTING_PEOPLE, food: STARTING_FOOD, foodTrack: 0, tools: [], resources: { wood: 0, brick: 0, stone: 0, gold: 0 }, civCards: [], buildings: 0, score: 0 },
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
    // Every place exists and is empty.
    expect(Object.keys(state.placements).sort()).toEqual([...PLACES].sort());
    expect(Object.values(state.placements).every((p) => Object.keys(p).length === 0)).toBe(true);
  });

  it('supports 2–4 players', () => {
    const four = createGame({ id: 'g1', players: ['A', 'B', 'C', 'D'].map((name) => ({ name })) });
    expect(four.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('rejects fewer than two or more than four players', () => {
    expectError(() => createGame({ id: 'g1', players: [{ name: 'Solo' }] }), 'INVALID_PLAYER_COUNT');
    const five = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name }));
    expectError(() => createGame({ id: 'g1', players: five }), 'INVALID_PLAYER_COUNT');
  });
});
