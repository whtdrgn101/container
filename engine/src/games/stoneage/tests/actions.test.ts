import { describe, expect, it } from 'vitest';
import { activePlayer, seatOf } from '../internal';
import { applyAction, legalActions } from '../actions';
import { viewFor } from '../view';
import { makeState, expectError } from './helpers';

const place = { type: 'PLACE', place: 'forest', count: 1 } as const;

describe('scaffold actions', () => {
  it('offers no legal actions yet', () => {
    expect(legalActions(makeState())).toEqual([]);
    expect(legalActions(makeState(), 'p1')).toEqual([]);
  });

  it('refuses every action — not implemented at the scaffold', () => {
    expectError(() => applyAction(makeState(), 'p1', place), 'NOT_IMPLEMENTED');
  });

  it('rejects an unknown player before refusing', () => {
    expectError(() => applyAction(makeState(), 'ghost', place), 'PLAYER_NOT_FOUND');
  });

  it('rejects any action once the game has ended', () => {
    expectError(() => applyAction(makeState({ status: 'ended' }), 'p1', place), 'GAME_OVER');
  });
});

describe('helpers', () => {
  it('seatOf / activePlayer', () => {
    const state = makeState({ activePlayerIndex: 1 });
    expect(seatOf(state, 'p2')).toBe(1);
    expect(activePlayer(state).id).toBe('p2');
    expectError(() => seatOf(state, 'nobody'), 'PLAYER_NOT_FOUND');
  });

  it('viewFor passes the whole state through with a viewer note', () => {
    const state = makeState();
    expect(viewFor(state, 'p1')).toEqual({ ...state, viewerId: 'p1' });
    expect(viewFor(state, null).viewerId).toBeNull();
  });
});
