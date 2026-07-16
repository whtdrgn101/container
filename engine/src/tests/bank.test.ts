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

const cashAuction = (over: Partial<BankAuction> = {}): BankAuction => ({
  lotKind: 'cash',
  lotIndex: 0,
  highBidderId: 'p2',
  bid: 1,
  reserved: [sc('green', 2)],
  ...over,
});

describe('callBank — container lots (bid cash)', () => {
  it('starts a new auction, reserving the bid', () => {
    const next = callBank(three(), 'p1', 0, 'container', 3);
    expect(next.bank.auctions).toEqual([containerAuction({ highBidderId: 'p1', bid: 3 })]);
    expect(next.bank.tokens).toBe(0);
    expect(getPlayer(next, 'p1').money).toBe(17);
  });

  it('outbids the current leader, refunding them', () => {
    const bank = makeBank({ tokens: 0, auctions: [containerAuction({ highBidderId: 'p2', bid: 3 })] });
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', money: 17 }), makePlayer({ id: 'p3' })], { bank });
    const next = callBank(state, 'p1', 0, 'container', 4);
    expect(next.bank.auctions[0]).toMatchObject({ highBidderId: 'p1', bid: 4 });
    expect(getPlayer(next, 'p1').money).toBe(16);
    expect(getPlayer(next, 'p2').money).toBe(20);
  });

  it('preserves other active auctions when outbidding one', () => {
    const target = containerAuction({ lotIndex: 0, highBidderId: 'p2', bid: 3 });
    const other = cashAuction({ lotIndex: 1, highBidderId: 'p3', bid: 2 });
    const bank = makeBank({ tokens: 0, containerLots: [['red'], ['green'], []], auctions: [target, other] });
    const next = callBank(three({ bank }, makePlayer({ id: 'p1', money: 20 })), 'p1', 0, 'container', 4);
    expect(next.bank.auctions).toContainEqual(other);
    expect(next.bank.auctions.find((a) => a.lotKind === 'container')).toMatchObject({ highBidderId: 'p1', bid: 4 });
  });

  it('rejects an empty or out-of-range lot', () => {
    expectError(() => callBank(three(), 'p1', 2, 'container', 3), 'INVALID_BANK_LOT');
    expectError(() => callBank(three(), 'p1', 9, 'container', 3), 'INVALID_BANK_LOT');
  });

  it('rejects starting with no token, and a second container auction (type limit)', () => {
    expectError(() => callBank(three({ bank: makeBank({ tokens: 0 }) }), 'p1', 0, 'container', 3), 'NO_AUCTION_TOKEN');
    const bank = makeBank({ tokens: 2, auctions: [containerAuction({ lotIndex: 0, bid: 2 })] });
    expectError(() => callBank(three({ bank }), 'p1', 1, 'container', 3), 'AUCTION_TYPE_LIMIT');
  });

  it('rejects too-low and unaffordable bids', () => {
    expectError(() => callBank(three(), 'p1', 0, 'container', 0), 'BID_TOO_LOW');
    expectError(() => callBank(three({ bank: makeBank({ tokens: 0, auctions: [containerAuction({ bid: 3 })] }) }), 'p1', 0, 'container', 3), 'BID_TOO_LOW');
    expectError(() => callBank(three({}, makePlayer({ id: 'p1', money: 2 })), 'p1', 0, 'container', 3), 'INSUFFICIENT_FUNDS');
  });

  it('rejects a container-lot call with no bid', () => {
    expectError(() => callBank(three(), 'p1', 0, 'container'), 'BID_TOO_LOW');
  });
});

