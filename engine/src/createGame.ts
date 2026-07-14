import {
  ACTIONS_PER_TURN,
  COLORS,
  CONTAINER_SUPPLY_STANDARD,
  DEFAULT_FACTORY_LOT,
  FACTORY_STORAGE_PER_FACTORY,
  FACTORY_SUPPLY_PER_COLOR,
  GameError,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_MONEY,
  WAREHOUSE_STORAGE_PER_WAREHOUSE,
  WAREHOUSE_SUPPLY_TOTAL,
} from './core';
import type { Color, GameState, PlayerState, Supply } from './core';

/** Input for a single seat when creating a game. */
export interface NewPlayer {
  readonly name: string;
  /**
   * The player's starting factory color. Dealt at random in the physical game; the engine stays
   * deterministic, so callers inject the assignment. Defaults to the Nth container color by seat.
   */
  readonly startingColor?: Color;
}

export interface CreateGameOptions {
  readonly id: string;
  readonly players: readonly NewPlayer[];
}

/**
 * Build the initial state for a new game. Deterministic: given the same options it always returns
 * the same state (any randomness is the caller's responsibility).
 */
export function createGame(options: CreateGameOptions): GameState {
  const { id, players } = options;
  const count = players.length;

  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new GameError(
      'INVALID_PLAYER_COUNT',
      `Container supports ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${count}`,
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
      factoryStore: [{ color, price: DEFAULT_FACTORY_LOT }],
      factoryLimit: FACTORY_STORAGE_PER_FACTORY,
      harborStore: [],
      warehouses: 1,
      harborLimit: WAREHOUSE_STORAGE_PER_WAREHOUSE,
      // Setup step 8: each ship starts in the ocean, empty.
      ship: { location: { kind: 'ocean' }, cargo: [] },
      scoringArea: [],
    };
  });

  // Supply, less what players took at setup (1 starting factory + container + 1 warehouse each).
  const perColor = FACTORY_SUPPLY_PER_COLOR[count]!;
  const perColorContainers = CONTAINER_SUPPLY_STANDARD[count]!;
  const factories = {} as Record<Color, number>;
  const containers = {} as Record<Color, number>;
  for (const color of COLORS) {
    factories[color] = perColor;
    containers[color] = perColorContainers;
  }
  for (const player of playerStates) {
    const startColor = player.factories[0]!.color;
    factories[startColor] -= 1;
    containers[startColor] -= 1; // starting container matches the starting factory color
  }
  const supply: Supply = { containers, factories, warehouses: WAREHOUSE_SUPPLY_TOTAL[count]! - count };

  return {
    id,
    players: playerStates,
    activePlayerIndex: 0,
    actionsRemaining: ACTIONS_PER_TURN,
    turn: 1,
    supply,
    version: 0,
    log: [],
  };
}
