import {
  ACTIONS_PER_TURN,
  BANK_AUCTION_TOKENS,
  BANK_CASH_LOT_SETUP,
  COLORS,
  CONTAINER_SUPPLY_STANDARD,
  DEFAULT_FACTORY_LOT,
  FACTORY_STORAGE_PER_FACTORY,
  FACTORY_SUPPLY_PER_COLOR,
  GameError,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SCORING_CARDS,
  STARTING_MONEY,
  WAREHOUSE_STORAGE_PER_WAREHOUSE,
  WAREHOUSE_SUPPLY_TOTAL,
} from './core';
import type { BankState, Color, GameState, PlayerState, ScoringCard, Supply } from './core';

/** Input for a single seat when creating a game. */
export interface NewPlayer {
  readonly name: string;
  /**
   * The player's starting factory color. Dealt at random in the physical game; the engine stays
   * deterministic, so callers inject the assignment. Defaults to the Nth container color by seat.
   */
  readonly startingColor?: Color;
  /**
   * The id of this player's secret scoring card. Dealt at random in the physical game; injected by
   * the caller for determinism. Defaults to the Nth card by seat.
   */
  readonly scoringCardId?: string;
}

/** Look up a scoring card by id, or throw. */
function scoringCardFor(seat: number, id?: string): ScoringCard {
  if (id === undefined) {
    return SCORING_CARDS[seat % SCORING_CARDS.length]!;
  }
  const card = SCORING_CARDS.find((candidate) => candidate.id === id);
  if (!card) {
    throw new GameError('INVALID_SELECTION', `No scoring card with id "${id}"`);
  }
  return card;
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
      // Setup step 13: deal each player a secret scoring card.
      scoringCard: scoringCardFor(seat, player.scoringCardId),
      loans: 0,
      holdingArea: [],
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

  // Setup step 5: seed 3 Bank containers (2 in lot I, 1 in lot II), taken from the container supply.
  // TODO(verify): the physical setup picks these 3 colors at random; we seed deterministically.
  const bankContainerLots: Color[][] = [['white', 'red'], ['green'], []];
  for (const lot of bankContainerLots) {
    for (const color of lot) {
      containers[color] -= 1;
    }
  }
  const supply: Supply = { containers, factories, warehouses: WAREHOUSE_SUPPLY_TOTAL[count]! - count };
  const bank: BankState = {
    cashLots: [...BANK_CASH_LOT_SETUP],
    containerLots: bankContainerLots,
    tokens: BANK_AUCTION_TOKENS[count]!,
    auctions: [],
  };

  return {
    id,
    players: playerStates,
    activePlayerIndex: 0,
    actionsRemaining: ACTIONS_PER_TURN,
    turn: 1,
    supply,
    bank,
    status: 'active',
    results: [],
    winnerIds: [],
    version: 0,
    log: [],
  };
}
