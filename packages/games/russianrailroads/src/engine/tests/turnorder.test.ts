import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, pass, place } from '../actions';
import { isTurnOrderSpace, passPoints, turnOrderOrdinal, TURN_ORDER_PASS_POINTS } from '../core';
import type { RussianRailroadsState } from '../core';
import type { Action } from '../actions';
import { rearrangeTurnOrder, reuseQueue } from '../internal';
import { activeId, expectError, newGame } from './helpers';

/** The active seat's legal actions. */
const applyLegal = (state: RussianRailroadsState): Action[] => legalActions(state);

/** Set a specific seat's dealt turn-order card. */
const withCard = (state: RussianRailroadsState, seat: number, card: number): RussianRailroadsState => ({
  ...state,
  players: state.players.map((p, i) => (i === seat ? { ...p, turnOrderCard: card } : p)),
});

describe('turn-order — pass scoring (pg. 16)', () => {
  it('flips the turn-order card and scores its reverse when you pass', () => {
    const base = newGame(4);
    const seat = base.activePlayerIndex;
    const state = withCard(base, seat, 3); // reverse of card 3 = 4 points
    const after = pass(state, activeId(state));
    expect(after.players[seat]!.score).toBe(4);
    expect(after.players[seat]!.passed).toBe(true);
    expect(after.log.at(-1)).toMatchObject({ type: 'PASS', payload: { passScore: 4 } });
  });

  it('scores 0 for card #1 (the first player) and increases with the card number', () => {
    expect(passPoints(1)).toBe(0);
    expect(TURN_ORDER_PASS_POINTS).toEqual({ 1: 0, 2: 2, 3: 4, 4: 6 });
    expect(passPoints(4)).toBe(6);
    expect(passPoints(99)).toBe(0); // unknown card → 0 (never happens; 1–4 only)
  });

  it('adds the pass score even on the round-closing pass', () => {
    // Two players both on card 2 (2 pts each): both pass → round closes, each carries their pass score.
    let state = newGame(2);
    state = { ...state, players: state.players.map((p) => ({ ...p, turnOrderCard: 2 })) };
    state = pass(state, activeId(state));
    state = pass(state, activeId(state)); // round closes
    expect(state.players.every((p) => p.score === 2)).toBe(true);
    expect(state.log.at(-1)).toMatchObject({ type: 'PASS', payload: { passScore: 2, closedRound: 1 } });
  });
});

describe('turn-order — claim spaces (pg. 16)', () => {
  it('records a claim under first / second place', () => {
    const base = newGame(4);
    const seat = base.activePlayerIndex; // at position 0 (first place)
    // The first player is at position 0, so it may claim *second* place but not *first* (its own pawn).
    const after = place(base, activeId(base), 'turnorder-2');
    expect(after.turnClaims).toEqual({ first: null, second: seat });
    expect(after.log.at(-1)).toMatchObject({ type: 'PLACE', payload: { claim: 'second' } });
    // Placing passes the turn (no immediate effect until the round-end rearrangement).
    expect(after.activePlayerIndex).not.toBe(seat);
  });

  it('a seat not in first place can claim first place', () => {
    const base = newGame(4);
    const secondSeat = base.turnOrder[1]!; // position 1
    const state = { ...base, activePlayerIndex: secondSeat };
    const after = place(state, state.players[secondSeat]!.id, 'turnorder-1');
    expect(after.turnClaims).toEqual({ first: secondSeat, second: null });
    expect(after.log.at(-1)).toMatchObject({ type: 'PLACE', payload: { claim: 'first' } });
  });

  it('space helpers: isTurnOrderSpace / turnOrderOrdinal', () => {
    expect(isTurnOrderSpace('turnorder-1')).toBe(true);
    expect(isTurnOrderSpace('coins')).toBe(false);
    expect(turnOrderOrdinal('turnorder-1')).toBe(0);
    expect(turnOrderOrdinal('turnorder-2')).toBe(1);
    expect(turnOrderOrdinal('coins')).toBe(-1);
  });

  it('refuses claiming the space below your own pawn (pg. 16)', () => {
    const base = newGame(4);
    const seat = base.activePlayerIndex; // position 0
    expectError(() => place(base, activeId(base), 'turnorder-1'), 'TURN_ORDER_OWN_PAWN');
  });

  it('refuses claiming both spaces (pg. 16)', () => {
    const base = newGame(4);
    const seat = base.activePlayerIndex;
    // Pretend this seat already claimed first place, then try to also claim second.
    const claimed = { ...base, turnClaims: { first: seat, second: null } };
    expectError(() => place(claimed, activeId(claimed), 'turnorder-2'), 'TURN_ORDER_ALREADY_CLAIMED');
  });

  it('legalActions offers the second-place claim to the first player but not the first-place one', () => {
    const base = newGame(4);
    const claims = new Set(
      applyLegal(base)
        .filter((a) => a.type === 'PLACE' && (a.space === 'turnorder-1' || a.space === 'turnorder-2'))
        .map((a) => (a.type === 'PLACE' ? a.space : '')),
    );
    expect(claims).toEqual(new Set(['turnorder-2'])); // own pawn is first place, so only second is offered
    // Once a claim is recorded for this seat, neither claim space is offered.
    const claimed = { ...base, turnClaims: { first: base.activePlayerIndex, second: null } };
    const after = applyLegal(claimed).filter((a) => a.type === 'PLACE' && a.space.startsWith('turnorder'));
    expect(after).toEqual([]);
  });
});

