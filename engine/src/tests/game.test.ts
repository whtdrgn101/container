import { describe, expect, it } from 'vitest';
import type { Color } from '../colors';
import { GameError } from '../errors';
import type { GameState, PlayerState } from '../types';
import {
  createGame,
  getPlayer,
  produce,
  STARTING_MONEY,
  UNION_WAGE,
} from '../game';

/** Build a player with sensible defaults for edge-case tests. */
function makePlayer(overrides: Partial<PlayerState> & Pick<PlayerState, 'id'>): PlayerState {
  return {
    name: overrides.name ?? overrides.id,
    money: STARTING_MONEY,
    factories: [{ id: `${overrides.id}-f1`, color: 'white' }],
    factoryStore: [],
    factoryLimit: 2,
    ...overrides,
  };
}

function makeGame(players: PlayerState[]): GameState {
  return { id: 'g1', players, activePlayerIndex: 0, version: 0, log: [] };
}

describe('createGame', () => {
  it('creates a valid 3-player game with default starting colors', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }],
    });

    expect(state.id).toBe('g1');
    expect(state.players).toHaveLength(3);
    expect(state.activePlayerIndex).toBe(0);
    expect(state.version).toBe(0);
    expect(state.log).toEqual([]);

    const [ann, bob, cid] = state.players;
    expect(ann).toMatchObject({ id: 'p1', name: 'Ann', money: STARTING_MONEY, factoryLimit: 2 });
    expect(ann?.factories).toEqual([{ id: 'p1-f1', color: 'white' }]);
    expect(ann?.factoryStore).toEqual(['white']); // starting container matches factory
    expect(bob?.factories[0]?.color).toBe('red');
    expect(cid?.factories[0]?.color).toBe('green');
  });

  it('respects an explicit starting color', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'Ann', startingColor: 'yellow' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    expect(state.players[0]?.factories[0]?.color).toBe('yellow');
    expect(state.players[0]?.factoryStore).toEqual(['yellow']);
  });

  it('assigns distinct colors for a full 5-player game', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }],
    });
    const colors = state.players.map((p) => p.factories[0]?.color);
    expect(colors).toEqual(['white', 'red', 'green', 'blue', 'yellow']);
  });

  it('rejects fewer than 3 players', () => {
    expect(() => createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }] })).toThrow(GameError);
    try {
      createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }] });
    } catch (error) {
      expect((error as GameError).code).toBe('INVALID_PLAYER_COUNT');
    }
  });

  it('rejects more than 5 players', () => {
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `P${i}` }));
    expect(() => createGame({ id: 'g1', players })).toThrowError(/3–5 players/);
  });
});

describe('getPlayer', () => {
  it('returns the player by id', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    expect(getPlayer(state, 'p2').name).toBe('B');
  });

  it('throws PLAYER_NOT_FOUND for an unknown id', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    expect(() => getPlayer(state, 'nope')).toThrow(GameError);
    try {
      getPlayer(state, 'nope');
    } catch (error) {
      expect((error as GameError).code).toBe('PLAYER_NOT_FOUND');
    }
  });
});

describe('produce', () => {
  it('produces one container per factory and pays union wages to the right neighbor', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    const next = produce(state, 'p1');

    const producer = getPlayer(next, 'p1');
    expect(producer.factoryStore).toEqual(['white', 'white']); // starting + produced
    expect(producer.money).toBe(STARTING_MONEY - UNION_WAGE);

    // Right neighbor (next seat) receives the wage; the third player is untouched.
    expect(getPlayer(next, 'p2').money).toBe(STARTING_MONEY + UNION_WAGE);
    expect(getPlayer(next, 'p3').money).toBe(STARTING_MONEY);

    expect(next.version).toBe(1);
    expect(next.log).toEqual([{ seq: 1, type: 'PRODUCE', playerId: 'p1', payload: { produced: ['white'] } }]);
  });

  it('wraps the right neighbor for the last seat', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    const next = produce(state, 'p3');
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY + UNION_WAGE); // p3's right is p1
    expect(getPlayer(next, 'p3').money).toBe(STARTING_MONEY - UNION_WAGE);
  });

  it('does not mutate the input state', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    produce(state, 'p1');
    expect(state.version).toBe(0);
    expect(getPlayer(state, 'p1').factoryStore).toEqual(['white']);
    expect(getPlayer(state, 'p1').money).toBe(STARTING_MONEY);
    expect(state.log).toEqual([]);
  });

  it('honors an explicit color selection when output exceeds room', () => {
    // 3 factories but only room for 2 → must select exactly 2 valid colors.
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

    const next = produce(state, 'p1', ['red', 'green']);
    expect(getPlayer(next, 'p1').factoryStore).toEqual(['red', 'green']);
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
    expect(() => produce(state, 'p1', ['red'])).toThrow(GameError);
    try {
      produce(state, 'p1', ['red']);
    } catch (error) {
      expect((error as GameError).code).toBe('INVALID_SELECTION');
    }
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
    // 'blue' is not a factory color; correct length but invalid multiset.
    const bad: Color[] = ['red', 'blue'];
    expect(() => produce(state, 'p1', bad)).toThrowError(/do not match/);
  });

  it('throws NO_FACTORIES when the player has no factories', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', factories: [] }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    try {
      produce(state, 'p1');
      expect.unreachable();
    } catch (error) {
      expect((error as GameError).code).toBe('NO_FACTORIES');
    }
  });

  it('throws INSUFFICIENT_FUNDS when the player cannot pay union wages', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', money: 0 }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    try {
      produce(state, 'p1');
      expect.unreachable();
    } catch (error) {
      expect((error as GameError).code).toBe('INSUFFICIENT_FUNDS');
    }
  });

  it('throws STORAGE_LIMIT_EXCEEDED when the factory district is full', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', factoryStore: ['white', 'white'], factoryLimit: 2 }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    try {
      produce(state, 'p1');
      expect.unreachable();
    } catch (error) {
      expect((error as GameError).code).toBe('STORAGE_LIMIT_EXCEEDED');
    }
  });

  it('throws PLAYER_NOT_FOUND for an unknown producer', () => {
    const state = createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
    expect(() => produce(state, 'ghost')).toThrow(GameError);
  });
});
