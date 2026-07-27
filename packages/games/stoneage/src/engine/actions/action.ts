import type { PlaceId, Resource } from '../core';

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
  // Step 1 of a gather (SA2–3): roll the dice on a placed group → a `pendingGather`. **Server-only**:
  // the dice come from the injected rng by the roll route, never chosen by a client (like Can't Stop's `ROLL`).
  | { readonly type: 'GATHER'; readonly place: PlaceId; readonly dice: readonly number[] }
  // Step 2 of a gather (SA4b): take the pending roll, optionally adding tools (by index) to the total.
  | { readonly type: 'TAKE_GATHER'; readonly toolIndices: readonly number[] }
  // Use a non-dice place — tool maker → tool, hut → person, field → food production (SA4–6).
  | { readonly type: 'USE'; readonly place: PlaceId }
  // Feed your people in the feeding phase (SA7). `payWithResources` (default true) covers any food
  // shortfall with resources; false (or being unable) takes the −10 penalty instead.
  | { readonly type: 'FEED'; readonly payWithResources?: boolean }
  // Buy (or decline) the building your person stands on (SA9). `stack` is its 0-based index; `resources`
  // is the payment — an empty payment declines and takes the person back.
  | { readonly type: 'BUILD'; readonly stack: number; readonly resources: Readonly<Partial<Record<Resource, number>>> }
  // Acquire (or decline) the civilization card your person stands on (SA10). `slot` is its display index;
  // `resources` is the payment (any kinds, never food) — an empty payment declines.
  | {
      readonly type: 'ACQUIRE_CARD';
      readonly slot: number;
      readonly resources: Readonly<Partial<Record<Resource, number>>>;
    };

export type ActionType = Action['type'];
