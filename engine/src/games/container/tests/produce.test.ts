import { describe, expect, it } from 'vitest';
import { getPlayer, produce, STARTING_MONEY, UNION_WAGE } from '../index';
import { expectError, makeGame, makePlayer, makeSupply, newGame, sc } from './helpers';

describe('produce', () => {
  it('produces into the default $2 lot and pays the right neighbor', () => {
    const next = produce(newGame(3), 'p1');
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('white', 2), sc('white', 2)]);
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY - UNION_WAGE);
    expect(getPlayer(next, 'p2').money).toBe(STARTING_MONEY + UNION_WAGE);
    expect(getPlayer(next, 'p3').money).toBe(STARTING_MONEY);
    expect(next.log.at(-1)).toEqual({
      seq: 1,
      type: 'PRODUCE',
      playerId: 'p1',
      payload: { produced: [sc('white', 2)] },
    });
  });

  it('wraps the right neighbor for the last seat', () => {
    expect(getPlayer(produce(newGame(3), 'p3'), 'p1').money).toBe(STARTING_MONEY + UNION_WAGE);
  });

  it('does not mutate the input state', () => {
    const state = newGame(3);
    produce(state, 'p1');
    expect(state.version).toBe(0);
    expect(getPlayer(state, 'p1').factoryStore).toEqual([sc('white', 2)]);
    expect(state.supply.containers.white).toBe(9); // 11 − starting − Bank seed
  });

  it('draws produced containers from the shared supply', () => {
    const next = produce(newGame(3), 'p1'); // p1 produces 1 white
    expect(next.supply.containers.white).toBe(9 - 1);
  });

  it('throws OUT_OF_SUPPLY when every factory color is exhausted', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], {
      supply: makeSupply({ containers: { white: 0, red: 10, green: 10, blue: 10, yellow: 10 } }),
    });
    expectError(() => produce(state, 'p1'), 'OUT_OF_SUPPLY'); // p1's only factory is white
  });

  // Rulebook pg. 9: "You must produce as many containers as you are able to." An exhausted color is
  // one you are not able to produce, so that factory idles and the others still run. Producing
  // exactly one-per-factory used to be mandatory, which made Produce *impossible* (not merely
  // smaller) as soon as any one of your colors ran out — and since exhausting the supply is the
  // end-game trigger, that hit every late game.
  it('skips an exhausted color and produces the rest', () => {
    const producer = makePlayer({
      id: 'p1',
      factories: [
        { id: 'p1-f1', color: 'white' },
        { id: 'p1-f2', color: 'red' },
      ],
      factoryLimit: 4,
    });
    const state = makeGame([producer, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], {
      supply: makeSupply({ containers: { white: 0, red: 10, green: 10, blue: 10, yellow: 10 } }),
    });
    const next = produce(state, 'p1');
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('red', 2)]);
    expect(next.supply.containers.red).toBe(9);
  });

  it('sizes an explicit selection to what the supply can actually fill', () => {
    const producer = makePlayer({
      id: 'p1',
      factories: [
        { id: 'p1-f1', color: 'white' },
        { id: 'p1-f2', color: 'red' },
      ],
      factoryLimit: 4,
    });
    const state = makeGame([producer, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], {
      supply: makeSupply({ containers: { white: 0, red: 10, green: 10, blue: 10, yellow: 10 } }),
    });
    // Only red is producible, so a one-container run is the full run — not an under-production.
    expect(getPlayer(produce(state, 'p1', [sc('red', 5)]), 'p1').factoryStore).toEqual([sc('red', 5)]);
    // Asking for the exhausted color still fails, rather than silently substituting.
    expectError(() => produce(state, 'p1', [sc('white', 5)]), 'OUT_OF_SUPPLY');
    // And you still cannot under-produce what the supply *can* fill.
    expectError(() => produce(state, 'p1', []), 'INVALID_SELECTION');
  });

  it('places produced containers into the chosen lots', () => {
    const producer = makePlayer({
      id: 'p1',
      factories: [
        { id: 'p1-f1', color: 'white' },
        { id: 'p1-f2', color: 'red' },
        { id: 'p1-f3', color: 'green' },
      ],
      factoryStore: [],
      factoryLimit: 2,
    });
    const state = makeGame([producer, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    const next = produce(state, 'p1', [sc('red', 3), sc('green', 5)]);
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('red', 3), sc('green', 5)]);
  });

  it('rejects placements of the wrong size', () => {
    const producer = makePlayer({
      id: 'p1',
      factories: [
        { id: 'p1-f1', color: 'white' },
        { id: 'p1-f2', color: 'red' },
        { id: 'p1-f3', color: 'green' },
      ],
      factoryLimit: 2,
    });
    const state = makeGame([producer, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => produce(state, 'p1', [sc('red', 3)]), 'INVALID_SELECTION');
  });

  it('rejects placements referencing colors it cannot produce', () => {
    const producer = makePlayer({
      id: 'p1',
      factories: [
        { id: 'p1-f1', color: 'white' },
        { id: 'p1-f2', color: 'red' },
        { id: 'p1-f3', color: 'green' },
      ],
      factoryLimit: 2,
    });
    const state = makeGame([producer, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(() => produce(state, 'p1', [sc('red', 3), sc('blue', 3)])).toThrowError(/do not match/);
  });

  it('rejects an invalid factory lot price', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => produce(state, 'p1', [sc('white', 9)]), 'INVALID_LOT_PRICE');
  });

  it('throws NO_FACTORIES when the player has no factories', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', factories: [] }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    expectError(() => produce(state, 'p1'), 'NO_FACTORIES');
  });

  it('throws INSUFFICIENT_FUNDS when it cannot pay union wages', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 0 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => produce(state, 'p1'), 'INSUFFICIENT_FUNDS');
  });

  it('throws STORAGE_LIMIT_EXCEEDED when the factory district is full', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', factoryStore: [sc('white', 2), sc('white', 3)], factoryLimit: 2 }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    expectError(() => produce(state, 'p1'), 'STORAGE_LIMIT_EXCEEDED');
  });

  it('throws PLAYER_NOT_FOUND for an unknown producer', () => {
    expectError(() => produce(newGame(), 'ghost'), 'PLAYER_NOT_FOUND');
  });
});
