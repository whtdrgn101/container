import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions';
import { activeId, expectError, newGame } from './helpers';

describe('applyAction', () => {
  it('dispatches PLACE and PASS', () => {
    const state = newGame(4);
    const placed = applyAction(state, activeId(state), { type: 'PLACE', space: 'coins' });
    expect(placed.actionSpaces['coins']).toBeDefined();
    const passed = applyAction(state, activeId(state), { type: 'PASS' });
    expect(passed.players[state.activePlayerIndex]!.passed).toBe(true);
  });

  it('rejects a move from a seat that is not on the clock', () => {
    const state = newGame(4);
    const notActive = state.players.find((_, i) => i !== state.activePlayerIndex)!.id;
    expectError(() => applyAction(state, notActive, { type: 'PASS' }), 'NOT_YOUR_TURN');
  });

  it('rejects an unknown player id', () => {
    const state = newGame(4);
    expectError(() => applyAction(state, 'nobody', { type: 'PASS' }), 'PLAYER_NOT_FOUND');
  });

  it('refuses any move once the game has ended', () => {
    let state = newGame(2);
    for (let r = 0; r < state.rounds; r += 1) {
      for (let i = 0; i < state.players.length; i += 1) state = applyAction(state, activeId(state), { type: 'PASS' });
    }
    expect(state.status).toBe('ended');
    expectError(() => applyAction(state, 'p1', { type: 'PASS' }), 'GAME_OVER');
  });
});
