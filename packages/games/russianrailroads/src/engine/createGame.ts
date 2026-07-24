import {
  GameError,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUNDS,
  ROUTES,
  STARTING_COINS,
  STARTING_LOCOMOTIVE,
  STARTING_WORKERS,
} from './core';
import type { Route, RussianRailroadsPlayer, RussianRailroadsState, TrackColor } from './core';
import { dealEndBonusPile, dealEngineerStrip, dealTurnOrderCards, turnOrderFromCards } from './internal';

/** Input for a single seat when creating a game. */
export interface NewPlayer {
  readonly name: string;
}

export interface CreateGameOptions {
  readonly id: string;
  readonly players: readonly NewPlayer[];
  /**
   * Randomness for every setup shuffle — the turn-order deal, the engineer A/B stacks, and the end-bonus
   * pile (pg. 5) — injected so the engine stays pure and the 100% gate is reachable (omit for a fixed
   * deal; the backend passes `ctx.rng`).
   */
  readonly rng?: () => number;
}

/** Sequential deterministic fallback rng (setup without a seed): 0, then a fixed low-entropy walk. */
function defaultRng(): () => number {
  let n = 0;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
}

/** The three routes at setup (pg. 6): each space empty except space 1, which holds a wood track. */
function startingRoutes(): Route[] {
  const wood: TrackColor = 'wood';
  return ROUTES.map((def) => ({
    id: def.id,
    spaces: Array.from({ length: def.length }, (_, i) => (i === 0 ? wood : null)),
  }));
}

/**
 * Build the initial Russian Railroads setup (rulebook pp. 4–6).
 *
 * Deals the turn-order cards, the engineer strip (A/B stacks, 7 slots at 4 players / 6 at 2–3), and the
 * end-bonus pile (2 removed unseen); gives each player a wood track on space 1 of each route, their #1
 * locomotive, the industry track at its start, 5 (or 6) workers and 1 (or 2) coins, and no end-bonus card
 * yet (pg. 6). Randomness is injected via `rng` so the engine stays pure.
 */
export function createGame(options: CreateGameOptions): RussianRailroadsState {
  const { id, players, rng = defaultRng() } = options;
  const count = players.length;
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new GameError(
      'INVALID_PLAYER_COUNT',
      `Russian Railroads supports ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${count}`,
    );
  }

  const turnOrderCards = dealTurnOrderCards(count, rng);
  const workers = STARTING_WORKERS[count]!;

  const playerStates: RussianRailroadsPlayer[] = players.map((player, seat) => ({
    id: `p${seat + 1}`,
    name: player.name,
    workersAvailable: workers,
    workersTotal: workers,
    coins: STARTING_COINS[count]!,
    routes: startingRoutes(),
    locomotives: [{ number: STARTING_LOCOMOTIVE }],
    industry: { wrench: 0 },
    hiredEngineers: [],
    actionPool: [],
    endBonus: null,
    turnOrderCard: turnOrderCards[seat]!,
    passed: false,
  }));

  const turnOrder = turnOrderFromCards(turnOrderCards);

  return {
    id,
    players: playerStates,
    actionSpaces: {},
    engineerStrip: dealEngineerStrip(count, rng),
    endBonusPile: dealEndBonusPile(rng),
    turnOrder,
    // The round opens with the turn-order starting seat (the player holding card "1", pg. 5).
    activePlayerIndex: turnOrder[0]!,
    round: 1,
    rounds: ROUNDS[count]!,
    supplies: { doublers: 0 },
    // Active arm of the kernel end-state union: no results/winnerIds until the game ends.
    status: 'active',
    version: 0,
    log: [],
  };
}
