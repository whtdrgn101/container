import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../index';
import { getPlayer, harborPurchase, STARTING_MONEY } from '../index';
import { expectError, makeGame, makePlayer, sc } from './helpers';

const dockedAt = (playerId: string, over: Partial<PlayerState> = {}) =>
  makePlayer({ id: 'p1', ship: { location: { kind: 'harbor', playerId }, cargo: [] }, ...over });

const three = (p1: PlayerState, p2: PlayerState) => makeGame([p1, p2, makePlayer({ id: 'p3' })]);

describe('harborPurchase', () => {
  it('buys from the docked harbor onto the ship and pays the owner', () => {
    const buyer = dockedAt('p2', { money: 10 });
    const seller = makePlayer({ id: 'p2', money: 10, harborStore: [sc('red', 4), sc('blue', 2)] });
    const next = harborPurchase(three(buyer, seller), 'p1', [sc('red', 4)]);

    expect(getPlayer(next, 'p1').money).toBe(6);
    expect(getPlayer(next, 'p1').ship.cargo).toEqual(['red']);
    expect(getPlayer(next, 'p2').money).toBe(14);
    expect(getPlayer(next, 'p2').harborStore).toEqual([sc('blue', 2)]);
    expect(getPlayer(next, 'p3').money).toBe(STARTING_MONEY);
    expect(next.log.at(-1)).toEqual({
      seq: 1,
      type: 'HARBOR_PURCHASE',
      playerId: 'p1',
      payload: { sellerId: 'p2', cost: 4, count: 1 },
    });
  });

  it('rejects when the ship is not docked at a harbor', () => {
    expectError(
      () => harborPurchase(three(makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' })), 'p1', [sc('red', 2)]),
      'SHIP_NOT_DOCKED',
    );
  });

  it('rejects buying nothing', () => {
    const seller = makePlayer({ id: 'p2', harborStore: [sc('red', 4)] });
    expectError(() => harborPurchase(three(dockedAt('p2'), seller), 'p1', []), 'INVALID_SELECTION');
  });

  it('rejects buying containers not in the harbor', () => {
    const seller = makePlayer({ id: 'p2', harborStore: [sc('red', 4)] });
    expectError(() => harborPurchase(three(dockedAt('p2'), seller), 'p1', [sc('red', 2)]), 'INVALID_SELECTION');
  });

  it('rejects exceeding the ship capacity', () => {
    const buyer = dockedAt('p2', {
      ship: { location: { kind: 'harbor', playerId: 'p2' }, cargo: ['white', 'white', 'white', 'white', 'white'] },
    });
    const seller = makePlayer({ id: 'p2', harborStore: [sc('red', 2)] });
    expectError(() => harborPurchase(three(buyer, seller), 'p1', [sc('red', 2)]), 'SHIP_CAPACITY_EXCEEDED');
  });

  it('rejects when the buyer cannot afford it', () => {
    const buyer = dockedAt('p2', { money: 1 });
    const seller = makePlayer({ id: 'p2', harborStore: [sc('red', 4)] });
    expectError(() => harborPurchase(three(buyer, seller), 'p1', [sc('red', 4)]), 'INSUFFICIENT_FUNDS');
  });

  it('rejects an unknown buyer', () => {
    expectError(
      () => harborPurchase(three(makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' })), 'ghost', [sc('red', 2)]),
      'PLAYER_NOT_FOUND',
    );
  });
});
