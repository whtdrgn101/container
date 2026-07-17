import type { PlaceId } from '../core';

/**
 * Everything a player can do in Stone Age.
 *
 * **The scaffold implements none of it.** The first real action is `PLACE` (worker placement, roadmap
 * stage SA1); the rest — the per-place actions, feeding, buildings, cards — follow one stage at a time.
 * The union is seeded with `PLACE` now so the parse→apply pipeline has a concrete shape to compile
 * against; `applyAction` refuses it until SA1.
 */
export type Action =
  | { readonly type: 'PLACE'; readonly place: PlaceId; readonly count: number }
  // Gather resources/food from a placed group by rolling dice (SA2–3). **Server-only**: the dice are
  // rolled with the injected rng by the roll route and never chosen by a client — like Can't Stop's `ROLL`.
  | { readonly type: 'GATHER'; readonly place: PlaceId; readonly dice: readonly number[] }
  // Use a non-dice place — tool maker → tool, hut → person, field → food production (SA4–6).
  | { readonly type: 'USE'; readonly place: PlaceId }
  // Feed your people in the feeding phase (SA7). `payWithResources` (default true) covers any food
  // shortfall with resources; false (or being unable) takes the −10 penalty instead.
  | { readonly type: 'FEED'; readonly payWithResources?: boolean };

export type ActionType = Action['type'];
