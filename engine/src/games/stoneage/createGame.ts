import { GameError, MAX_PLAYERS, MIN_PLAYERS, PLACES, RESOURCES, STARTING_FOOD, STARTING_PEOPLE } from './core';
import type { PlaceId, Resource, StoneAgePlayer, StoneAgeState } from './core';

/** Input for a single seat when creating a game. */
export interface NewPlayer {
  readonly name: string;
}

export interface CreateGameOptions {
  readonly id: string;
  readonly players: readonly NewPlayer[];
}

const emptyResources = (): Record<Resource, number> => {
  const resources = {} as Record<Resource, number>;
  for (const resource of RESOURCES) resources[resource] = 0;
  return resources;
};

/**
 * Build the initial Stone Age setup (rulebook pg. 2–3) — the **bootstrap scaffold** (roadmap SA0).
 *
 * Deterministic: each player starts with 5 people, 12 food, an empty board and empty holdings. The
 * card/building decks and dice arrive with the stages that use them, so no randomness is needed here
 * yet (unlike Container's scoring shuffle) — hence no `rng`.
 */
export function createGame(options: CreateGameOptions): StoneAgeState {
  const { id, players } = options;
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
    resources: emptyResources(),
    civCards: [],
    buildings: 0,
    score: 0,
  }));

  const placements = {} as Record<PlaceId, Record<string, number>>;
  for (const place of PLACES) placements[place] = {};

  return {
    id,
    players: playerStates,
    round: 1,
    phase: 'placement',
    startPlayerIndex: 0,
    activePlayerIndex: 0,
    placements,
    status: 'active',
    winnerIds: [],
    version: 0,
    log: [],
  };
}
