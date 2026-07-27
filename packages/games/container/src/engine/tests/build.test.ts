import { describe, expect, it } from 'vitest';
import { buildFactory, buildWarehouse, getPlayer, STARTING_MONEY } from '../index';
import { expectError, makeGame, makePlayer, makeSupply, newGame } from './helpers';

describe('buildFactory', () => {
  it('adds a factory, pays the cost, raises the limit, and draws from supply', () => {
    const next = buildFactory(newGame(3), 'p1', 'red');
    const p1 = getPlayer(next, 'p1');
    expect(p1.factories).toHaveLength(2);
    expect(p1.money).toBe(STARTING_MONEY - 4);
    expect(p1.factoryLimit).toBe(4);
    expect(next.supply.factories.red).toBe(0);
  });

  it('charges an escalating cost ($4 / $8 / $12) up to 4 factories', () => {
    let state = makeGame([makePlayer({ id: 'p1', money: 30 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    state = buildFactory(state, 'p1', 'red');
    state = buildFactory(state, 'p1', 'green');
    state = buildFactory(state, 'p1', 'blue');
    expect(getPlayer(state, 'p1').money).toBe(30 - 4 - 8 - 12);
    expect(getPlayer(state, 'p1').factoryLimit).toBe(2 + 2 * 3);
  });

  it('throws FACTORY_LIMIT_REACHED at 4 factories', () => {
    const p1 = makePlayer({
      id: 'p1',
      money: 100,
      factories: [
        { id: 'p1-f1', color: 'white' },
        { id: 'p1-f2', color: 'red' },
        { id: 'p1-f3', color: 'green' },
        { id: 'p1-f4', color: 'blue' },
      ],
    });
    expectError(
      () => buildFactory(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]), 'p1', 'yellow'),
      'FACTORY_LIMIT_REACHED',
    );
  });

  it('throws DUPLICATE_FACTORY_COLOR for a color you already have', () => {
    expectError(() => buildFactory(newGame(3), 'p1', 'white'), 'DUPLICATE_FACTORY_COLOR');
  });

  it('throws OUT_OF_SUPPLY when no building of that color remains', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], {
      supply: makeSupply({ factories: { white: 2, red: 0, green: 2, blue: 2, yellow: 2 } }),
    });
    expectError(() => buildFactory(state, 'p1', 'red'), 'OUT_OF_SUPPLY');
  });

  it('throws INSUFFICIENT_FUNDS when it cannot afford the factory', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 3 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => buildFactory(state, 'p1', 'red'), 'INSUFFICIENT_FUNDS');
  });
});

describe('buildWarehouse', () => {
  it('adds a warehouse, pays the cost, raises the harbor limit, and draws from supply', () => {
    const next = buildWarehouse(newGame(3), 'p1');
    const p1 = getPlayer(next, 'p1');
    expect(p1.warehouses).toBe(2);
    expect(p1.harborLimit).toBe(2);
    expect(p1.money).toBe(STARTING_MONEY - 3);
    expect(next.supply.warehouses).toBe(9 - 1);
  });

  it('charges an escalating cost ($3 / $6 / $9 / $12) up to 5 warehouses', () => {
    let state = makeGame([makePlayer({ id: 'p1', money: 30 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    for (let i = 0; i < 4; i++) {
      state = buildWarehouse(state, 'p1');
    }
    expect(getPlayer(state, 'p1').warehouses).toBe(5);
    expect(getPlayer(state, 'p1').money).toBe(30 - 3 - 6 - 9 - 12);
  });

  it('throws WAREHOUSE_LIMIT_REACHED at 5 warehouses', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', money: 100, warehouses: 5 }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    expectError(() => buildWarehouse(state, 'p1'), 'WAREHOUSE_LIMIT_REACHED');
  });

  it('throws OUT_OF_SUPPLY when no warehouse buildings remain', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], {
      supply: makeSupply({ warehouses: 0 }),
    });
    expectError(() => buildWarehouse(state, 'p1'), 'OUT_OF_SUPPLY');
  });

  it('throws INSUFFICIENT_FUNDS when it cannot afford the warehouse', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 2 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => buildWarehouse(state, 'p1'), 'INSUFFICIENT_FUNDS');
  });
});
