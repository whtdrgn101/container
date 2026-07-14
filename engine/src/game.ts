import type { Color } from './colors';
import { COLORS } from './colors';
import { GameError } from './errors';
import type { GameState, PlayerState } from './types';

/** Starting cash: five $1s, five $2s, one $5 (rulebook setup step 12). */
export const STARTING_MONEY = 20;

/** A Produce action always costs $1 in union wages, regardless of how many containers are produced. */
export const UNION_WAGE = 1;

/** Each built factory adds 2 to the factory-district storage limit (rulebook, pg. 5). */
export const FACTORY_STORAGE_PER_FACTORY = 2;

/** Minimum and maximum supported player counts (rulebook: 3–5 players). */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;

/** Input for a single seat when creating a game. */
export interface NewPlayer {
  readonly name: string;
  /**
   * The player's starting factory color. In the physical game these are dealt at
   * random; the engine stays deterministic, so callers inject the assignment.
   * Defaults to the Nth container color by seat order.
   */
  readonly startingColor?: Color;
}

export interface CreateGameOptions {
  readonly id: string;
  readonly players: readonly NewPlayer[];
}

/**
 * Build the initial state for a new game. Deterministic: given the same options it
 * always returns the same state (any randomness is the caller's responsibility).
 */
export function createGame(options: CreateGameOptions): GameState {
  const { id, players } = options;

  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new GameError(
      'INVALID_PLAYER_COUNT',
      `Container supports ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${players.length}`,
    );
  }

  const playerStates: PlayerState[] = players.map((player, seat) => {
    const color = player.startingColor ?? COLORS[seat % COLORS.length]!;
    const playerId = `p${seat + 1}`;
    return {
      id: playerId,
      name: player.name,
      money: STARTING_MONEY,
      factories: [{ id: `${playerId}-f1`, color }],
      // Setup step 11: start with 1 container matching your factory, in the $2 lot.
      factoryStore: [color],
      factoryLimit: FACTORY_STORAGE_PER_FACTORY,
    };
  });

  return {
    id,
    players: playerStates,
    activePlayerIndex: 0,
    version: 0,
    log: [],
  };
}

/** Locate a player's seat index, or throw PLAYER_NOT_FOUND. */
function seatOf(state: GameState, playerId: string): number {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    throw new GameError('PLAYER_NOT_FOUND', `No player with id "${playerId}"`);
  }
  return index;
}

/** Read a player's state by id, or throw PLAYER_NOT_FOUND. */
export function getPlayer(state: GameState, playerId: string): PlayerState {
  return state.players[seatOf(state, playerId)]!;
}

/** True if every element of `sub` can be matched to a distinct element of `sup` (multiset ⊆). */
function isSubMultiset(sub: readonly Color[], sup: readonly Color[]): boolean {
  const remaining = new Map<Color, number>();
  for (const color of sup) {
    remaining.set(color, (remaining.get(color) ?? 0) + 1);
  }
  for (const color of sub) {
    const available = remaining.get(color) ?? 0;
    if (available === 0) {
      return false;
    }
    remaining.set(color, available - 1);
  }
  return true;
}

/**
 * Apply a Produce action for `playerId`.
 *
 * Rules (rulebook pg. 8):
 *  1. Pay $1 union wages to the player on your right (the next seat, clockwise).
 *  2. Produce one container per built factory, up to the factory storage limit.
 *  3. When factory output would exceed the remaining room, `select` which container
 *     colors to produce — you must still produce as many as will fit.
 *
 * Returns a new state; the input state is never mutated.
 */
export function produce(state: GameState, playerId: string, select?: readonly Color[]): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (player.factories.length === 0) {
    throw new GameError('NO_FACTORIES', `Player "${playerId}" has no factories to produce with`);
  }
  if (player.money < UNION_WAGE) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot afford $${UNION_WAGE} union wages`);
  }

  const room = player.factoryLimit - player.factoryStore.length;
  if (room <= 0) {
    throw new GameError('STORAGE_LIMIT_EXCEEDED', `Player "${playerId}" has no room to store new containers`);
  }

  const factoryColors = player.factories.map((factory) => factory.color);
  const capacity = Math.min(factoryColors.length, room);

  let produced: readonly Color[];
  if (select === undefined) {
    // Default: produce from the first `capacity` factories in order.
    produced = factoryColors.slice(0, capacity);
  } else {
    if (select.length !== capacity) {
      throw new GameError(
        'INVALID_SELECTION',
        `Must produce exactly ${capacity} container(s), got ${select.length}`,
      );
    }
    if (!isSubMultiset(select, factoryColors)) {
      throw new GameError('INVALID_SELECTION', 'Selected colors do not match available factories');
    }
    produced = select;
  }

  const rightSeat = (seat + 1) % state.players.length;

  const players = state.players.map((current, index) => {
    if (index === seat) {
      return {
        ...current,
        money: current.money - UNION_WAGE,
        factoryStore: [...current.factoryStore, ...produced],
      };
    }
    if (index === rightSeat) {
      return { ...current, money: current.money + UNION_WAGE };
    }
    return current;
  });

  const version = state.version + 1;
  return {
    ...state,
    players,
    version,
    log: [
      ...state.log,
      { seq: version, type: 'PRODUCE', playerId, payload: { produced: [...produced] } },
    ],
  };
}
