import { describe, expect, it } from 'vitest';
import { STARTING_RUBLES, WORKER_ROW_SEED } from '../core';
import { createGame } from '../createGame';
import { expectError, newGame } from './helpers';

describe('createGame', () => {
  it('sets up a fresh two-player game (pg. 2)', () => {
    const game = newGame();
    expect(game.round).toBe(1);
    expect(game.phase).toBe('worker');
    expect(game.status).toBe('active');
    expect(game.version).toBe(0);
    expect(game.log).toEqual([]);
    expect(game.consecutivePasses).toBe(0);
    expect(game.board.discard).toBe(0);
    expect(game.board.lower).toEqual([]);
  });

  it('gives every player 25 rubles, empty play area, empty hand', () => {
    const game = newGame(['Ann', 'Bob', 'Cy']);
    expect(game.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    for (const player of game.players) {
      expect(player.rubles).toBe(STARTING_RUBLES);
      expect(player.points).toBe(0);
      expect(player.hand).toEqual([]);
      expect(player.playArea).toEqual({ worker: [], building: [], aristocrat: [] });
    }
  });

  it('seeds the upper row with workers by player count (pg. 2 & 8: 8/6/4)', () => {
    for (const count of [2, 3, 4]) {
      const game = createGame({ id: 'g', players: Array.from({ length: count }, (_, i) => ({ name: `P${i}` })) });
      const seed = WORKER_ROW_SEED[count]!;
      expect(game.board.upper).toHaveLength(seed);
      expect(game.board.upper.every((c) => c.kind === 'worker')).toBe(true);
      // Those workers are drawn off the top of the (shuffled) worker stack.
      expect(game.board.stacks.worker).toHaveLength(31 - seed);
    }
  });

  it('shuffles each of the four stacks separately with the rng', () => {
    let seed = 0;
    const rng = () => {
      seed += 1;
      return (seed * 0.6180339887) % 1;
    };
    const shuffled = createGame({ id: 'g', players: [{ name: 'Ann' }, { name: 'Bob' }], rng });
    const ordered = newGame();
    // The building/aristocrat/trading stacks are full (never seeded) — their order differs from the
    // deterministic deck, proving the rng was applied.
    expect(shuffled.board.stacks.building.map((c) => c.id)).not.toEqual(ordered.board.stacks.building.map((c) => c.id));
    // Same multiset, though — a shuffle is a permutation, not a change of contents.
    expect(shuffled.board.stacks.building.map((c) => c.id).sort()).toEqual(
      ordered.board.stacks.building.map((c) => c.id).sort(),
    );
  });

  it('opens the worker phase with that phase’s starting player', () => {
    const game = newGame(['Ann', 'Bob', 'Cy', 'Dan']);
    expect(game.activePlayerIndex).toBe(game.startingPlayers.worker);
    expect(Object.keys(game.startingPlayers).sort()).toEqual(['aristocrat', 'building', 'trading', 'worker']);
  });

  it('rejects an out-of-range player count (pg. 1: 2–4)', () => {
    expectError(() => createGame({ id: 'g', players: [{ name: 'Solo' }] }), 'INVALID_PLAYER_COUNT');
    expectError(
      () => createGame({ id: 'g', players: Array.from({ length: 5 }, (_, i) => ({ name: `P${i}` })) }),
      'INVALID_PLAYER_COUNT',
    );
  });
});
