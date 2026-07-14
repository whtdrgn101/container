import { describe, expect, it } from 'vitest';
import type { Color } from '../colors';
import type { GameErrorCode } from '../errors';
import { GameError } from '../errors';
import type { GameState, PlayerState, Supply } from '../types';
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
  STARTING_MONEY,
  UNION_WAGE,
} from '../game';

// --- helpers ---------------------------------------------------------------

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
  it('creates a valid 3-player game with the turn spine and building supply', () => {
    const state = newGame(3);

    expect(state.players).toHaveLength(3);
    expect(state.activePlayerIndex).toBe(0);
    expect(state.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(state.turn).toBe(1);
    expect(state.version).toBe(0);
    expect(state.log).toEqual([]);

    const p1 = state.players[0];
    expect(p1).toMatchObject({ id: 'p1', money: STARTING_MONEY, factoryLimit: 2, warehouses: 1, harborLimit: 1 });
    expect(p1?.factories).toEqual([{ id: 'p1-f1', color: 'white' }]);
    expect(p1?.factoryStore).toEqual(['white']);

    // 3-player supply is 2 factories/color and 12 warehouses, minus starting pieces.
    // Seats start white/red/green, so those colors lose one; blue/yellow keep both.
    expect(state.supply.factories).toEqual({ white: 1, red: 1, green: 1, blue: 2, yellow: 2 });
    expect(state.supply.warehouses).toBe(12 - 3);
  });

  it('respects an explicit starting color', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'Ann', startingColor: 'yellow' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    expect(state.players[0]?.factories[0]?.color).toBe('yellow');
    expect(state.players[0]?.factoryStore).toEqual(['yellow']);
  });

  it('assigns distinct colors and 5-player supply', () => {
    const state = newGame(5);
    expect(state.players.map((p) => p.factories[0]?.color)).toEqual(['white', 'red', 'green', 'blue', 'yellow']);
    // 4 factories/color, one of each taken as a starting factory.
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

// --- produce (mechanic) ----------------------------------------------------

describe('produce', () => {
  it('produces one container per factory and pays the right neighbor', () => {
    const next = produce(newGame(3), 'p1');
    expect(getPlayer(next, 'p1').factoryStore).toEqual(['white', 'white']);
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY - UNION_WAGE);
    expect(getPlayer(next, 'p2').money).toBe(STARTING_MONEY + UNION_WAGE);
    expect(getPlayer(next, 'p3').money).toBe(STARTING_MONEY);
    expect(next.version).toBe(1);
    expect(next.log).toEqual([{ seq: 1, type: 'PRODUCE', playerId: 'p1', payload: { produced: ['white'] } }]);
  });

  it('wraps the right neighbor for the last seat', () => {
    const next = produce(newGame(3), 'p3');
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY + UNION_WAGE);
  });

  it('does not mutate the input state', () => {
    const state = newGame(3);
    produce(state, 'p1');
    expect(state.version).toBe(0);
    expect(getPlayer(state, 'p1').factoryStore).toEqual(['white']);
  });

  it('honors an explicit selection when output exceeds room', () => {
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
    expect(getPlayer(produce(state, 'p1', ['red', 'green']), 'p1').factoryStore).toEqual(['red', 'green']);
  });

  it('rejects a selection of the wrong size', () => {
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
    expectError(() => produce(state, 'p1', ['red']), 'INVALID_SELECTION');
  });

  it('rejects a selection referencing colors it cannot produce', () => {
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
    const bad: Color[] = ['red', 'blue'];
    expect(() => produce(state, 'p1', bad)).toThrowError(/do not match/);
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
      makePlayer({ id: 'p1', factoryStore: ['white', 'white'], factoryLimit: 2 }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    expectError(() => produce(state, 'p1'), 'STORAGE_LIMIT_EXCEEDED');
  });

  it('throws PLAYER_NOT_FOUND for an unknown producer', () => {
    expectError(() => produce(newGame(), 'ghost'), 'PLAYER_NOT_FOUND');
  });
});

// --- buildFactory ----------------------------------------------------------

describe('buildFactory', () => {
  it('adds a factory, pays the cost, raises the limit, and draws from supply', () => {
    const next = buildFactory(newGame(3), 'p1', 'red');
    const p1 = getPlayer(next, 'p1');
    expect(p1.factories).toEqual([
      { id: 'p1-f1', color: 'white' },
      { id: 'p1-f2', color: 'red' },
    ]);
    expect(p1.money).toBe(STARTING_MONEY - 4); // 2nd factory costs $4
    expect(p1.factoryLimit).toBe(4);
    expect(next.supply.factories.red).toBe(0); // 3p red supply was 1, now 0
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'BUILD_FACTORY', playerId: 'p1', payload: { color: 'red', cost: 4 } });
  });

  it('charges an escalating cost ($4 / $8 / $12) up to 4 factories', () => {
    let state = makeGame([makePlayer({ id: 'p1', money: 30 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    state = buildFactory(state, 'p1', 'red');
    state = buildFactory(state, 'p1', 'green');
    state = buildFactory(state, 'p1', 'blue');
    const p1 = getPlayer(state, 'p1');
    expect(p1.factories).toHaveLength(4);
    expect(p1.money).toBe(30 - 4 - 8 - 12);
    expect(p1.factoryLimit).toBe(2 + 2 * 3);
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
    const state = makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => buildFactory(state, 'p1', 'yellow'), 'FACTORY_LIMIT_REACHED');
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
    expect(p1.money).toBe(STARTING_MONEY - 3); // 2nd warehouse costs $3
    expect(next.supply.warehouses).toBe(9 - 1); // 3p started at 12-3=9
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'BUILD_WAREHOUSE', playerId: 'p1', payload: { cost: 3 } });
  });

  it('charges an escalating cost ($3 / $6 / $9 / $12) up to 5 warehouses', () => {
    let state = makeGame([makePlayer({ id: 'p1', money: 30 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    for (let i = 0; i < 4; i++) {
      state = buildWarehouse(state, 'p1');
    }
    const p1 = getPlayer(state, 'p1');
    expect(p1.warehouses).toBe(5);
    expect(p1.harborLimit).toBe(5);
    expect(p1.money).toBe(30 - 3 - 6 - 9 - 12);
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
    expect(getPlayer(next, 'p1').factoryStore).toEqual(['white', 'white']);
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
    // A build-factory option for every color except the one already owned (white).
    const buildColors = actions.filter((a) => a.type === 'BUILD_FACTORY').map((a) => (a as { color: Color }).color);
    expect(buildColors.sort()).toEqual(['blue', 'green', 'red', 'yellow']);
  });

  it('offers only END_TURN when no actions remain', () => {
    expect(types(makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { actionsRemaining: 0 }))).toEqual(['END_TURN']);
  });

  it('offers only END_TURN when the player is broke', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 0 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(types(state)).toEqual(['END_TURN']);
  });

  it('omits PRODUCE when the factory district is full', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: ['white', 'white'], factoryLimit: 2 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
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
