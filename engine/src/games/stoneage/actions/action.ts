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
  // Gather resources from a placed group (SA2). **Server-only**: the dice are rolled with the injected
  // rng by the roll route and never chosen by a client — exactly Can't Stop's `ROLL`.
  | { readonly type: 'GATHER'; readonly place: PlaceId; readonly dice: readonly number[] };

export type ActionType = Action['type'];
