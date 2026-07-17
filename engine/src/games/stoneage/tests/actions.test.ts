import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import { viewFor } from '../view';
import { makeState, withPlacements, expectError } from './helpers';

const placeToolMaker = { type: 'PLACE', place: 'toolMaker', count: 1 } as const;
const gatherForest = { type: 'GATHER', place: 'forest', dice: [1, 1] } as const;
const useField = { type: 'USE', place: 'field' } as const;
const feedAction = { type: 'FEED' } as const;

describe('applyAction', () => {
  it('dispatches PLACE during the placement phase', () => {
    const next = applyAction(makeState(), 'p1', placeToolMaker);
    expect(next.placements.toolMaker).toEqual({ p1: 1 });
  });

  it('dispatches GATHER and USE during the action phase', () => {
    const withForest = withPlacements({ forest: { p1: 2 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(applyAction(withForest, 'p1', gatherForest).players[0]!.resources.wood).toBeGreaterThanOrEqual(0);
    const withField = withPlacements({ field: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(applyAction(withField, 'p1', useField).players[0]!.foodTrack).toBe(1);
  });

  it('dispatches FEED during the feeding phase', () => {
    const next = applyAction(makeState({ phase: 'feeding', activePlayerIndex: 0 }), 'p1', feedAction);
    expect(next.players[0]!.food).toBe(7); // 12 food − 5 people
  });

  it('rejects an unknown player, an off-turn seat, and an ended game', () => {
    expectError(() => applyAction(makeState(), 'ghost', placeToolMaker), 'PLAYER_NOT_FOUND');
    expectError(() => applyAction(makeState(), 'p2', placeToolMaker), 'NOT_YOUR_TURN');
    expectError(() => applyAction(makeState({ status: 'ended' }), 'p1', placeToolMaker), 'GAME_OVER');
  });

  it('refuses each action outside its phase', () => {
    expectError(() => applyAction(makeState({ phase: 'actions' }), 'p1', placeToolMaker), 'WRONG_PHASE');
    expectError(() => applyAction(makeState(), 'p1', gatherForest), 'WRONG_PHASE'); // gather in placement phase
    expectError(() => applyAction(makeState(), 'p1', useField), 'WRONG_PHASE'); // use in placement phase
    expectError(() => applyAction(makeState(), 'p1', feedAction), 'WRONG_PHASE'); // feed in placement phase
  });
});

describe('legalActions', () => {
  it('lists placements in placement, USE actions in the action phase, and FEED in feeding', () => {
    expect(legalActions(makeState())).toHaveLength(28); // fresh 2-player board
    const acting = withPlacements({ toolMaker: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(legalActions(acting)).toEqual([{ type: 'USE', place: 'toolMaker' }]);
    expect(legalActions(makeState({ phase: 'feeding' }))).toEqual([{ type: 'FEED' }]);
  });

  it('is empty for an off-turn seat or an ended game', () => {
    expect(legalActions(makeState(), 'p2')).toEqual([]);
    expect(legalActions(makeState({ status: 'ended' }))).toEqual([]);
  });
});

describe('viewFor', () => {
  it('passes the whole state through with a viewer note (near-identity)', () => {
    const state = makeState();
    expect(viewFor(state, 'p1')).toEqual({ ...state, viewerId: 'p1' });
    expect(viewFor(state, null).viewerId).toBeNull();
  });
});
