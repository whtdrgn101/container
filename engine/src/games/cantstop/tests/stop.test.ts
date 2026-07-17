import { describe, expect, it } from 'vitest';
import { stop } from '../actions';
import { makeState, expectError } from './helpers';

describe('stop', () => {
  it('banks runners into permanent progress and passes the turn', () => {
    const state = makeState({ runners: { 3: 1, 7: 2 }, rollsThisTurn: 3 });
    const next = stop(state, 'p1');
    expect(next.players[0]!.progress).toEqual({ 3: 1, 7: 2 });
    expect(next.runners).toEqual({});
    expect(next.activePlayerIndex).toBe(1);
    expect(next.turn).toBe(2);
    expect(next.rollsThisTurn).toBe(0); // the next seat starts fresh
    expect(next.claimed).toEqual({});
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'STOP', playerId: 'p1' });
  });

  it('claims a column reached at the top and bumps an opponent off it', () => {
    // Ann's runner is atop column 2 (height 3). Bob has a square there (bumped); Cara has none.
    const state = makeState(
      {
        runners: { 2: 3 },
        players: [
          { id: 'p1', name: 'Ann', progress: {} },
          { id: 'p2', name: 'Bob', progress: { 2: 1 } },
          { id: 'p3', name: 'Cara', progress: {} },
        ],
      },
      ['Ann', 'Bob', 'Cara'],
    );
    const next = stop(state, 'p1');
    expect(next.claimed).toEqual({ 2: 'p1' });
    expect(next.players[0]!.progress).toEqual({ 2: 3 });
    expect(next.players[1]!.progress).toEqual({}); // Bob bumped off
    expect(next.players[2]!.progress).toEqual({}); // Cara unaffected
    expect(next.status).toBe('active');
  });

  it('ends the game when a third column is claimed', () => {
    const state = makeState({ runners: { 2: 3 }, claimed: { 5: 'p1', 9: 'p1' } });
    const next = stop(state, 'p1');
    expect(next.claimed).toEqual({ 5: 'p1', 9: 'p1', 2: 'p1' });
    expect(next.status).toBe('ended');
    expect(next.winnerIds).toEqual(['p1']);
    // The winning stop does not advance the seat.
    expect(next.activePlayerIndex).toBe(0);
  });

  it('rejects stopping while a pairing is still owed', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    expectError(() => stop(state, 'p1'), 'WRONG_PHASE');
  });

  it('rejects stopping before any runner has moved', () => {
    expectError(() => stop(makeState(), 'p1'), 'NOTHING_TO_STOP');
  });
});
