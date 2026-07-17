import { describe, expect, it } from 'vitest';
import { ACTIONS_PER_TURN, endTurn } from '../index';
import { expectError, makeGame, makePlayer, newGame } from './helpers';

describe('endTurn', () => {
  it('advances to the next seat and refills actions', () => {
    const next = endTurn(
      makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { actionsRemaining: 0 }),
      'p1',
    );
    expect(next.activePlayerIndex).toBe(1);
    expect(next.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(next.turn).toBe(2);
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'END_TURN', playerId: 'p1' });
  });

  it('wraps from the last seat back to the first', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { activePlayerIndex: 2 });
    expect(endTurn(state, 'p3').activePlayerIndex).toBe(0);
  });

  it('throws NOT_YOUR_TURN when a non-active player ends the turn', () => {
    expectError(() => endTurn(newGame(3), 'p2'), 'NOT_YOUR_TURN');
  });
});
