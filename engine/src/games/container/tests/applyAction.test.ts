import { describe, expect, it } from 'vitest';
import { ACTIONS_PER_TURN, applyAction, getPlayer, LOAN_AMOUNT, MAX_LOANS, STARTING_MONEY } from '../index';
import { expectError, makeGame, makePlayer, newGame, sc } from './helpers';

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

  it('dispatches FACTORY_PURCHASE and spends one action', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', harborLimit: 3 }),
      makePlayer({ id: 'p2', factoryStore: [sc('red', 3)] }),
      makePlayer({ id: 'p3' }),
    ]);
    const next = applyAction(state, 'p1', { type: 'FACTORY_PURCHASE', sellerId: 'p2', bought: [sc('red', 3)] });
    expect(getPlayer(next, 'p1').harborStore).toEqual([sc('red', 2)]);
    expect(next.actionsRemaining).toBe(1);
  });

  it('rejects FACTORY_PURCHASE without the containers to buy', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => applyAction(state, 'p1', { type: 'FACTORY_PURCHASE', sellerId: 'p2' }), 'INVALID_SELECTION');
  });

  it('dispatches HARBOR_PURCHASE and spends one action', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'harbor', playerId: 'p2' }, cargo: [] } }),
      makePlayer({ id: 'p2', harborStore: [sc('red', 4)] }),
      makePlayer({ id: 'p3' }),
    ]);
    const next = applyAction(state, 'p1', { type: 'HARBOR_PURCHASE', bought: [sc('red', 4)] });
    expect(getPlayer(next, 'p1').ship.cargo).toEqual(['red']);
    expect(next.actionsRemaining).toBe(1);
  });

  it('rejects HARBOR_PURCHASE without the containers to buy', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'harbor', playerId: 'p2' }, cargo: [] } }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    expectError(() => applyAction(state, 'p1', { type: 'HARBOR_PURCHASE' }), 'INVALID_SELECTION');
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

  // Rulebook pg. 16: "you can request a loan ... at any time during the game. Unlike other free
  // actions, you can do this during other players' turns (even during delivery auctions)."
  describe('REQUEST_LOAN escapes turn order (pg. 16)', () => {
    it('lets an off-turn player take a loan', () => {
      const next = applyAction(newGame(3), 'p2', { type: 'REQUEST_LOAN' });
      expect(getPlayer(next, 'p2').loans).toBe(1);
      expect(getPlayer(next, 'p2').money).toBe(STARTING_MONEY + LOAN_AMOUNT);
      // Someone else's turn is undisturbed — no seat change, no action spent.
      expect(next.activePlayerIndex).toBe(0);
      expect(next.actionsRemaining).toBe(ACTIONS_PER_TURN);
    });

    it('lets a broke opponent borrow mid-delivery-auction so they can bid', () => {
      // The rulebook's own worked example: "Red starts a delivery auction. Blue takes a loan before
      // bidding." MUST_DELIVER pins the *deliverer*, but must not freeze the bidders.
      const state = makeGame([
        makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['red'] } }),
        makePlayer({ id: 'p2', money: 0 }),
        makePlayer({ id: 'p3' }),
      ]);
      const next = applyAction(state, 'p2', { type: 'REQUEST_LOAN' });
      expect(getPlayer(next, 'p2').money).toBe(LOAN_AMOUNT);
      // The delivery is still pending — borrowing did not resolve or skip it.
      expect(getPlayer(next, 'p1').ship.cargo).toEqual(['red']);
    });

    it('still enforces the loan cap off-turn', () => {
      const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', loans: MAX_LOANS }), makePlayer({ id: 'p3' })]);
      expectError(() => applyAction(state, 'p2', { type: 'REQUEST_LOAN' }), 'LOAN_LIMIT_REACHED');
    });

    it('still rejects an unknown player', () => {
      expectError(() => applyAction(newGame(3), 'ghost', { type: 'REQUEST_LOAN' }), 'PLAYER_NOT_FOUND');
    });

    it('does NOT extend the exception to repaying', () => {
      // "Unlike other free actions" — only requesting is off-turn. Repaying waits for your turn.
      const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', loans: 1, money: 20 }), makePlayer({ id: 'p3' })]);
      expectError(() => applyAction(state, 'p2', { type: 'REPAY_LOAN' }), 'NOT_YOUR_TURN');
    });

    it('does NOT extend the exception to loading at the Bank', () => {
      const state = makeGame([
        makePlayer({ id: 'p1' }),
        makePlayer({ id: 'p2', holdingArea: ['red'], ship: { location: { kind: 'bank' }, cargo: [] } }),
        makePlayer({ id: 'p3' }),
      ]);
      expectError(() => applyAction(state, 'p2', { type: 'LOAD_FROM_BANK' }), 'NOT_YOUR_TURN');
    });
  });

  it('dispatches DELIVER (free) and ends the turn', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['red'] } }),
      makePlayer({ id: 'p2', money: 5 }),
      makePlayer({ id: 'p3' }),
    ]);
    const next = applyAction(state, 'p1', { type: 'DELIVER', bids: { p2: 2 } });
    expect(getPlayer(next, 'p2').scoringArea).toEqual(['red']);
    expect(next.activePlayerIndex).toBe(1);
  });

  it('rejects DELIVER without bids', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['red'] } }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    expectError(() => applyAction(state, 'p1', { type: 'DELIVER' }), 'INVALID_SELECTION');
  });

  it('forces the deliverer to resolve the auction before anything else', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['red'] } }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    expectError(() => applyAction(state, 'p1', { type: 'END_TURN' }), 'MUST_DELIVER');
  });

  it('rejects a third action in one turn', () => {
    let state = applyAction(newGame(3), 'p1', { type: 'BUILD_WAREHOUSE' });
    state = applyAction(state, 'p1', { type: 'BUILD_WAREHOUSE' });
    expect(state.actionsRemaining).toBe(0);
    expectError(() => applyAction(state, 'p1', { type: 'BUILD_WAREHOUSE' }), 'NO_ACTIONS_REMAINING');
  });
});