describe('turn-order — rearrangement (pg. 16–17)', () => {
  it('moves the claimants to the front, others shift back (pg. 16 example)', () => {
    // Before: [Yellow=0, Blue=1, Green=2, Red=3]. Green claims first, Red claims second.
    expect(rearrangeTurnOrder([0, 1, 2, 3], { first: 2, second: 3 })).toEqual([2, 3, 0, 1]);
  });

  it('a single first-place claim moves just that seat to the front', () => {
    expect(rearrangeTurnOrder([0, 1, 2, 3], { first: 3, second: null })).toEqual([3, 0, 1, 2]);
  });

  it('pg. 17 SPECIAL CASE: first player claims second, nobody claims first → order unchanged', () => {
    // Yellow (the current first player, seat 0) claims the second space; the first space stays empty.
    expect(rearrangeTurnOrder([0, 1, 2, 3], { first: null, second: 0 })).toEqual([0, 1, 2, 3]);
  });

  it('no claims → the order is unchanged', () => {
    expect(rearrangeTurnOrder([1, 0, 3, 2], { first: null, second: null })).toEqual([1, 0, 3, 2]);
  });

  it('reuseQueue is 2nd-place claimant first, then 1st (pg. 17)', () => {
    expect(reuseQueue({ first: 2, second: 3 })).toEqual([3, 2]);
    expect(reuseQueue({ first: null, second: 0 })).toEqual([0]);
    expect(reuseQueue({ first: null, second: null })).toEqual([]);
  });
});

describe('turn-order — round-end integration (pg. 16–17)', () => {
  /** Drive a 2-player round where the first player claims second place, both pass, and the round closes. */
  function claimAndClose(): RussianRailroadsState {
    const base = newGame(2);
    const firstSeat = base.turnOrder[0]!;
    let state = place(base, base.players[firstSeat]!.id, 'turnorder-2'); // first player claims second place
    // The other player passes, then the first player passes → round closes.
    state = pass(state, activeId(state));
    state = pass(state, activeId(state));
    return state;
  }

  it('rearranges the track and opens the reuse mini-phase with the claimant on the clock', () => {
    const state = claimAndClose();
    expect(state.round).toBe(2);
    // The pg. 17 special case: first player claimed second, nobody claimed first → order unchanged.
    expect(state.turnClaims).toEqual({ first: null, second: null }); // reset for the new round
    expect(state.pendingReuse).not.toBeNull();
    // The reuse mini-phase blocks normal placement until it resolves.
    expectError(() => applyAction(state, activeId(state), { type: 'PASS' }), 'REUSE_PENDING');
  });

  it('a reuse move resolves a 1-worker space, then opens the new round', () => {
    const state = claimAndClose();
    const seat = state.pendingReuse![0]!;
    const resolved = applyAction(state, state.players[seat]!.id, { type: 'RESOLVE_REUSE', space: 'coins' });
    // Gains are usable next round (which is now open): the coin was granted.
    expect(resolved.pendingReuse).toBeNull();
    expect(resolved.actionSpaces).toEqual({}); // reuse occupancy cleared as the round opens
    expect(resolved.activePlayerIndex).toBe(resolved.turnOrder[0]);
  });
});
