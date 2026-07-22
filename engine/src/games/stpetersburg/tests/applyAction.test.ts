import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions';
import type { Action } from '../actions';
import { expectError, makeState, newGame } from './helpers';

const pass: Action = { type: 'PASS' };
const buyUpper0: Action = { type: 'BUY', row: 'upper', index: 0 };

describe('applyAction (dispatcher — SP1)', () => {
  it('dispatches BUY and PASS for the active seat', () => {
    const game = newGame(); // p1 (seat 0) opens the worker phase deterministically
    const bought = applyAction(game, 'p1', buyUpper0);
    expect(bought.players[0]!.playArea.worker).toHaveLength(1);
    expect(bought.version).toBe(1);

    const passed = applyAction(game, 'p1', pass);
    expect(passed.consecutivePasses).toBe(1);
    expect(passed.activePlayerIndex).toBe(1);
  });

  it('enforces the turn/seat pipeline before dispatching', () => {
    const game = newGame();
    expectError(() => applyAction(game, 'p2', pass), 'NOT_YOUR_TURN');
    expectError(() => applyAction(game, 'p9', pass), 'PLAYER_NOT_FOUND');
  });

  it('refuses any action on a finished game with GAME_OVER', () => {
    const ended = makeState({ status: 'ended', results: [], winnerIds: ['p1'] });
    expectError(() => applyAction(ended, 'p1', pass), 'GAME_OVER');
    expectError(() => applyAction(ended, 'p1', buyUpper0), 'GAME_OVER');
  });
});
