import { expect } from 'vitest';
import {
  ACTIONS_PER_TURN,
  createGame,
  GameError,
  STARTING_MONEY,
} from '../index';
import type { Color, GameErrorCode, GameState, PlayerState, StoredContainer, Supply } from '../index';

/** Shorthand for a stored container ({ color, price }). */
export const sc = (color: Color, price: number): StoredContainer => ({ color, price });

export function makeSupply(overrides: Partial<Supply> = {}): Supply {
  return {
    containers: { white: 10, red: 10, green: 10, blue: 10, yellow: 10 },
    factories: { white: 2, red: 2, green: 2, blue: 2, yellow: 2 },
    warehouses: 10,
    ...overrides,
  };
}

export function makePlayer(overrides: Partial<PlayerState> & Pick<PlayerState, 'id'>): PlayerState {
  return {
    name: overrides.id,
    money: STARTING_MONEY,
    factories: [{ id: `${overrides.id}-f1`, color: 'white' }],
    factoryStore: [],
    factoryLimit: 2,
    harborStore: [],
    warehouses: 1,
    harborLimit: 1,
    ship: { location: { kind: 'ocean' }, cargo: [] },
    ...overrides,
  };
}

export function makeGame(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
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

/** Assert that `fn` throws a GameError with the given code. */
export function expectError(fn: () => unknown, code: GameErrorCode): void {
  expect(fn).toThrow(GameError);
  try {
    fn();
  } catch (error) {
    expect((error as GameError).code).toBe(code);
  }
}

/** A fresh N-player game via createGame. */
export function newGame(playerCount = 3): GameState {
  return createGame({
    id: 'g1',
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` })),
  });
}
