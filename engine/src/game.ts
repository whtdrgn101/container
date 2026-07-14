import type { Action } from './actions';
import type { Color } from './colors';
import { COLORS } from './colors';
import { GameError } from './errors';
import type { GameState, PlayerState, Supply } from './types';

/** Starting cash: five $1s, five $2s, one $5 (rulebook setup step 12). */
export const STARTING_MONEY = 20;

/** A Produce action always costs $1 in union wages, regardless of how many containers are produced. */
export const UNION_WAGE = 1;

/** Each built factory adds 2 to the factory-district storage limit (rulebook, pg. 5). */
export const FACTORY_STORAGE_PER_FACTORY = 2;

/** Each built warehouse adds 1 to the harbor-district storage limit (rulebook, pg. 5). */
export const WAREHOUSE_STORAGE_PER_WAREHOUSE = 1;

/** Actions a player may take per turn (rulebook, pg. 6). */
export const ACTIONS_PER_TURN = 2;

/** Building caps per player (rulebook, pg. 5): 4 factories total, 5 warehouses total. */
export const MAX_FACTORIES = 4;
export const MAX_WAREHOUSES = 5;

/** Supported player counts (rulebook: 3–5 players). */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;

/**
 * Cost to build the next factory, indexed by how many factories you already have (the first is FREE).
 * From the rulebook player board: $4 and $12 are legible; $8 is the middle space (obscured by a
 * building on the art) and follows the +$4 progression. Verify against the physical board.
 */
export const FACTORY_BUILD_COSTS = [4, 8, 12] as const;

/**
 * Cost to build the next warehouse, indexed by how many warehouses you already have (the first is FREE).
 * TODO(verify): the warehouse track is obscured by buildings on the rulebook art; confirm these
 * against the physical board. Kept as a single named constant so correcting it is trivial.
 */
export const WAREHOUSE_BUILD_COSTS = [3, 6, 9, 12] as const;

/** Factory buildings available per color, by player count (rulebook setup table). */
const FACTORY_SUPPLY_PER_COLOR: Readonly<Record<number, number>> = { 3: 2, 4: 3, 5: 4 };

/** Warehouse buildings available total, by player count (rulebook setup table). */
const WAREHOUSE_SUPPLY_TOTAL: Readonly<Record<number, number>> = { 3: 12, 4: 16, 5: 20 };

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
      factoryStore: [color],
      factoryLimit: FACTORY_STORAGE_PER_FACTORY,
      warehouses: 1,
      harborLimit: WAREHOUSE_STORAGE_PER_WAREHOUSE,
    };
  });

  // Building supply, less what players took at setup (1 starting factory + 1 warehouse each).
  const perColor = FACTORY_SUPPLY_PER_COLOR[count]!;
  const factories = {} as Record<Color, number>;
  for (const color of COLORS) {
    factories[color] = perColor;
  }
  for (const player of playerStates) {
    factories[player.factories[0]!.color] -= 1;
  }
  const supply: Supply = { factories, warehouses: WAREHOUSE_SUPPLY_TOTAL[count]! - count };

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

/** Replace one player in the roster, returning a new player array. */
function withPlayer(state: GameState, seat: number, player: PlayerState): readonly PlayerState[] {
  return state.players.map((current, index) => (index === seat ? player : current));
}

/** Append a move and bump the version. */
function record(
  state: GameState,
  players: readonly PlayerState[],
  type: string,
  playerId: string,
  extra: Partial<GameState> = {},
  payload?: Record<string, unknown>,
): GameState {
  const version = state.version + 1;
  return {
    ...state,
    players,
    ...extra,
    version,
    log: [...state.log, payload ? { seq: version, type, playerId, payload } : { seq: version, type, playerId }],
  };
}

// ---------------------------------------------------------------------------
// Mechanics — pure state transforms. They validate their own resource rules and
// bump version/log, but are turn-agnostic (turn/action enforcement lives in applyAction).
// ---------------------------------------------------------------------------

/**
 * Produce action (rulebook pg. 8): pay $1 union wages to the player on your right (next seat),
 * then produce one container per factory up to the factory storage limit. When output would exceed
 * the remaining room, `select` which colors to produce (you must still produce as many as fit).
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
    produced = factoryColors.slice(0, capacity);
  } else {
    if (select.length !== capacity) {
      throw new GameError('INVALID_SELECTION', `Must produce exactly ${capacity} container(s), got ${select.length}`);
    }
    if (!isSubMultiset(select, factoryColors)) {
      throw new GameError('INVALID_SELECTION', 'Selected colors do not match available factories');
    }
    produced = select;
  }

  const rightSeat = (seat + 1) % state.players.length;
  const players = state.players.map((current, index) => {
    if (index === seat) {
      return { ...current, money: current.money - UNION_WAGE, factoryStore: [...current.factoryStore, ...produced] };
    }
    if (index === rightSeat) {
      return { ...current, money: current.money + UNION_WAGE };
    }
    return current;
  });

  return record(state, players, 'PRODUCE', playerId, {}, { produced: [...produced] });
}

/**
 * Build a factory (rulebook pg. 8): pay the next factory-track cost to the supply and add a factory
 * of a color you don't already have. Increases your factory storage limit by 2.
 */