describe('callBank — cash lots (bid containers)', () => {
  const bidder = () => makePlayer({ id: 'p1', factoryStore: [sc('white', 2), sc('red', 3)] });

  it('starts a cash-lot auction, reserving containers off the board', () => {
    const next = callBank(three({}, bidder()), 'p1', 0, 'cash', undefined, [sc('white', 2)]);
    expect(next.bank.auctions).toEqual([{ lotKind: 'cash', lotIndex: 0, highBidderId: 'p1', bid: 1, reserved: [sc('white', 2)] }]);
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('red', 3)]);
    expect(next.bank.tokens).toBe(0);
  });

  it('outbids, returning the previous leader’s reserved containers', () => {
    const bank = makeBank({ tokens: 0, auctions: [cashAuction({ highBidderId: 'p2', bid: 1, reserved: [sc('green', 2)] })] });
    const state = makeGame([bidder(), makePlayer({ id: 'p2', factoryStore: [] }), makePlayer({ id: 'p3' })], { bank });
    const next = callBank(state, 'p1', 0, 'cash', undefined, [sc('white', 2), sc('red', 3)]);
    expect(next.bank.auctions[0]).toMatchObject({ highBidderId: 'p1', bid: 2 });
    expect(getPlayer(next, 'p1').factoryStore).toEqual([]); // both removed
    expect(getPlayer(next, 'p2').factoryStore).toEqual([sc('green', 2)]); // returned
  });

  it('can take the bid containers from the harbor too', () => {
    const p1 = makePlayer({ id: 'p1', factoryStore: [], harborStore: [sc('blue', 4)] });
    const next = callBank(three({}, p1), 'p1', 0, 'cash', undefined, [sc('blue', 4)]);
    expect(getPlayer(next, 'p1').harborStore).toEqual([]);
  });

  it('rejects a cash lot with no money', () => {
    const bank = makeBank({ cashLots: [0, 2, 3] });
    expectError(() => callBank(three({ bank }, bidder()), 'p1', 0, 'cash', undefined, [sc('white', 2)]), 'INVALID_BANK_LOT');
  });

  it('rejects bidding containers you do not have', () => {
    expectError(() => callBank(three({}, bidder()), 'p1', 0, 'cash', undefined, [sc('blue', 5)]), 'INVALID_SELECTION');
  });

  it('rejects a cash-lot call with no containers', () => {
    expectError(() => callBank(three(), 'p1', 0, 'cash'), 'INVALID_SELECTION');
    expectError(() => callBank(three(), 'p1', 0, 'cash', undefined, []), 'BID_TOO_LOW'); // empty opening bid
  });

  it('rejects an outbid that is not more containers, and a second cash auction (type limit)', () => {
    const bank = makeBank({ tokens: 0, auctions: [cashAuction({ bid: 2, reserved: [sc('green', 2), sc('blue', 2)] })] });
    expectError(() => callBank(three({ bank }, bidder()), 'p1', 0, 'cash', undefined, [sc('white', 2), sc('red', 3)]), 'BID_TOO_LOW');
    const two = makeBank({ tokens: 2, auctions: [cashAuction({ lotIndex: 0, bid: 1 })] });
    expectError(() => callBank(three({ bank: two }, bidder()), 'p1', 1, 'cash', undefined, [sc('white', 2)]), 'AUCTION_TYPE_LIMIT');
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
    expect(getPlayer(next, 'p1').holdingArea).toEqual(['blue']);
  });

  it('rejects when not at the Bank or with an empty holding area', () => {
    expectError(() => loadHolding(three({}, makePlayer({ id: 'p1', holdingArea: ['red'] })), 'p1'), 'SHIP_NOT_AT_BANK');
    expectError(() => loadHolding(three({}, atBank([])), 'p1'), 'NOTHING_IN_HOLDING');
  });
});

describe('winning a Bank auction at the start of your turn', () => {
  it('container lot: containers to holding, cash bid into the cash lots', () => {
    const bank = makeBank({
      containerLots: [['red', 'blue'], [], []],
      tokens: 0,
      auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p1', bid: 4 })],
    });
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { activePlayerIndex: 2, bank });
    const next = endTurn(state, 'p3');
    expect(getPlayer(next, 'p1').holdingArea).toEqual(['red', 'blue']);
    expect(next.bank.auctions).toEqual([]);
    expect(next.bank.tokens).toBe(1);
    expect(next.bank.cashLots).toEqual([3, 3, 4]);
  });

  it('cash lot: reserved containers to the container lots, cash to hand', () => {
    const bank = makeBank({
      cashLots: [5, 2, 3],
      tokens: 0,
      auctions: [cashAuction({ lotIndex: 0, highBidderId: 'p1', bid: 2, reserved: [sc('white', 2), sc('red', 3)] })],
    });
    const state = makeGame([makePlayer({ id: 'p1', money: 10 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { activePlayerIndex: 2, bank });
    const next = endTurn(state, 'p3');
    expect(getPlayer(next, 'p1').money).toBe(15); // + $5 from cash lot I
    expect(next.bank.cashLots[0]).toBe(0);
    expect(next.bank.containerLots).toEqual([['white', 'red', 'white'], ['green', 'red'], []]);
    expect(next.bank.auctions).toEqual([]);
  });
});

describe('Bank pot routing', () => {
  const advanceToP2 = (over: Partial<ReturnType<typeof makePlayer>>, bank = makeBank()) =>
    endTurn(makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', ...over }), makePlayer({ id: 'p3' })], { bank }), 'p1');

  it('routes loan interest into the Bank cash lots', () => {
    const next = advanceToP2({ loans: 2, money: 5 });
    expect(getPlayer(next, 'p2').money).toBe(3);
    expect(next.bank.cashLots).toEqual([2, 3, 3]);
  });

  it('routes default-seized containers into the Bank container lots, skipping tokened lots', () => {
    const bank = makeBank({ tokens: 0, auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p1', bid: 1 })] });
    const next = advanceToP2({ loans: 2, money: 0, factoryStore: [sc('yellow', 2), sc('blue', 2)] }, bank);
    expect(getPlayer(next, 'p2').factoryStore).toEqual([]);
    expect(next.bank.containerLots).toEqual([['white', 'red'], ['green', 'blue'], ['yellow']]);
  });

  it('routes a delivery buyout into the Bank cash lots', () => {
    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['red', 'green'] } });
    const state = makeGame([p1, makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 })]);
    const next = deliver(state, 'p1', { bids: { p2: 4 }, buyout: true });
    expect(next.bank.cashLots).toEqual([3, 3, 4]);
  });
});

