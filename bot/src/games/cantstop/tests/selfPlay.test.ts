import { describe, expect, it } from 'vitest';
import { playSelfPlay } from '../selfPlay';
import { newGame, seededRng } from './helpers';

/**
 * The real test of the policy: drive whole games with every seat botted. Every action goes through the
 * engine's `applyAction`, so an illegal or unparameterized decision throws rather than passing quietly.
 * Deterministic given the seed (the dice come from the injected PRNG).
 */
describe('playSelfPlay', () => {
  for (const count of [2, 3, 4]) {
    it(`plays a ${count}-player game to a winner with three claimed columns`, () => {
      const names = ['Ann', 'Bob', 'Cara', 'Dan'].slice(0, count);
      const result = playSelfPlay(newGame(names), { rng: seededRng(count * 7 + 1) });

      expect(result.completed).toBe(true);
      expect(result.state.status).toBe('ended');
      expect(result.state.winnerIds).toHaveLength(1);

      const winner = result.state.winnerIds[0]!;
      const claims = Object.values(result.state.claimed).filter((id) => id === winner).length;
      expect(claims).toBeGreaterThanOrEqual(3);
    });
  }

  it('is deterministic for a given seed', () => {
    const once = playSelfPlay(newGame(), { rng: seededRng(99) });
    const twice = playSelfPlay(newGame(), { rng: seededRng(99) });
    expect(once.state.winnerIds).toEqual(twice.state.winnerIds);
    expect(once.actions).toBe(twice.actions);
  });
});
