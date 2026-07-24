import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import { viewFor } from '../view';
import { makeState, withPlacements, expectError } from './helpers';

const placeToolMaker = { type: 'PLACE', place: 'toolMaker', count: 1 } as const;
const gatherForest = { type: 'GATHER', place: 'forest', dice: [1, 1] } as const;
const useField = { type: 'USE', place: 'field' } as const;
const feedAction = { type: 'FEED' } as const;
const buildAction = { type: 'BUILD', stack: 0, resources: {} } as const;
const acquireAction = { type: 'ACQUIRE_CARD', slot: 0, resources: {} } as const;

describe('applyAction', () => {
  it('dispatches PLACE during the placement phase', () => {
    const next = applyAction(makeState(), 'p1', placeToolMaker);
    expect(next.placements.toolMaker).toEqual({ p1: 1 });
  });

  it('dispatches GATHER (roll → pending), TAKE_GATHER, and USE during the action phase', () => {
    const withForest = withPlacements({ forest: { p1: 2 } }, { phase: 'actions', activePlayerIndex: 0 });
    const rolled = applyAction(withForest, 'p1', gatherForest);
    expect(rolled.pendingGather).toEqual({ place: 'forest', dice: [1, 1] });
    const taken = applyAction(rolled, 'p1', { type: 'TAKE_GATHER', toolIndices: [] });
    expect(taken.pendingGather).toBeNull();
    const withField = withPlacements({ field: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(applyAction(withField, 'p1', useField).players[0]!.foodTrack).toBe(1);
    // BUILD: decline (empty payment) returns the person from the building slot.
    const withBuilding = withPlacements({ building1: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(applyAction(withBuilding, 'p1', buildAction).placements.building1).toEqual({});
    // ACQUIRE_CARD: decline returns the person from the card slot.
    const withCard = withPlacements({ card1: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(applyAction(withCard, 'p1', acquireAction).placements.card1).toEqual({});
  });

  it('locks the turn to TAKE_GATHER while a roll is pending', () => {
    const rolled = applyAction(
      withPlacements({ forest: { p1: 2 } }, { phase: 'actions', activePlayerIndex: 0 }),
      'p1',
      gatherForest,
    );
    expectError(() => applyAction(rolled, 'p1', useField), 'GATHER_PENDING');
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
    expectError(() => applyAction(makeState(), 'p1', buildAction), 'WRONG_PHASE'); // build in placement phase
    expectError(() => applyAction(makeState(), 'p1', acquireAction), 'WRONG_PHASE'); // acquire in placement phase
  });
});

describe('legalActions', () => {
  it('lists placements in placement, USE actions in the action phase, and FEED in feeding', () => {
    expect(legalActions(makeState())).toHaveLength(34); // fresh board: 28 + 2 building stacks + 4 card slots
    const acting = withPlacements({ toolMaker: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(legalActions(acting)).toEqual([{ type: 'USE', place: 'toolMaker' }]);
    // A person on a building slot surfaces a BUILD marker (its payment is the caller's choice).
    const onBuilding = withPlacements({ building2: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(legalActions(onBuilding)).toEqual([{ type: 'BUILD', stack: 1, resources: {} }]);
    // A person on a card slot surfaces an ACQUIRE_CARD marker.
    const onCard = withPlacements({ card3: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expect(legalActions(onCard)).toEqual([{ type: 'ACQUIRE_CARD', slot: 2, resources: {} }]);
    expect(legalActions(makeState({ phase: 'feeding' }))).toEqual([{ type: 'FEED' }]);
  });

  it('offers only TAKE_GATHER while a roll is pending', () => {
    const rolled = withPlacements(
      { forest: { p1: 2 } },
      { phase: 'actions', activePlayerIndex: 0, pendingGather: { place: 'forest', dice: [1, 1] } },
    );
    expect(legalActions(rolled)).toEqual([{ type: 'TAKE_GATHER', toolIndices: [] }]);
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