describe('bank actions via applyAction / legalActions', () => {
  const types = (state: GameState) => legalActions(state).map((a) => a.type);

  it('dispatches CALL_BANK (container + cash) and LOAD_FROM_BANK', () => {
    const container = applyAction(three(), 'p1', { type: 'CALL_BANK', lotIndex: 0, bid: 3 });
    expect(container.bank.auctions).toHaveLength(1);
    expect(container.actionsRemaining).toBe(1);

    const cashState = three({}, makePlayer({ id: 'p1', factoryStore: [sc('white', 2)] }));
    const cash = applyAction(cashState, 'p1', { type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0, containerBid: [sc('white', 2)] });
    expect(cash.bank.auctions[0]).toMatchObject({ lotKind: 'cash', bid: 1 });

    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'bank' }, cargo: [] }, holdingArea: ['red'] });
    const loaded = applyAction(three({}, p1), 'p1', { type: 'LOAD_FROM_BANK' });
    expect(getPlayer(loaded, 'p1').ship.cargo).toEqual(['red']);
    expect(loaded.actionsRemaining).toBe(2); // free
  });

  it('offers container-lot CALL_BANK to start and to outbid, not lots you lead / cannot beat', () => {
    const starts = legalActions(three())
      .filter((a) => a.type === 'CALL_BANK')
      .map((a) => (a as { lotIndex: number }).lotIndex)
      .sort();
    expect(starts).toEqual([0, 1]); // lots I & II have containers; III empty; p1 has no board containers

    const bank = makeBank({ tokens: 0, auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p2', bid: 3 })] });
    const actions = legalActions(three({ bank }));
    expect(actions).toContainEqual({ type: 'CALL_BANK', lotKind: 'container', lotIndex: 0 });
    expect(actions).not.toContainEqual({ type: 'CALL_BANK', lotKind: 'container', lotIndex: 1 });

    const led = makeBank({ tokens: 0, auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p1', bid: 3 })] });
    expect(legalActions(three({ bank: led }))).not.toContainEqual({ type: 'CALL_BANK', lotKind: 'container', lotIndex: 0 });
    const poor = makeBank({ tokens: 0, auctions: [containerAuction({ lotIndex: 0, highBidderId: 'p2', bid: 3 })] });
    expect(legalActions(three({ bank: poor }, makePlayer({ id: 'p1', money: 3 })))).not.toContainEqual({ type: 'CALL_BANK', lotKind: 'container', lotIndex: 0 });
  });

  it('offers cash-lot CALL_BANK to start and outbid, gated by board containers, empty lots, and the type limit', () => {
    const p1 = makePlayer({ id: 'p1', factoryStore: [sc('white', 2), sc('red', 3)] }); // 2 board containers
    expect(legalActions(three({}, p1))).toContainEqual({ type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0 });

    const bank = makeBank({ tokens: 0, cashLots: [3, 0, 3], auctions: [cashAuction({ lotIndex: 0, highBidderId: 'p2', bid: 1 })] });
    const actions = legalActions(three({ bank }, p1));
    expect(actions).toContainEqual({ type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0 }); // outbid (2 > 1)
    expect(actions).not.toContainEqual({ type: 'CALL_BANK', lotKind: 'cash', lotIndex: 1 }); // $0 lot
    expect(actions).not.toContainEqual({ type: 'CALL_BANK', lotKind: 'cash', lotIndex: 2 }); // no token to start
  });

  it('omits a cash-lot auction you lead or cannot outbid', () => {
    const led = makeBank({ tokens: 0, auctions: [cashAuction({ lotIndex: 0, highBidderId: 'p1', bid: 1 })] });
    const p1 = makePlayer({ id: 'p1', factoryStore: [sc('white', 2)] });
    expect(legalActions(three({ bank: led }, p1))).not.toContainEqual({ type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0 });

    const highBid = makeBank({ tokens: 0, auctions: [cashAuction({ lotIndex: 0, highBidderId: 'p2', bid: 3 })] });
    expect(legalActions(three({ bank: highBid }, p1))).not.toContainEqual({ type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0 });
  });

  it('offers LOAD_FROM_BANK when docked at the Bank with a holding area', () => {
    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'bank' }, cargo: [] }, holdingArea: ['red'] });
    expect(types(three({}, p1))).toContain('LOAD_FROM_BANK');
  });
});
