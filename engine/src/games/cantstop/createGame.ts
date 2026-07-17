import { GameError, MAX_PLAYERS, MIN_PLAYERS } from './core';
import type { CantStopPlayer, CantStopState } from './core';

/** Input for a single seat when creating a game. */
export interface NewPlayer {
  readonly name: string;
}

export interface CreateGameOptions {
  readonly id: string;
  readonly players: readonly NewPlayer[];
}

/**
 * Build the initial state for a new Can't Stop game. Fully deterministic — Can't Stop needs no setup
 * randomness (the dice are rolled per turn, injected by the caller), so there is no `rng` here at all.
 * Seat i is player `p{i+1}`, matching the platform's seat-to-id convention.
 */
export function createGame(options: CreateGameOptions): CantStopState {
  const { id, players } = options;
  const count = players.length;
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new GameError(
      'INVALID_PLAYER_COUNT',
      `Can't Stop supports ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${count}`,
    );
  }

  const playerStates: CantStopPlayer[] = players.map((player, seat) => ({
    id: `p${seat + 1}`,
    name: player.name,
    progress: {},
  }));

  return {
    id,
    players: playerStates,
    activePlayerIndex: 0,
    turn: 1,
    claimed: {},
    runners: {},
    phase: 'rolling',
    dice: null,
    status: 'active',
    winnerIds: [],
    version: 0,
    log: [],
  };
}
