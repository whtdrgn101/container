import type { Viewer } from '../../kernel';
import type { StoneAgeState } from './core';

// `Viewer` is a kernel primitive; re-export it so Stone Age's consumers import it from this surface.
export type { Viewer } from '../../kernel';

/** Distributive `Omit` — preserves the `GameEndState` discriminated union so `status` still narrows. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * A Stone Age game projected for a viewer. Stone Age is a Euro with almost no hidden information —
 * resources, tools, people and the board are all public — so a view is the whole state plus a note of
 * who it's for, with **one redaction**: the face-down civilization-card draw pile (`cardDeck`).
 *
 * The undrawn deck is a secret — its order is the next cards to be dealt, so shipping the array lets any
 * client read the future (REVIEW.md §4.6). The view carries only its **count** (`cardDeckCount`); the
 * full deck never leaves the engine boundary. Following Saint Petersburg's convention (draw stacks as
 * counts from day one, `stpetersburg/view.ts`), the count is **always** present — even at `ended`. There
 * is no reveal: the undrawn deck is dead information, not a player secret to unmask like a scoring card,
 * so exposing it at game end would leak the next game's nothing while telling you nothing about this one.
 */
// Intersection (not `interface extends`) so it distributes over `StoneAgeState`'s end-state union and
// keeps the `status` discriminant — an interface can't extend a union.
export type StoneAgeView = DistributiveOmit<StoneAgeState, 'cardDeck'> & {
  /** How many cards remain in the face-down draw pile — the count, never the contents (§4.6). */
  readonly cardDeckCount: number;
  readonly viewerId: Viewer;
};

/**
 * Project `state` for `viewer`. Redacts the one Stone Age secret: the undrawn `cardDeck` becomes a
 * `cardDeckCount` (see the type doc). Everything else is public, so it passes through unchanged.
 */
export function viewFor(state: StoneAgeState, viewer: Viewer): StoneAgeView {
  const { cardDeck, ...rest } = state;
  return { ...rest, cardDeckCount: cardDeck.length, viewerId: viewer };
}
