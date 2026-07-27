import { ALL_PLACES, BUILDING_PLACES, CARD_PLACES, RESOURCE_PLACES } from '../core';
import type { PlaceId, StoneAgeState } from '../core';
import type { Action } from '../actions/action';
import { buildingIndex } from './buildings';
import { cardIndex } from './cards';

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

/** The places resolved by rolling dice: the four resource places + the hunt (which pays food, SA3). */
export const GATHER_PLACES: readonly PlaceId[] = [...RESOURCE_PLACES, 'hunt'];

/** Type guard: is this place resolved by a dice roll (a resource place, or the hunt for food)? */
export function isGatherPlace(place: PlaceId): place is ResourcePlace | 'hunt' {
  return isResourcePlace(place) || place === 'hunt';
}

/** The non-dice places resolved by a plain `USE`: tool maker → tool, hut → person, field → food (SA4–6). */
export const USE_PLACES: readonly PlaceId[] = ['toolMaker', 'hut', 'field'];

/** Whether a place is resolved by a plain `USE` (rather than a dice roll). */
export function isUsePlace(place: PlaceId): boolean {
  return USE_PLACES.includes(place);
}

/** The non-dice `USE` actions a seat can take right now (the dice gathers are server-only, not listed). */
export function legalUses(state: StoneAgeState, playerId: string): Action[] {
  return USE_PLACES.filter((place) => state.placements[place][playerId] !== undefined).map((place) => ({
    type: 'USE',
    place,
  }));
}

/**
 * The `BUILD` options a seat has right now — a marker per building slot they occupy (the resources to
 * pay are the client's choice, so `resources` is left empty, like Container's bare bot markers). At
 * minimum "decline" (empty payment) is always legal; the UI/bot fills in a real payment.
 */
export function legalBuilds(state: StoneAgeState, playerId: string): Action[] {
  return BUILDING_PLACES.filter((place) => state.placements[place][playerId] !== undefined).map((place) => ({
    type: 'BUILD',
    stack: buildingIndex(place),
    resources: {},
  }));
}

/** The `ACQUIRE_CARD` markers a seat has right now — one per card slot they occupy (payment is theirs). */
export function legalCards(state: StoneAgeState, playerId: string): Action[] {
  return CARD_PLACES.filter((place) => state.placements[place][playerId] !== undefined).map((place) => ({
    type: 'ACQUIRE_CARD',
    slot: cardIndex(place),
    resources: {},
  }));
}

/**
 * Whether a player still has people to resolve. Every board place now has an implemented action (dice,
 * `USE`, or `BUILD` for a building slot), so a player's turn simply ends when their board is clear.
 */
export function hasActionablePlacements(state: StoneAgeState, playerId: string): boolean {
  return ALL_PLACES.some((place) => state.placements[place][playerId] !== undefined);
}

/** Return all of a player's people — remove them from every place (fixed board + building slots). */
function clearPlayer(placements: StoneAgeState['placements'], playerId: string): StoneAgeState['placements'] {
  const next = {} as Record<PlaceId, Record<string, number>>;
  for (const place of ALL_PLACES) {
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
    if (hasActionablePlacements({ ...state, placements }, id)) {
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
  if (hasActionablePlacements(state, state.players[active]!.id)) return {};

  const n = state.players.length;
  let placements = clearPlayer(state.placements, state.players[active]!.id);
  for (let i = 1; i < n; i += 1) {
    const seat = (active + i) % n;
    const id = state.players[seat]!.id;
    if (hasActionablePlacements({ ...state, placements }, id)) {
      return { activePlayerIndex: seat, placements };
    }
    placements = clearPlayer(placements, id);
  }
  return { phase: 'feeding', activePlayerIndex: state.startPlayerIndex, placements };
}