export function buildFactory(state: GameState, playerId: string, color: Color): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (player.factories.length >= MAX_FACTORIES) {
    throw new GameError('FACTORY_LIMIT_REACHED', `Player "${playerId}" already has ${MAX_FACTORIES} factories`);
  }
  if (player.factories.some((factory) => factory.color === color)) {
    throw new GameError('DUPLICATE_FACTORY_COLOR', `Player "${playerId}" already has a ${color} factory`);
  }
  if (state.supply.factories[color] <= 0) {
    throw new GameError('OUT_OF_SUPPLY', `No ${color} factory buildings left in the supply`);
  }

  const cost = FACTORY_BUILD_COSTS[player.factories.length - 1]!;
  if (player.money < cost) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot afford the $${cost} factory`);
  }

  const updated: PlayerState = {
    ...player,
    money: player.money - cost,
    factories: [...player.factories, { id: `${playerId}-f${player.factories.length + 1}`, color }],
    factoryLimit: player.factoryLimit + FACTORY_STORAGE_PER_FACTORY,
  };
  const supply: Supply = {
    ...state.supply,
    factories: { ...state.supply.factories, [color]: state.supply.factories[color] - 1 },
  };

  return record(state, withPlayer(state, seat, updated), 'BUILD_FACTORY', playerId, { supply }, { color, cost });
}

/**
 * Build a warehouse (rulebook pg. 8): pay the next warehouse-track cost to the supply and add a
 * warehouse. Increases your harbor storage limit by 1.
 */
export function buildWarehouse(state: GameState, playerId: string): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (player.warehouses >= MAX_WAREHOUSES) {
    throw new GameError('WAREHOUSE_LIMIT_REACHED', `Player "${playerId}" already has ${MAX_WAREHOUSES} warehouses`);
  }
  if (state.supply.warehouses <= 0) {
    throw new GameError('OUT_OF_SUPPLY', 'No warehouse buildings left in the supply');
  }

  const cost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1]!;
  if (player.money < cost) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot afford the $${cost} warehouse`);
  }

  const updated: PlayerState = {
    ...player,
    money: player.money - cost,
    warehouses: player.warehouses + 1,
    harborLimit: player.harborLimit + WAREHOUSE_STORAGE_PER_WAREHOUSE,
  };
  const supply: Supply = { ...state.supply, warehouses: state.supply.warehouses - 1 };

  return record(state, withPlayer(state, seat, updated), 'BUILD_WAREHOUSE', playerId, { supply }, { cost });
}

/**
 * End the active player's turn: advance to the next seat and refill their actions.
 * (Start-of-turn steps like loan interest and Bank auctions arrive in later slices.)
 */
export function endTurn(state: GameState, playerId: string): GameState {
  const seat = seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }
  return record(state, state.players, 'END_TURN', playerId, {
    activePlayerIndex: (state.activePlayerIndex + 1) % state.players.length,
    actionsRemaining: ACTIONS_PER_TURN,
    turn: state.turn + 1,
  });
}

// ---------------------------------------------------------------------------
// Turn-aware entry point
// ---------------------------------------------------------------------------

/**
 * Apply an action for `playerId`, enforcing turn order and the per-turn action budget.
 * PRODUCE / BUILD_* each cost one action; END_TURN ends the turn. Throws GameError on any
 * illegal action; never mutates the input state.
 */
export function applyAction(state: GameState, playerId: string, action: Action): GameState {
  const seat = seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }

  if (action.type === 'END_TURN') {
    return endTurn(state, playerId);
  }

  if (state.actionsRemaining <= 0) {
    throw new GameError('NO_ACTIONS_REMAINING', `Player "${playerId}" has no actions left this turn`);
  }

  const apply = (): GameState => {
    switch (action.type) {
      case 'PRODUCE':
        return produce(state, playerId, action.select);
      case 'BUILD_FACTORY':
        return buildFactory(state, playerId, action.color);
      case 'BUILD_WAREHOUSE':
        return buildWarehouse(state, playerId);
    }
  };

  const next = apply();
  return { ...next, actionsRemaining: next.actionsRemaining - 1 };
}

/**
 * Enumerate the actions the active player may legally take right now. Drives the UI (enable/disable)
 * and, later, AI search. END_TURN is always available on your turn.
 */
export function legalActions(state: GameState): Action[] {
  const player = state.players[state.activePlayerIndex]!;
  const actions: Action[] = [{ type: 'END_TURN' }];

  if (state.actionsRemaining <= 0) {
    return actions;
  }

  if (
    player.factories.length > 0 &&
    player.money >= UNION_WAGE &&
    player.factoryStore.length < player.factoryLimit
  ) {
    actions.push({ type: 'PRODUCE' });
  }

  if (player.factories.length < MAX_FACTORIES) {
    const cost = FACTORY_BUILD_COSTS[player.factories.length - 1]!;
    if (player.money >= cost) {
      const owned = new Set(player.factories.map((factory) => factory.color));
      for (const color of COLORS) {
        if (!owned.has(color) && state.supply.factories[color] > 0) {
          actions.push({ type: 'BUILD_FACTORY', color });
        }
      }
    }
  }

  if (player.warehouses < MAX_WAREHOUSES) {
    const cost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1]!;
    if (player.money >= cost && state.supply.warehouses > 0) {
      actions.push({ type: 'BUILD_WAREHOUSE' });
    }
  }

  return actions;
}
