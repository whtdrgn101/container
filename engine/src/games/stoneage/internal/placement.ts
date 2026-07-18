import { ALL_PLACES, PLACE_CAPACITY } from '../core';
import type { PlaceId, StoneAgeState } from '../core';
import type { Action } from '../actions/action';
import { buildingIndex, isBuildingPlace } from './buildings';

/**
 * The worker-placement rules of phase 1 (rulebook pg. 4). Capacities live in `PLACE_CAPACITY`; the
 * behaviour that isn't a raw number lives here: place 1+ people on **one** place per turn, never on a
 * place you already used this round, and never past a place's capacity.
 *
 * *(The 2–3-player restrictions on pg. 8 — only 2 of tool-maker/hut/field, and per-place player caps —
 * are deliberately deferred; SA1 implements the 4-player capacities for all counts.)*
 */

/** Total people this player has placed on the board this round (across every place, buildings included). */
export function placedBy(state: StoneAgeState, playerId: string): number {
  let total = 0;
  for (const place of ALL_PLACES) total += state.placements[place][playerId] ?? 0;
  return total;
}

/** People this player still has in hand to place this round. */
export function availableToPlace(state: StoneAgeState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId)!;
  return player.people - placedBy(state, playerId);
}

/** People (all players) already on a place. */
function occupancy(state: StoneAgeState, place: PlaceId): number {
  return Object.values(state.placements[place]).reduce((sum, n) => sum + n, 0);
}

/**
 * The range of people a player may place on a place right now, or `null` if they can't place there:
 * they've already used it this round, it's out of room, or they haven't the people for its minimum.
 * Tool-maker/field take exactly 1, the hut exactly 2 (so you need two people), the hunt any number,
 * and the four resource places 1..(whatever of the shared 7 remains).
 */
export function countRange(state: StoneAgeState, place: PlaceId, playerId: string): { min: number; max: number } | null {
  if (state.placements[place][playerId] !== undefined) return null; // already placed here this round
  const available = availableToPlace(state, playerId);
  if (available < 1) return null;

  // Building slots (pg. 5): exactly 1 person, but only while the stack still has a tile to buy.
  if (isBuildingPlace(place)) {
    const stack = state.buildings[buildingIndex(place)];
    if (!stack || stack.length === 0) return null;
    return occupancy(state, place) === 0 ? { min: 1, max: 1 } : null;
  }

  switch (place) {
    case 'toolMaker':
    case 'field':
      return occupancy(state, place) === 0 ? { min: 1, max: 1 } : null;
    case 'hut':
      return occupancy(state, place) === 0 && available >= 2 ? { min: 2, max: 2 } : null;
    case 'hunt':
      return { min: 1, max: available }; // no limit
    default: {
      const room = PLACE_CAPACITY[place]! - occupancy(state, place); // resource places: cap 7
      return room >= 1 ? { min: 1, max: Math.min(available, room) } : null;
    }
  }
}

/** Whether a player has any legal placement left. */
export function canPlace(state: StoneAgeState, playerId: string): boolean {
  return ALL_PLACES.some((place) => countRange(state, place, playerId) !== null);
}

/**
 * The next seat (clockwise from `fromIndex`) that can still place, or `null` if nobody can — which
 * ends the placement phase. Checks the others first, then back to `fromIndex`, so a lone player with
 * people left keeps getting turns.
 */
export function nextPlacer(state: StoneAgeState, fromIndex: number): number | null {
  const n = state.players.length;
  for (let i = 1; i <= n; i += 1) {
    const seat = (fromIndex + i) % n;
    if (canPlace(state, state.players[seat]!.id)) return seat;
  }
  return null;
}

/** Every legal `PLACE` for a seat, one per (place, count) — drives the UI and (later) the bot. */
export function legalPlacements(state: StoneAgeState, playerId: string): Action[] {
  const actions: Action[] = [];
  for (const place of ALL_PLACES) {
    const range = countRange(state, place, playerId);
    if (!range) continue;
    for (let count = range.min; count <= range.max; count += 1) {
      actions.push({ type: 'PLACE', place, count });
    }
  }
  return actions;
}
