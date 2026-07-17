import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions';
import { makeState, expectError } from './helpers';

describe('applyAction', () => {
  it('dispatches ROLL', () => {
    const next = applyAction(makeState(), 'p1', { type: 'ROLL', dice: [1, 2, 3, 4] });
    expect(next.phase).toBe('selecting');
  });

  it('dispatches SELECT', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    expect(applyAction(state, 'p1', { type: 'SELECT', columns: [3, 7] }).runners).toEqual({ 3: 1, 7: 1 });
  });

  it('dispatches STOP', () => {
    const state = makeState({ runners: { 3: 1 } });
    expect(applyAction(state, 'p1', { type: 'STOP' }).players[0]!.progress).toEqual({ 3: 1 });
  });

  it('rejects any action once the game has ended', () => {
    const state = makeState({ status: 'ended', winnerIds: ['p1'] });
    expectError(() => applyAction(state, 'p1', { type: 'ROLL', dice: [1, 2, 3, 4] }), 'GAME_OVER');
  });

  it('rejects a move from a seat that is not on the clock', () => {
    expectError(() => applyAction(makeState(), 'p2', { type: 'ROLL', dice: [1, 2, 3, 4] }), 'NOT_YOUR_TURN');
  });

  it('rejects an unknown player', () => {
    expectError(() => applyAction(makeState(), 'nobody', { type: 'STOP' }), 'PLAYER_NOT_FOUND');
  });
});
