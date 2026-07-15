import { describe, expect, it } from 'vitest';
import type { BankAuction, GameState } from '../index';
import { applyAction, callBank, deliver, endTurn, getPlayer, legalActions, loadHolding } from '../index';
import { expectError, makeBank, makeGame, makePlayer, sc } from './helpers';

const three = (over: Partial<GameState> = {}, p1 = makePlayer({ id: 'p1' })) =>
  makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], over);

const containerAuction = (over: Partial<BankAuction> = {}): BankAuction => ({
  lotKind: 'container',
  lotIndex: 0,
  highBidderId: 'p2',
  bid: 3,
  reserved: [],
  ...over,
});

describe('callBank', () => {
  it('starts a new container-lot auction, reserving the bid', () => {
    const next = callBank(three(), 'p1', 0, 3);
    expect(next.bank.auctions).toEqual([containerAuction({ highBidderId: 'p1', bid: 3 })]);
    expect(next.bank.tokens).toBe(0);
    expect(getPlayer(next, 'p1').money).toBe(17); // $3 reserved
  });

  it('outbids the current leader, refunding them', () => {
    const bank = makeBank({ tokens: 0, auctions: [containerAuction({ highBidderId: 'p2', bid: 3 })] });
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', money: 17 }), makePlayer({ id: 'p3' })], { bank });
    const next = callBank(state, 'p1', 0, 4);
    expect(next.bank.auctions[0]).toMatchObject({ highBidderId: 'p1', bid: 4 });
    expect(getPlayer(next, 'p1').money).toBe(16); // −$4
    expect(getPlayer(next, 'p2').money).toBe(20); // refunded $3
  });

  it('preserves other active auctions when outbidding one', () => {
    const target = containerAuction({ lotIndex: 0, highBidderId: 'p2', bid: 3 });
    const other = containerAuction({ lotIndex: 1, highBidderId: 'p3', bid: 2 });
    const bank = makeBank({ tokens: 0, containerLots: [['red'], ['green'], []], auctions: [target, other] });
    const next = callBank(three({ bank }, makePlayer({ id: 'p1', money: 20 })), 'p1', 0, 4);
    expect(next.bank.auctions).toContainEqual(other); // the lot-II auction is untouched
    expect(next.bank.auctions.find((a) => a.lotIndex === 0)).toMatchObject({ highBidderId: 'p1', bid: 4 });
  });

  it('rejects an empty or out-of-range lot', () => {
    expectError(() => callBank(three(), 'p1', 2, 3), 'INVALID_BANK_LOT'); // lot III empty
    expectError(() => callBank(three(), 'p1', 9, 3), 'INVALID_BANK_LOT');
  });

  it('rejects starting with no auction token', () => {
    expectError(() => callBank(three({ bank: makeBank({ tokens: 0 }) }), 'p1', 0, 3), 'NO_AUCTION_TOKEN');
  });

  it('rejects an opening bid below $1', () => {
    expectError(() => callBank(three(), 'p1', 0, 0), 'BID_TOO_LOW');
  });

  it('rejects an outbid that is not higher', () => {
    const bank = makeBank({ tokens: 0, auctions: [containerAuction({ bid: 3 })] });
    expectError(() => callBank(three({ bank }), 'p1', 0, 3), 'BID_TOO_LOW');
  });

  it('rejects a bid the player cannot afford', () => {
    expectError(() => callBank(three({}, makePlayer({ id: 'p1', money: 2 })), 'p1', 0, 3), 'INSUFFICIENT_FUNDS');
  });
});

describe('loadHolding', () => {
  const atBank = (holding: string[], cargo: string[] = []) =>
    makePlayer({ id: 'p1', ship: { location: { kind: 'bank' }, cargo: cargo as never }, holdingArea: holding as never });

  it('loads holding onto the ship at the Bank', () => {
    const next = loadHolding(three({}, atBank(['red', 'blue'])), 'p1');
    expect(getPlayer(next, 'p1').ship.cargo).toEqual(['red', 'blue']);
    expect(getPlayer(next, 'p1').holdingArea).toEqual([]);
  });

  it('loads only up to ship capacity', () => {
    const next = loadHolding(three({}, atBank(['red', 'blue'], ['white', 'white', 'white', 'white'])), 'p1');
    expect(getPlayer(next, 'p1').ship.cargo).toHaveLength(5);
    expect(getPlayer(next, 'p1').holdingArea).toEqual(['blue']); // 1 fit, 1 stays
  });

  it('rejects when the ship is not at the Bank', () => {
    expectError(() => loadHolding(three({}, makePlayer({ id: 'p1', holdingArea: ['red'] })), 'p1'), 'SHIP_NOT_AT_BANK');
  });

  it('rejects when the holding area is empty', () => {
    expectError(() => loadHolding(three({}, atBank([])), 'p1'), 'NOTHING_IN_HOLDING');
  });
});

