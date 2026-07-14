import { describe, expect, it } from 'vitest';
import { ACTIONS_PER_TURN, applyAction, getPlayer } from '../index';
import { expectError, newGame, sc } from './helpers';

describe('applyAction', () => {
  it('dispatches PRODUCE and spends one action', () => {
    const next = applyAction(newGame(3), 'p1', { type: 'PRODUCE' });
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('white', 2), sc('white', 2)]);
    expect(next.actionsRemaining).toBe(1);
  });

  it('dispatches BUILD_FACTORY and spends one action', () => {
    const next = applyAction(newGame(3), 'p1', { type: 'BUILD_FACTORY', color: 'red' });
    expect(getPlayer(next, 'p1').factories).toHaveLength(2);
    expect(next.actionsRemaining).toBe(1);
  });

  it('dispatches BUILD_WAREHOUSE and spends one action', () => {
    const next = applyAction(newGame(3), 'p1', { type: 'BUILD_WAREHOUSE' });
    expect(getPlayer(next, 'p1').warehouses).toBe(2);
    expect(next.actionsRemaining).toBe(1);
  });

  it('dispatches REPRICE and spends one action', () => {
    const next = applyAction(newGame(3), 'p1', { type: 'REPRICE', district: 'factory', arrangement: [sc('white', 5)] });
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('white', 5)]);
    expect(next.actionsRemaining).toBe(1);
  });

  it('rejects REPRICE without an arrangement', () => {
    expectError(() => applyAction(newGame(3), 'p1', { type: 'REPRICE', district: 'factory' }), 'INVALID_SELECTION');
  });

  it('dispatches END_TURN without spending an action', () => {
    const next = applyAction(newGame(3), 'p1', { type: 'END_TURN' });
    expect(next.activePlayerIndex).toBe(1);
    expect(next.actionsRemaining).toBe(ACTIONS_PER_TURN);
  });

  it('rejects actions from a player whose turn it is not', () => {
    expectError(() => applyAction(newGame(3), 'p2', { type: 'PRODUCE' }), 'NOT_YOUR_TURN');
  });

  it('rejects an unknown player', () => {
    expectError(() => applyAction(newGame(3), 'ghost', { type: 'PRODUCE' }), 'PLAYER_NOT_FOUND');
  });

  it('rejects a third action in one turn', () => {
    let state = applyAction(newGame(3), 'p1', { type: 'BUILD_WAREHOUSE' });
    state = applyAction(state, 'p1', { type: 'BUILD_WAREHOUSE' });
    expect(state.actionsRemaining).toBe(0);
    expectError(() => applyAction(state, 'p1', { type: 'BUILD_WAREHOUSE' }), 'NO_ACTIONS_REMAINING');
  });
});
