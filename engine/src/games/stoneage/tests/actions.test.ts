import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import { viewFor } from '../view';
import { makeState, expectError } from './helpers';

const placeToolMaker = { type: 'PLACE', place: 'toolMaker', count: 1 } as const;

describe('applyAction', () => {
  it('dispatches PLACE during the placement phase', () => {
    const next = applyAction(makeState(), 'p1', placeToolMaker);
    expect(next.placements.toolMaker).toEqual({ p1: 1 });
  });

  it('rejects an unknown player, an off-turn seat, and an ended game', () => {
    expectError(() => applyAction(makeState(), 'ghost', placeToolMaker), 'PLAYER_NOT_FOUND');
    expectError(() => applyAction(makeState(), 'p2', placeToolMaker), 'NOT_YOUR_TURN');
    expectError(() => applyAction(makeState({ status: 'ended' }), 'p1', placeToolMaker), 'GAME_OVER');
  });

  it('refuses placement outside the placement phase', () => {
    expectError(() => applyAction(makeState({ phase: 'actions' }), 'p1', placeToolMaker), 'WRONG_PHASE');
  });
});

describe('legalActions', () => {
  it('lists the active player’s placements during the placement phase', () => {
    expect(legalActions(makeState())).toHaveLength(28); // fresh 2-player board
    expect(legalActions(makeState(), 'p1')).toHaveLength(28);
  });

  it('is empty for an off-turn seat, an ended game, or a non-placement phase', () => {
    expect(legalActions(makeState(), 'p2')).toEqual([]);
    expect(legalActions(makeState({ status: 'ended' }))).toEqual([]);
    expect(legalActions(makeState({ phase: 'actions' }))).toEqual([]);
  });
});

describe('viewFor', () => {
  it('passes the whole state through with a viewer note (near-identity)', () => {
    const state = makeState();
    expect(viewFor(state, 'p1')).toEqual({ ...state, viewerId: 'p1' });
    expect(viewFor(state, null).viewerId).toBeNull();
  });
});