describe('winning a Bank auction at the start of your turn', () => {
  it('collects the containers into holding and pays the bid into the cash lots', () => {
    const bank = makeBank({
      containerLots: [['red', 'blue'], [], []],
      tokens: 0,
      auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p1', bid: 4 })],
    });
    // p3 ends their turn → play passes to p1, who is leading the auction and wins it.
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], {
      activePlayerIndex: 2,
      bank,
    });
    const next = endTurn(state, 'p3');
    expect(next.activePlayerIndex).toBe(0);
    expect(getPlayer(next, 'p1').holdingArea).toEqual(['red', 'blue']);
    expect(next.bank.auctions).toEqual([]);
    expect(next.bank.tokens).toBe(1); // token returned
    expect(next.bank.containerLots[0]).toEqual([]);
    expect(next.bank.cashLots).toEqual([3, 3, 4]); // [1,2,3] + $4 distributed I,II,III,I
  });
});

describe('Bank pot routing', () => {
  const advanceToP2 = (over: Partial<ReturnType<typeof makePlayer>>, bank = makeBank()) =>
    endTurn(makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', ...over }), makePlayer({ id: 'p3' })], { bank }), 'p1');

  it('routes loan interest into the Bank cash lots', () => {
    const next = advanceToP2({ loans: 2, money: 5 });
    expect(getPlayer(next, 'p2').money).toBe(3);
    expect(next.bank.cashLots).toEqual([2, 3, 3]); // [1,2,3] + $2
  });

  it('routes default-seized containers into the Bank container lots, skipping tokened lots', () => {
    const bank = makeBank({ tokens: 0, auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p1', bid: 1 })] });
    const next = advanceToP2({ loans: 2, money: 0, factoryStore: [sc('yellow', 2), sc('blue', 2)] }, bank);
    // $2 unpaid → seize 2 (blue then yellow); lot I is tokened, so they go to lots II and III.
    expect(getPlayer(next, 'p2').factoryStore).toEqual([]);
    expect(next.bank.containerLots).toEqual([['white', 'red'], ['green', 'blue'], ['yellow']]);
  });

  it('routes a delivery buyout into the Bank cash lots', () => {
    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['red', 'green'] } });
    const state = makeGame([p1, makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 })]);
    const next = deliver(state, 'p1', { p2: 4 }, {}, true);
    expect(next.bank.cashLots).toEqual([3, 3, 4]); // [1,2,3] + $4
  });
});

describe('bank actions via applyAction / legalActions', () => {
  const types = (state: GameState) => legalActions(state).map((a) => a.type);

  it('dispatches CALL_BANK, spending one action', () => {
    const next = applyAction(three(), 'p1', { type: 'CALL_BANK', lotIndex: 0, bid: 3 });
    expect(next.bank.auctions).toHaveLength(1);
    expect(next.actionsRemaining).toBe(1);
  });

  it('rejects CALL_BANK without a bid', () => {
    expectError(() => applyAction(three(), 'p1', { type: 'CALL_BANK', lotIndex: 0 }), 'BID_TOO_LOW');
  });

  it('dispatches LOAD_FROM_BANK as a free action', () => {
    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'bank' }, cargo: [] }, holdingArea: ['red'] });
    const next = applyAction(three({}, p1), 'p1', { type: 'LOAD_FROM_BANK' });
    expect(getPlayer(next, 'p1').ship.cargo).toEqual(['red']);
    expect(next.actionsRemaining).toBe(2); // free
  });

  it('offers CALL_BANK for non-empty lots you can start on', () => {
    const calls = legalActions(three())
      .filter((a) => a.type === 'CALL_BANK')
      .map((a) => (a as { lotIndex: number }).lotIndex)
      .sort();
    expect(calls).toEqual([0, 1]); // lots I & II have containers; III is empty
  });

  it('offers CALL_BANK to outbid an auction you do not lead', () => {
    const bank = makeBank({ tokens: 0, auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p2', bid: 3 })] });
    const actions = legalActions(three({ bank }));
    expect(actions).toContainEqual({ type: 'CALL_BANK', lotIndex: 0 });
    expect(actions).not.toContainEqual({ type: 'CALL_BANK', lotIndex: 1 }); // no token to start
  });

  it('omits CALL_BANK when you already lead it or cannot outbid', () => {
    const led = makeBank({ tokens: 0, auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p1', bid: 3 })] });
    expect(legalActions(three({ bank: led }))).not.toContainEqual({ type: 'CALL_BANK', lotIndex: 0 });

    const tooPoor = makeBank({ tokens: 0, auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p2', bid: 3 })] });
    expect(legalActions(three({ bank: tooPoor }, makePlayer({ id: 'p1', money: 3 })))).not.toContainEqual({
      type: 'CALL_BANK',
      lotIndex: 0,
    });
  });

  it('offers LOAD_FROM_BANK when docked at the Bank with a holding area', () => {
    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'bank' }, cargo: [] }, holdingArea: ['red'] });
    expect(types(three({}, p1))).toContain('LOAD_FROM_BANK');
  });
});
