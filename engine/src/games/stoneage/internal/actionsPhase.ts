import { PLACES, RESOURCE_PLACES } from '../core';
import type { PlaceId, StoneAgeState } from '../core';

/**
 * The action phase (rulebook pg. 6, phase 2): the start player uses **all** their placed people, then
 * the next player clockwise, and so on. In SA2 the only implemented action is gathering resources, so a
 * player's action turn is "gather from each of your resource places"; when they have none left, their
 * remaining (not-yet-implemented) people are returned and the next player is up. When nobody can gather,
 * the round moves to feeding.
 */

/** A place where you gather a resource (all use the dice engine). */
export type ResourcePlace = (typeof RESOURCE_PLACES)[number];

/** Type guard: is this one of the four resource places? */
export function isResourcePlace(place: PlaceId): place is ResourcePlace {
  return (RESOURCE_PLACES as readonly PlaceId[]).includes(place);
}

/** Whether a player still has people on a resource place to gather. */
export function hasResourcePlacements(state: StoneAgeState, playerId: string): boolean {
  return RESOURCE_PLACES.some((place) => state.placements[place][playerId] !== undefined);
}

/** Return all of a player's people — remove them from every place. */
function clearPlayer(
  placements: StoneAgeState['placements'],
  playerId: string,
): StoneAgeState['placements'] {
  const next = {} as Record<PlaceId, Record<string, number>>;
  for (const place of PLACES) {
    const { [playerId]: _removed, ...rest } = placements[place];
    next[place] = rest;
  }
  return next;
}

/**
 * Enter the action phase: seat the first player (from the start player) with resources to gather,
 * returning the people of any earlier players who have none — or go straight to feeding if nobody can.
 */
export function enterActionPhase(state: StoneAgeState): Partial<StoneAgeState> {
  const n = state.players.length;
  let placements = state.placements;
  for (let i = 0; i < n; i += 1) {
    const seat = (state.startPlayerIndex + i) % n;
    const id = state.players[seat]!.id;
    if (hasResourcePlacements({ ...state, placements }, id)) {
      return { phase: 'actions', activePlayerIndex: seat, placements };
    }
    placements = clearPlayer(placements, id);
  }
  return { phase: 'feeding', activePlayerIndex: state.startPlayerIndex, placements };
}

/**
 * After the active player acts, decide what's next: stay put if they still have resources to gather;
 * otherwise return their people and pass to the next player who can gather (returning the people of any
 * who can't), or end the action phase (→ feeding). Returns only the fields that change.
 */
export function advanceActor(state: StoneAgeState): Partial<StoneAgeState> {
  const active = state.activePlayerIndex;
  if (hasResourcePlacements(state, state.players[active]!.id)) return {};

  const n = state.players.length;
  let placements = clearPlayer(state.placements, state.players[active]!.id);
  for (let i = 1; i < n; i += 1) {
    const seat = (active + i) % n;
    const id = state.players[seat]!.id;
    if (hasResourcePlacements({ ...state, placements }, id)) {
      return { activePlayerIndex: seat, placements };
    }
    placements = clearPlayer(placements, id);
  }
  return { phase: 'feeding', activePlayerIndex: state.startPlayerIndex, placements };
}
