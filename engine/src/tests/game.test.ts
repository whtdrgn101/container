import { describe, expect, it } from 'vitest';
import type { Color } from '../colors';
import type { GameErrorCode } from '../errors';
import { GameError } from '../errors';
import type { GameState, PlayerState, StoredContainer, Supply } from '../types';
import {
  ACTIONS_PER_TURN,
  applyAction,
  buildFactory,
  buildWarehouse,
  createGame,
  endTurn,
  getPlayer,
  legalActions,
  produce,
  reprice,
  STARTING_MONEY,
  UNION_WAGE,
} from '../game';

// --- helpers ---------------------------------------------------------------

const sc = (color: Color, price: number): StoredContainer => ({ color, price });

function makeSupply(overrides: Partial<Supply> = {}): Supply {
  return {
    factories: { white: 2, red: 2, green: 2, blue: 2, yellow: 2 },
    warehouses: 10,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<PlayerState> & Pick<PlayerState, 'id'>): PlayerState {
  return {
    name: overrides.id,
    money: STARTING_MONEY,
    factories: [{ id: `${overrides.id}-f1`, color: 'white' }],
    factoryStore: [],
    factoryLimit: 2,
    harborStore: [],
    warehouses: 1,
    harborLimit: 1,
    ...overrides,
  };
}

function makeGame(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'g1',
    players,
    activePlayerIndex: 0,
    actionsRemaining: ACTIONS_PER_TURN,
    turn: 1,
    supply: makeSupply(),
    version: 0,
    log: [],
    ...overrides,
  };
}

function expectError(fn: () => unknown, code: GameErrorCode): void {
  expect(fn).toThrow(GameError);
  try {
    fn();
  } catch (error) {
    expect((error as GameError).code).toBe(code);
  }
}

