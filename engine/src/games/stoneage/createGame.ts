import { ALL_PLACES, GameError, MAX_PLAYERS, MIN_PLAYERS, RESOURCES, STARTING_FOOD, STARTING_PEOPLE } from './core';
import type { PlaceId, Resource, StoneAgePlayer, StoneAgeState } from './core';
import { dealBuildings, dealCards } from './internal';

/** Input for a single seat when creating a game. */
export interface NewPlayer {
  readonly name: string;
}

export interface CreateGameOptions {
  readonly id: string;
  readonly players: readonly NewPlayer[];
  /**
   * Randomness for the building shuffle (pg. 3, setup step 9), injected so the engine stays pure. Omit
   * for a deterministic deck order (tests) — the backend passes `ctx.rng`.
   */
  readonly rng?: () => number;
}

const emptyResources = (): Record<Resource, number> => {
  const resources = {} as Record<Resource, number>;
  for (const resource of RESOURCES) resources[resource] = 0;
  return resources;
};

/**
 * Build the initial Stone Age setup (rulebook pg. 2–3).
 *
 * Each player starts with 5 people, 12 food, an empty board and empty holdings; the building deck is
 * shuffled and dealt into `playerCount` stacks of 7 (setup step 9). Randomness is injected via `rng` so
 * the engine stays pure and the 100% gate is reachable (omit it for a deterministic deck order).
 */
export function createGame(options: CreateGameOptions): StoneAgeState {
  const { id, players, rng } = options;
  const count = players.length;
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new GameError(
      'INVALID_PLAYER_COUNT',
      `Stone Age supports ${MIN_PLAYERS}–${MAX_PLAYERS} players, got ${count}`,
    );
  }

  const playerStates: StoneAgePlayer[] = players.map((player, seat) => ({
    id: `p${seat + 1}`,
    name: player.name,
    people: STARTING_PEOPLE,
    food: STARTING_FOOD,
    foodTrack: 0,
    tools: [],
    toolsUsed: [],
    resources: emptyResources(),
    civCards: [],
    buildings: 0,
    score: 0,
  }));

  const placements = {} as Record<PlaceId, Record<string, number>>;
  for (const place of ALL_PLACES) placements[place] = {};

  const { display, deck } = dealCards(rng);

  return {
    id,
    players: playerStates,
    round: 1,
    phase: 'placement',
    startPlayerIndex: 0,
    activePlayerIndex: 0,
    placements,
    buildings: dealBuildings(count, rng),
    cardDisplay: display,
    cardDeck: deck,
    pendingGather: null,
    // Active arm of the kernel end-state union: no `results`/`winnerIds` exist until the game ends.
    status: 'active',
    version: 0,
    log: [],
  };
}
