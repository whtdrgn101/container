import {
  CARD_KINDS,
  GameError,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_RUBLES,
  WORKER_ROW_SEED,
} from './core';
import type { Card, CardKind, StPetersburgPlayer, StPetersburgState } from './core';
import { dealMarkers, mintStack, shuffle } from './internal';

/** Input for a single seat when creating a game. */
export interface NewPlayer {
  readonly name: string;
}

export interface CreateGameOptions {
  readonly id: string;
  readonly players: readonly NewPlayer[];
  /**
   * Randomness for the four stack shuffles + the starting-player marker deal (pg. 2), injected so the
   * engine stays pure. Omit for a deterministic setup (tests) — the backend passes `ctx.rng`.
   */
  readonly rng?: () => number;
}

/**
 * Build the initial Saint Petersburg setup (rulebook pg. 2).
 *
 * Each player starts with 25 rubles and an empty play area/hand; the four card groups are each shuffled
 * separately; the four starting-player markers are dealt (per player count); and the administrator seeds
 * the upper row with **8/6/4 workers by player count** (pg. 2 + the 2–3-player note, pg. 8). Randomness
 * is injected via `rng` so the engine stays pure and the 100% gate is reachable (omit for a fixed order).
 */
export function createGame(options: CreateGameOptions): StPetersburgState {
  const { id, players, rng } = options;
  const count = players.length;
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new GameError(
      'INVALID_PLAYER_COUNT',
      `Saint Petersburg supports ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${count}`,
    );
  }

  const playerStates: StPetersburgPlayer[] = players.map((player, seat) => ({
    id: `p${seat + 1}`,
    name: player.name,
    rubles: STARTING_RUBLES,
    points: 0,
    playArea: { worker: [], building: [], aristocrat: [] },
    hand: [],
  }));

  // Shuffle each of the four groups separately (pg. 2).
  const stacks = {} as Record<CardKind, Card[]>;
  for (const kind of CARD_KINDS) stacks[kind] = shuffle(mintStack(kind), rng);

  // The administrator seeds the upper row with workers off the (already shuffled) worker stack.
  const seed = WORKER_ROW_SEED[count]!;
  const upper = stacks.worker.slice(0, seed);
  stacks.worker = stacks.worker.slice(seed);

  const startingPlayers = dealMarkers(count, rng);

  return {
    id,
    players: playerStates,
    board: { upper, lower: [], stacks, discard: 0 },
    round: 1,
    phase: 'worker',
    startingPlayers,
    // The worker phase opens with its starting player (pg. 2, "The game begins with the first worker phase").
    activePlayerIndex: startingPlayers.worker,
    consecutivePasses: 0,
    // No card has been taken yet this (opening worker) phase — the pg. 8 refill flag.
    tookCardThisPhase: false,
    // The game is not yet in its final round; a refill placing a group's last card sets this (pg. 5, SP6).
    finalRound: false,
    // No Observatory used yet (pg. 8, SP5); the Pub/Observatory interludes are inactive at setup.
    observatoryUsed: [],
    // Active arm of the kernel end-state union: no `results`/`winnerIds` exist until the game ends (SP6).
    status: 'active',
    version: 0,
    log: [],
  };
}
