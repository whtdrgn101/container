import { describe, expect, it } from 'vitest';
import { createGame } from '../createGame';
import { expectError } from './helpers';

describe('createGame', () => {
  it('deals a fresh 2-player game with empty boards', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'Ann' }, { name: 'Bob' }] });
    expect(state.players).toEqual([
      { id: 'p1', name: 'Ann', progress: {} },
      { id: 'p2', name: 'Bob', progress: {} },
    ]);
    expect(state).toMatchObject({
      activePlayerIndex: 0,
      turn: 1,
      claimed: {},
      runners: {},
      phase: 'rolling',
      rollsThisTurn: 0,
      dice: null,
      status: 'active',
      version: 0,
      log: [],
    });
    // The active arm of the end-state union carries no `winnerIds` (REVIEW.md §3.1).
    expect('winnerIds' in state).toBe(false);
  });

  it('supports up to four players', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    });
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('rejects fewer than two players', () => {
    expectError(() => createGame({ id: 'g1', players: [{ name: 'Solo' }] }), 'INVALID_PLAYER_COUNT');
  });

  it('rejects more than four players', () => {
    const players = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name }));
    expectError(() => createGame({ id: 'g1', players }), 'INVALID_PLAYER_COUNT');
  });
});
