import { describe, expect, it } from 'vitest';
import { factoryPurchase, getPlayer, STARTING_MONEY } from '../index';
import { expectError, makeGame, makePlayer, sc } from './helpers';

const three = (p1: ReturnType<typeof makePlayer>, p2: ReturnType<typeof makePlayer>) =>
  makeGame([p1, p2, makePlayer({ id: 'p3' })]);

describe('factoryPurchase', () => {
  it('buys opponent factory containers into the harbor and pays the seller', () => {
    const buyer = makePlayer({ id: 'p1', money: 10, harborStore: [], harborLimit: 3 });
    const seller = makePlayer({ id: 'p2', money: 10, factoryStore: [sc('red', 3), sc('green', 2)] });
    const next = factoryPurchase(three(buyer, seller), 'p1', 'p2', [sc('red', 3)]);

    // Buyer pays $3 and receives the red container in its harbor at the default $2 lot.
    expect(getPlayer(next, 'p1').money).toBe(7);
    expect(getPlayer(next, 'p1').harborStore).toEqual([sc('red', 2)]);
    // Seller earns $3 and loses the red container.
    expect(getPlayer(next, 'p2').money).toBe(13);
    expect(getPlayer(next, 'p2').factoryStore).toEqual([sc('green', 2)]);
    // Third player untouched.
    expect(getPlayer(next, 'p3').money).toBe(STARTING_MONEY);
    expect(next.log.at(-1)).toEqual({
      seq: 1,
      type: 'FACTORY_PURCHASE',
      playerId: 'p1',
      payload: { sellerId: 'p2', cost: 3, count: 1 },
    });
  });

  it('buys multiple containers from one opponent in a single action', () => {
    const buyer = makePlayer({ id: 'p1', money: 20, harborLimit: 5 });
    const seller = makePlayer({ id: 'p2', factoryStore: [sc('red', 3), sc('green', 2), sc('blue', 4)] });
    const next = factoryPurchase(three(buyer, seller), 'p1', 'p2', [sc('red', 3), sc('blue', 4)]);

    expect(getPlayer(next, 'p1').money).toBe(20 - 7); // paid $3 + $4
    expect(getPlayer(next, 'p1').harborStore).toEqual([sc('red', 2), sc('blue', 2)]); // both at the default $2 lot
    expect(getPlayer(next, 'p2').factoryStore).toEqual([sc('green', 2)]); // only green left
  });

  it('rejects buying from yourself', () => {
    expectError(() => factoryPurchase(three(makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' })), 'p1', 'p1', [sc('white', 2)]), 'NOT_AN_OPPONENT');
  });

  it('rejects an unknown buyer', () => {
    expectError(() => factoryPurchase(three(makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' })), 'ghost', 'p2', [sc('white', 2)]), 'PLAYER_NOT_FOUND');
  });

  it('rejects an unknown seller', () => {
    expectError(() => factoryPurchase(three(makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' })), 'p1', 'ghost', [sc('white', 2)]), 'PLAYER_NOT_FOUND');
  });

  it('rejects buying nothing', () => {
    const seller = makePlayer({ id: 'p2', factoryStore: [sc('red', 3)] });
    expectError(() => factoryPurchase(three(makePlayer({ id: 'p1' }), seller), 'p1', 'p2', []), 'INVALID_SELECTION');
  });

  it('rejects buying containers the seller does not have', () => {
    const seller = makePlayer({ id: 'p2', factoryStore: [sc('red', 3)] });
    expectError(() => factoryPurchase(three(makePlayer({ id: 'p1' }), seller), 'p1', 'p2', [sc('red', 5)]), 'INVALID_SELECTION');
  });

  it('rejects exceeding the harbor storage limit', () => {
    const buyer = makePlayer({ id: 'p1', harborStore: [sc('blue', 2)], harborLimit: 1 });
    const seller = makePlayer({ id: 'p2', factoryStore: [sc('red', 1)] });
    expectError(() => factoryPurchase(three(buyer, seller), 'p1', 'p2', [sc('red', 1)]), 'STORAGE_LIMIT_EXCEEDED');
  });

  it('rejects when the buyer cannot afford it', () => {
    const buyer = makePlayer({ id: 'p1', money: 2, harborLimit: 3 });
    const seller = makePlayer({ id: 'p2', factoryStore: [sc('red', 5)] });
    expectError(() => factoryPurchase(three(buyer, seller), 'p1', 'p2', [sc('red', 5)]), 'INSUFFICIENT_FUNDS');
  });
});
