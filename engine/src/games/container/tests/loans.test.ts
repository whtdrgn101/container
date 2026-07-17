import { describe, expect, it } from 'vitest';
import { applyAction, endTurn, getPlayer, repayLoan, requestLoan, STARTING_MONEY } from '../index';
import { expectError, makeGame, makePlayer } from './helpers';

const three = (p1: ReturnType<typeof makePlayer>) =>
  makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);

describe('requestLoan', () => {
  it('takes $10 and adds a loan', () => {
    const next = requestLoan(three(makePlayer({ id: 'p1' })), 'p1');
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY + 10);
    expect(getPlayer(next, 'p1').loans).toBe(1);
  });

  it('throws LOAN_LIMIT_REACHED at 2 loans', () => {
    expectError(() => requestLoan(three(makePlayer({ id: 'p1', loans: 2 })), 'p1'), 'LOAN_LIMIT_REACHED');
  });
});

describe('repayLoan', () => {
  it('returns $10 and removes a loan', () => {
    const next = repayLoan(three(makePlayer({ id: 'p1', loans: 1, money: 20 })), 'p1');
    expect(getPlayer(next, 'p1').money).toBe(10);
    expect(getPlayer(next, 'p1').loans).toBe(0);
  });

  it('throws NO_LOANS_TO_REPAY when there are no loans', () => {
    expectError(() => repayLoan(three(makePlayer({ id: 'p1' })), 'p1'), 'NO_LOANS_TO_REPAY');
  });

  it('throws INSUFFICIENT_FUNDS when it cannot afford $10', () => {
    expectError(() => repayLoan(three(makePlayer({ id: 'p1', loans: 1, money: 5 })), 'p1'), 'INSUFFICIENT_FUNDS');
  });
});

describe('loans as free actions', () => {
  it('are dispatched by applyAction without spending an action', () => {
    const state = three(makePlayer({ id: 'p1' }));
    const next = applyAction(state, 'p1', { type: 'REQUEST_LOAN' });
    expect(getPlayer(next, 'p1').loans).toBe(1);
    expect(next.actionsRemaining).toBe(2); // free
  });

  it('repay is also dispatched free by applyAction', () => {
    const state = three(makePlayer({ id: 'p1', loans: 1, money: 20 }));
    const next = applyAction(state, 'p1', { type: 'REPAY_LOAN' });
    expect(getPlayer(next, 'p1').loans).toBe(0);
    expect(next.actionsRemaining).toBe(2);
  });
});

// Interest is settled automatically when a player's turn begins (via endTurn advancing to them).
describe('start-of-turn interest', () => {
  const advanceToP2 = (p2: ReturnType<typeof makePlayer>) =>
    endTurn(makeGame([makePlayer({ id: 'p1' }), p2, makePlayer({ id: 'p3' })]), 'p1');

  it('pays $1 per loan when affordable', () => {
    const next = advanceToP2(makePlayer({ id: 'p2', loans: 2, money: 5 }));
    expect(getPlayer(next, 'p2').money).toBe(3);
    expect(getPlayer(next, 'p2').loans).toBe(2);
  });

  it('takes a forced loan when it cannot pay interest below the limit', () => {
    const next = advanceToP2(makePlayer({ id: 'p2', loans: 1, money: 0 }));
    expect(getPlayer(next, 'p2').loans).toBe(2); // forced a second loan
    expect(getPlayer(next, 'p2').money).toBe(9); // +$10 loan − $1 interest
  });

  it('leaves a debt-free player untouched', () => {
    const next = advanceToP2(makePlayer({ id: 'p2', loans: 0, money: 4 }));
    expect(getPlayer(next, 'p2').money).toBe(4);
  });

  it('defaults at the loan limit, seizing from the scoring area first', () => {
    const next = advanceToP2(makePlayer({ id: 'p2', loans: 2, money: 0, scoringArea: ['red', 'blue'] }));
    expect(getPlayer(next, 'p2').money).toBe(0);
    expect(getPlayer(next, 'p2').loans).toBe(2);
    expect(getPlayer(next, 'p2').scoringArea).toEqual([]); // both seized ($2 unpaid → 2 containers)
  });

  it('seizes from the ship when the scoring area is empty', () => {
    const next = advanceToP2(makePlayer({ id: 'p2', loans: 2, money: 1, ship: { location: { kind: 'ocean' }, cargo: ['green'] } }));
    expect(getPlayer(next, 'p2').ship.cargo).toEqual([]); // $1 paid, 1 seized from cargo
  });

  it('seizes from the harbor when scoring area and ship are empty', () => {
    const next = advanceToP2(makePlayer({ id: 'p2', loans: 2, money: 1, harborStore: [{ color: 'white', price: 3 }] }));
    expect(getPlayer(next, 'p2').harborStore).toEqual([]);
  });

  it('seizes from the factory when nothing else remains', () => {
    const next = advanceToP2(makePlayer({ id: 'p2', loans: 2, money: 1, factoryStore: [{ color: 'yellow', price: 2 }] }));
    expect(getPlayer(next, 'p2').factoryStore).toEqual([]);
  });

  it('forgives interest when there is nothing to seize', () => {
    const next = advanceToP2(makePlayer({ id: 'p2', loans: 2, money: 0 }));
    expect(getPlayer(next, 'p2').money).toBe(0);
    expect(getPlayer(next, 'p2').loans).toBe(2); // no containers → forgiven, still owes the loans
  });
});
