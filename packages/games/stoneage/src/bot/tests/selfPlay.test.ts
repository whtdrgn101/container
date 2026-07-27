import { describe, expect, it } from 'vitest';
import { playSelfPlay } from '../selfPlay';
import { newGame, seededRng } from './helpers';

/**
 * Self-play is the bot's real test: it drives thousands of live engine actions, so *any* illegal action
 * throws. If these pass, every decision the bot made — across placement, gathering (roll + take, with
 * tools), buildings, cards and feeding — was legal, and the game reached a real end.
 */
describe('Stone Age self-play', () => {
  for (const players of [2, 3, 4]) {
    it(`plays a full ${players}-player game to a real end`, () => {
      const rng = seededRng(1234 + players);
      const result = playSelfPlay(newGame(players, rng), { rng });
      expect(result.completed).toBe(true); // ended on a real trigger, not the maxRounds backstop
      expect(result.state.status).toBe('ended');
      if (result.state.status !== 'ended') throw new Error('expected ended');
      expect(result.state.results).toHaveLength(players);
      expect(result.state.winnerIds.length).toBeGreaterThanOrEqual(1);
    });
  }

  it('is deterministic given the same seed', () => {
    const a = playSelfPlay(newGame(3, seededRng(99)), { rng: seededRng(99) });
    const b = playSelfPlay(newGame(3, seededRng(99)), { rng: seededRng(99) });
    if (a.state.status !== 'ended' || b.state.status !== 'ended') throw new Error('expected ended');
    expect(a.state.winnerIds).toEqual(b.state.winnerIds);
    expect(a.actions).toBe(b.actions);
  });
});