function newGame(playerCount = 3): GameState {
  return createGame({
    id: 'g1',
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` })),
  });
}

// --- createGame ------------------------------------------------------------

describe('createGame', () => {
  it('creates a valid 3-player game with priced starting container and building supply', () => {
    const state = newGame(3);

    expect(state.players).toHaveLength(3);
    expect(state.activePlayerIndex).toBe(0);
    expect(state.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(state.turn).toBe(1);

    const p1 = state.players[0];
    expect(p1).toMatchObject({ id: 'p1', money: STARTING_MONEY, factoryLimit: 2, warehouses: 1, harborLimit: 1 });
    expect(p1?.factories).toEqual([{ id: 'p1-f1', color: 'white' }]);
    expect(p1?.factoryStore).toEqual([sc('white', 2)]); // starting container in the $2 lot
    expect(p1?.harborStore).toEqual([]);

    expect(state.supply.factories).toEqual({ white: 1, red: 1, green: 1, blue: 2, yellow: 2 });
    expect(state.supply.warehouses).toBe(12 - 3);
  });

  it('respects an explicit starting color', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'Ann', startingColor: 'yellow' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    expect(state.players[0]?.factoryStore).toEqual([sc('yellow', 2)]);
  });

  it('assigns distinct colors and 5-player supply', () => {
    const state = newGame(5);
    expect(state.players.map((p) => p.factories[0]?.color)).toEqual(['white', 'red', 'green', 'blue', 'yellow']);
    expect(state.supply.factories).toEqual({ white: 3, red: 3, green: 3, blue: 3, yellow: 3 });
    expect(state.supply.warehouses).toBe(20 - 5);
  });

  it('rejects fewer than 3 players', () => {
    expectError(() => createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }] }), 'INVALID_PLAYER_COUNT');
  });

  it('rejects more than 5 players', () => {
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `P${i}` }));
    expect(() => createGame({ id: 'g1', players })).toThrowError(/3–5 players/);
  });
});

// --- getPlayer -------------------------------------------------------------

describe('getPlayer', () => {
  it('returns the player by id', () => {
    expect(getPlayer(newGame(), 'p2').id).toBe('p2');
  });

  it('throws PLAYER_NOT_FOUND for an unknown id', () => {
    expectError(() => getPlayer(newGame(), 'nope'), 'PLAYER_NOT_FOUND');
  });
});

// --- produce ---------------------------------------------------------------

describe('produce', () => {
  it('produces into the default $2 lot and pays the right neighbor', () => {
    const next = produce(newGame(3), 'p1');
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('white', 2), sc('white', 2)]);
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY - UNION_WAGE);
    expect(getPlayer(next, 'p2').money).toBe(STARTING_MONEY + UNION_WAGE);
    expect(getPlayer(next, 'p3').money).toBe(STARTING_MONEY);
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'PRODUCE', playerId: 'p1', payload: { produced: [sc('white', 2)] } });
  });

  it('wraps the right neighbor for the last seat', () => {
    expect(getPlayer(produce(newGame(3), 'p3'), 'p1').money).toBe(STARTING_MONEY + UNION_WAGE);
  });

  it('does not mutate the input state', () => {
    const state = newGame(3);
    produce(state, 'p1');
    expect(state.version).toBe(0);
    expect(getPlayer(state, 'p1').factoryStore).toEqual([sc('white', 2)]);
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
    // capacity is 1 (1 factory, empty 2-slot district); $9 is not a valid factory lot.
    expectError(() => produce(state, 'p1', [sc('white', 9)]), 'INVALID_LOT_PRICE');
  });

  it('throws NO_FACTORIES when the player has no factories', () => {
    const state = makeGame([makePlayer({ id: 'p1', factories: [] }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
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

// --- reprice ---------------------------------------------------------------

describe('reprice', () => {
  it('rearranges factory containers into new lots', () => {
    const p1 = makePlayer({ id: 'p1', factoryStore: [sc('white', 2), sc('red', 3)], factoryLimit: 4 });
    const next = reprice(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]), 'p1', 'factory', [
      sc('white', 6),
      sc('red', 1),
    ]);
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('white', 6), sc('red', 1)]);
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'REPRICE', playerId: 'p1', payload: { district: 'factory' } });
  });

  it('rearranges harbor containers using harbor lot prices', () => {
    const p1 = makePlayer({ id: 'p1', harborStore: [sc('blue', 2)], harborLimit: 3 });
    const next = reprice(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]), 'p1', 'harbor', [sc('blue', 7)]);
    expect(getPlayer(next, 'p1').harborStore).toEqual([sc('blue', 7)]);
  });

  it('rejects a lot price invalid for the district', () => {
    const p1 = makePlayer({ id: 'p1', harborStore: [sc('blue', 2)], harborLimit: 3 });
    const state = makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    // $1 is a valid factory lot but not a valid harbor lot.
    expectError(() => reprice(state, 'p1', 'harbor', [sc('blue', 1)]), 'INVALID_LOT_PRICE');
  });

  it('rejects an arrangement that changes which containers are stored', () => {
    const p1 = makePlayer({ id: 'p1', factoryStore: [sc('white', 2)], factoryLimit: 4 });
    const state = makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => reprice(state, 'p1', 'factory', [sc('red', 2)]), 'INVALID_SELECTION');
  });

  it('rejects an arrangement of a different size', () => {
    const p1 = makePlayer({ id: 'p1', factoryStore: [sc('white', 2)], factoryLimit: 4 });
    const state = makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => reprice(state, 'p1', 'factory', [sc('white', 2), sc('white', 3)]), 'INVALID_SELECTION');
  });

  it('throws PLAYER_NOT_FOUND for an unknown player', () => {
    expectError(() => reprice(newGame(), 'ghost', 'factory', []), 'PLAYER_NOT_FOUND');
  });
});

// --- buildFactory ----------------------------------------------------------

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
    expectError(() => buildFactory(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]), 'p1', 'yellow'), 'FACTORY_LIMIT_REACHED');
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

// --- buildWarehouse --------------------------------------------------------

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
    const state = makeGame([makePlayer({ id: 'p1', money: 100, warehouses: 5 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
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

// --- endTurn ---------------------------------------------------------------

describe('endTurn', () => {
  it('advances to the next seat and refills actions', () => {
    const next = endTurn(makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { actionsRemaining: 0 }), 'p1');
    expect(next.activePlayerIndex).toBe(1);
    expect(next.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(next.turn).toBe(2);
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'END_TURN', playerId: 'p1' });
  });

  it('wraps from the last seat back to the first', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { activePlayerIndex: 2 });
    expect(endTurn(state, 'p3').activePlayerIndex).toBe(0);
  });

  it('throws NOT_YOUR_TURN when a non-active player ends the turn', () => {
    expectError(() => endTurn(newGame(3), 'p2'), 'NOT_YOUR_TURN');
  });
});

// --- applyAction -----------------------------------------------------------

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

  it('rejects a third action in one turn', () => {
    let state = applyAction(newGame(3), 'p1', { type: 'BUILD_WAREHOUSE' });
    state = applyAction(state, 'p1', { type: 'BUILD_WAREHOUSE' });
    expect(state.actionsRemaining).toBe(0);
    expectError(() => applyAction(state, 'p1', { type: 'BUILD_WAREHOUSE' }), 'NO_ACTIONS_REMAINING');
  });
});

// --- legalActions ----------------------------------------------------------

describe('legalActions', () => {
  const types = (state: GameState) => legalActions(state).map((a) => a.type);

  it('offers the full menu at the start of a turn', () => {
    const actions = legalActions(newGame(3));
    expect(actions).toContainEqual({ type: 'END_TURN' });
    expect(actions).toContainEqual({ type: 'PRODUCE' });
    expect(actions).toContainEqual({ type: 'BUILD_WAREHOUSE' });
    expect(actions).toContainEqual({ type: 'REPRICE', district: 'factory' }); // starting container present
    expect(actions).not.toContainEqual({ type: 'REPRICE', district: 'harbor' }); // harbor empty
    const buildColors = actions.filter((a) => a.type === 'BUILD_FACTORY').map((a) => (a as { color: Color }).color);
    expect(buildColors.sort()).toEqual(['blue', 'green', 'red', 'yellow']);
  });

  it('offers a harbor reprice when the harbor has containers', () => {
    const p1 = makePlayer({ id: 'p1', harborStore: [sc('blue', 3)], harborLimit: 3 });
    expect(legalActions(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]))).toContainEqual({
      type: 'REPRICE',
      district: 'harbor',
    });
  });

  it('offers only END_TURN when no actions remain', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: [sc('white', 2)] }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { actionsRemaining: 0 });
    expect(types(state)).toEqual(['END_TURN']);
  });

  it('offers only END_TURN when the player is broke with an empty district', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 0 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(types(state)).toEqual(['END_TURN']);
  });

  it('omits PRODUCE when the factory district is full', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: [sc('white', 2), sc('white', 3)], factoryLimit: 2 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(types(state)).not.toContain('PRODUCE');
  });

  it('omits factory options at the factory limit but still allows produce/warehouse', () => {
    const p1 = makePlayer({
      id: 'p1',
      money: 100,
      factories: [
        { id: 'p1-f1', color: 'white' },
        { id: 'p1-f2', color: 'red' },
        { id: 'p1-f3', color: 'green' },
        { id: 'p1-f4', color: 'blue' },
      ],
      factoryLimit: 8,
    });
    const actions = types(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]));
    expect(actions).not.toContain('BUILD_FACTORY');
    expect(actions).toContain('PRODUCE');
    expect(actions).toContain('BUILD_WAREHOUSE');
  });

  it('offers no PRODUCE or BUILD_FACTORY for a factory-less player', () => {
    const state = makeGame([makePlayer({ id: 'p1', factories: [], money: 100 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    const actions = types(state);
    expect(actions).not.toContain('PRODUCE');
    expect(actions).not.toContain('BUILD_FACTORY');
    expect(actions).toContain('BUILD_WAREHOUSE');
  });

  it('omits BUILD_WAREHOUSE at the warehouse limit', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 100, warehouses: 5, harborLimit: 5 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(types(state)).not.toContain('BUILD_WAREHOUSE');
  });

  it('omits builds when supply is exhausted', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 100 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], {
      supply: { factories: { white: 0, red: 0, green: 0, blue: 0, yellow: 0 }, warehouses: 0 },
    });
    const actions = types(state);
    expect(actions).not.toContain('BUILD_FACTORY');
    expect(actions).not.toContain('BUILD_WAREHOUSE');
    expect(actions).toContain('PRODUCE');
  });
});
