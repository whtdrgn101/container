// Idea tokens (rulebook pg. 46), idea cards (pg. 47) and the starting bonus cards (pg. 6), encoded as data.
// Read the cited page before touching a value. These are the benefits the route/industry idea-token spaces
// and the game-start setup mini-phase grant.
//
// ─── COMPONENT RULING (RR6): the idea-token set ──────────────────────────────────────────────────────
// pg. 46–47 describe **five** distinct idea-token benefits (below); the pg. 6 setup art shows a small grid
// of physical tokens per player (≈6, plus the separate 20-point medal + second wrench pieces the tokens
// deploy). The scope brief cited "9 tokens". The **rules text is authoritative over the ambiguous count**,
// so RR6 models the five described benefit *types*, one of each per player (a single-use set): each
// idea-token space (pp. 18–19) spends one unused token of the player's choice. The exact physical multiset
// is an art detail reconciled in RR9. No idea-token benefit is a shared/limited supply, so no count is
// tracked beyond "which types this player has already used".
//
// ─── RULING (RR6): "choose an end bonus card" (roadmap AMBIGUITY #3) ──────────────────────────────────
// The end-bonus idea token (pg. 46) says "choose an end bonus card from the deck". Whether that is
// draw-top or free-pick interacts with pile redaction and is owned by **RR8** (end-bonus reveal + scoring).
// Per the scope brief, RR6 implements **draw-top from the pile** and leaves this ruling note; RR8 lands the
// final call. The card is placed face-down in the player's `endBonus` slot (its scoring is still an RR8 stub).

import type { EndBonusCard, TrackColor } from './constants';

/** The five idea-token benefit types (pg. 46–47 — see the component ruling above). */
export type IdeaTokenType =
  | 'end-bonus' // draw the top end-bonus card + choose an idea card (pg. 46; draw-top ruling above)
  | 'twenty-points' // place the 20-point medal → +20 each scoring phase (pg. 46)
  | 'revaluation' // flip the valuation tile to its better side (pg. 46)
  | 'keys' // receive 2 keys (pg. 46; see pg. 19 for the key benefit)
  | 'second-wrench'; // place a second wrench + 2 industry steps (pg. 47)

/** Every idea-token type a player starts with — one of each, single-use (pg. 6, 46–47). */
export const IDEA_TOKEN_TYPES: readonly IdeaTokenType[] = [
  'end-bonus',
  'twenty-points',
  'revaluation',
  'keys',
  'second-wrench',
];

/** The 20-point medal's per-scoring-phase bonus (pg. 46). */
export const TWENTY_POINTS = 20;

/** How many keys the 2-keys idea token grants (pg. 46). */
export const KEYS_FROM_TOKEN = 2;

/** How many industry steps the second-wrench idea token grants (pg. 47). */
export const SECOND_WRENCH_STEPS = 2;

/**
 * The **revalued** valuation tile (pg. 46: "your tracks score more points, as shown"). **ART RULING (RR6):**
 * the flipped tile's values aren't legibly readable in the v2 PDF at this DPI. Adopting a documented ADAPTED
 * improved set (the VALUATION / END_BONUS_CARDS precedent): strictly ≥ the base tile (0 / 1 / 2 / 4 / 7),
 * wood staying 0. Reconcile against the physical tile in RR9.
 */
export const VALUATION_REVALUED: Readonly<Record<TrackColor, number>> = {
  wood: 0,
  green: 2,
  bronze: 3,
  silver: 5,
  gold: 8,
};

// ─── Idea cards (pg. 47) ─────────────────────────────────────────────────────────────────────────────
// pg. 47 legibly describes **three** idea cards (wood worker / #9 loco / engineer+coin); the game ships
// five (pg. 4 "place the idea cards face up" shows five). RR6 encodes the three read benefits as real and
// two **ADAPTED** simple placeholders (the END_BONUS_CARDS convention), so the "token grants an idea card"
// choice is real and tested. The engineer half of `engineer-coin` is deferred to RR7 (engineers); the
// coin is granted now.

/** The five idea cards (pg. 47) a player may choose from when the end-bonus idea token is resolved. */
export type IdeaCardId = 'wood-worker' | 'loco-9' | 'engineer-coin' | 'extra-coins' | 'wood-move';

/** Every idea card, in menu order (pg. 47 — see note above). */
export const IDEA_CARDS: readonly IdeaCardId[] = ['wood-worker', 'loco-9', 'engineer-coin', 'extra-coins', 'wood-move'];

/** The #9 locomotive the `loco-9` idea card grants (pg. 47 — "acts like a normal locomotive"). */
export const IDEA_CARD_LOCO = 9;

/** Coins the `engineer-coin` (its coin half) and `extra-coins` (ADAPTED) idea cards grant (pg. 47). */
export const IDEA_CARD_COINS: Readonly<Record<string, number>> = { 'engineer-coin': 1, 'extra-coins': 2 };

// ─── Starting bonus cards (pg. 6, step 10) ───────────────────────────────────────────────────────────
// Setup mini-phase: the players in 4th / 3rd / 2nd position each take one starting bonus card and resolve
// its (simple) action; the start player takes none. Then all are returned to the box.
//
// ─── ART RULING (RR6): the 4 starting bonus cards ────────────────────────────────────────────────────
// The pg. 6 art shows **4** starting bonus cards, each a "simple action" (pg. 6). The exact benefit icons
// are only partly legible at this DPI; adopting a documented ADAPTED set of four simple one-time actions
// (coins / a wood-track move / a wrench advance) — the kind of modest leg-up the rulebook calls "simple".
// Reconcile against the physical cards in RR9.

/** One starting bonus card's (simple) one-time benefit (pg. 6). All four are documented ADAPTED reads. */
export interface StartingBonusCard {
  readonly id: string;
  /** Coins granted immediately (pg. 6). */
  readonly coins?: number;
  /** Wood-track moves granted (a pending-moves lock of wood steps, pg. 6). */
  readonly woodMoves?: number;
  /** Industry steps granted (advance the wrench, pg. 6). */
  readonly industry?: number;
}

/** The four starting bonus cards (pg. 6 — ADAPTED, see the art ruling). Offered 4th → 3rd → 2nd at setup. */
export const STARTING_BONUS_CARDS: readonly StartingBonusCard[] = [
  { id: 'start-coins-2', coins: 2 },
  { id: 'start-wood-1', woodMoves: 1 },
  { id: 'start-industry-1', industry: 1 },
  { id: 'start-coin-wood', coins: 1, woodMoves: 1 },
];
