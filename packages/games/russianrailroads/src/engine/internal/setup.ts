import { shuffle } from '@game-hub/kernel';
import { END_BONUS_CARDS, END_BONUS_REMOVED_UNSEEN, ENGINEER_DEAL, ENGINEERS } from '../core';
import type { EndBonusCard, Engineer } from '../core';

/**
 * A pure Fisher–Yates shuffle over an injected `rng` (`() => number` in [0, 1)) — the kernel's since
 * 1.2.0 (identical algorithm; the kernel's `rng` is optional, and every call here passes one, because
 * setup randomness is injected so the engine stays deterministic and the 100% gate is reachable).
 * Re-exported so this game's setup helpers keep their single import site.
 */
export { shuffle };

/**
 * Deal the turn-order cards (pg. 5): shuffle the four cards `[1,2,3,4]`, deal one to each of `count`
 * seats. Returns each seat's card number (seat `i` → `cards[i]`). Round-1 turn order is ascending card.
 */
export function dealTurnOrderCards(count: number, rng: () => number): number[] {
  return shuffle([1, 2, 3, 4], rng).slice(0, count);
}

/** The seat indices in play order for a set of dealt cards (pg. 5): seats sorted by ascending card. */
export function turnOrderFromCards(cards: readonly number[]): number[] {
  return cards.map((_, seat) => seat).sort((a, b) => cards[a]! - cards[b]!);
}

/**
 * Build the engineer strip (pg. 5, 23). Sort the engineers into the A and B stacks (the letterless one
 * is set aside — it goes onto its idea card, out of RR1 scope), shuffle each separately, then deal:
 *
 *  - **4 players**: top 4 of B (left) + top 3 of A (right) = 7 slots.
 *  - **2 players**: top 3 of B + top 3 of A = 6 slots.
 *  - **3 players**: top 3 of B + top 3 of A, with the **left-most slot empty** (`null`) = 7 slots.
 *
 * B on the left, A on the right — the right end is the hiring space, claimed first, and the strip slides
 * right each round (pg. 21–22). Returns the ordered slots (an engineer or `null` per slot).
 */
export function dealEngineerStrip(count: number, rng: () => number): (Engineer | null)[] {
  const aStack = shuffle(
    ENGINEERS.filter((e) => e.stack === 'A'),
    rng,
  );
  const bStack = shuffle(
    ENGINEERS.filter((e) => e.stack === 'B'),
    rng,
  );
  const deal = ENGINEER_DEAL[count]!;
  const strip: (Engineer | null)[] = [...bStack.slice(0, deal.b), ...aStack.slice(0, deal.a)];
  // 3 players: 7-slot strip with the left-most space left empty (pg. 23).
  if (count === 3) strip.unshift(null);
  return strip;
}

/**
 * Build the face-down end-bonus pile (pg. 5): shuffle the deck and return 2 to the box **unseen** (drop
 * them), leaving the rest as the pile. The pile order is a secret — `viewFor` carries only its count.
 */
export function dealEndBonusPile(rng: () => number): EndBonusCard[] {
  return shuffle(END_BONUS_CARDS, rng).slice(END_BONUS_REMOVED_UNSEEN);
}
