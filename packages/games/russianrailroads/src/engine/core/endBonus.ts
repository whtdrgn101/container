// The end-bonus cards (rulebook pg. 5, 22, 47), encoded as data. Read pg. 47 before touching a value.
//
// ─── COMPONENT READ (RR8): the end-bonus card catalog (pg. 47 @ 300 DPI) ──────────────────────────────
// pg. 47's "END BONUS CARDS" section illustrates the printed cards; their conditions read cleanly, and the
// star values were confirmed on the card art at 300 DPI (the SP0 / RR2 component-read precedent). **Eleven**
// distinct card designs are shown (the RR8 scope brief said "12" — the rulebook art shows 11 distinct
// designs; documented ADAPTED count). Each is encoded below with its pg. 47 condition cited; where a face
// value was a component read it is noted. The real deck ships duplicates, but as *distinct effects* there
// are eleven, which is plenty for a pile of `count` at 2–4 players (2 removed unseen at setup, pg. 5).
//
// ─── RULING (RR8): "choose an end bonus card" (roadmap AMBIGUITY #3) ──────────────────────────────────
// The end-bonus idea token (pg. 46) and engineer #15 (pg. 48) both say "choose an[other] end bonus card
// from the deck." The deck is **face-down** (pg. 5: shuffled, 2 removed unseen, placed face-down). With a
// face-down pile, "choose" cannot mean pick-with-knowledge — that would leak the pile's contents, which the
// whole hidden-information design (the pile is redacted to a *count* in `viewFor`) forbids. So the faithful
// reading is **draw the top card** of the face-down pile: deterministic, and it preserves the one secret.
// This matches RR6's already-shipped draw-top for the end-bonus idea token; RR8 makes it the standing rule
// (also used by engineer #15's "choose another end bonus card"). See the ROADMAP RR8 ruling.

import type { TrackColor } from './constants';

/** A tiered threshold table (the keys / doublers cards, pg. 47): the highest tier whose `min` is met scores. */
export interface EndBonusTier {
  /** The minimum count (keys / doubler tiles) this tier requires. */
  readonly min: number;
  /** Points scored at this tier. */
  readonly points: number;
}

/**
 * How an end-bonus card scores at game end (pg. 47) — a typed union, one variant per printed card design.
 * All are pure functions of a single player's public board (`internal/finalScoring` evaluates them), so the
 * whole reveal is deterministic and the 100% gate is reachable.
 */
export type EndBonusRule =
  // "Score 4 points for each factory in your industry track." (steelworks are an expansion; 4 base gaps here)
  | { readonly kind: 'per-factory'; readonly points: number }
  // "Score 6 points for each engineer you hired (including the extra engineer end bonus card)."
  | { readonly kind: 'per-engineer'; readonly points: number }
  // "Score 10 points for each route you reached the last space (end station) of."
  | { readonly kind: 'per-end-station'; readonly points: number }
  // "Score 1 point for each space you moved with your <colour> track [and your <colour> track]."
  | { readonly kind: 'per-track'; readonly colors: readonly TrackColor[]; readonly points: number }
  // "Score points based on the number of keys you received" (2–3 → 15, 4–5 → 25, 6+ → 40).
  | { readonly kind: 'keys'; readonly tiers: readonly EndBonusTier[] }
  // "Score 20 points if you have between 4 and 6 doubler tokens. Score 30 if 7 or more."
  | { readonly kind: 'doublers'; readonly tiers: readonly EndBonusTier[] }
  // "Score 7 points for each idea token you placed."
  | { readonly kind: 'per-idea-token'; readonly points: number }
  // "This card counts as an extra engineer when counting engineer majority." (no direct VP)
  | { readonly kind: 'extra-engineer' }
  // "Score points equal to the sum of your 4 highest-number locomotives."
  | { readonly kind: 'top-locomotives'; readonly count: number }
  // "Score 10 points for each extra worker you received during the game (max. of 3 …)."
  | { readonly kind: 'per-extra-worker'; readonly points: number; readonly max: number };

/** One end-bonus card (pg. 22, 47): a stable id + its scoring rule. Held face-down until final scoring. */
export interface EndBonusCard {
  readonly id: string;
  readonly rule: EndBonusRule;
}

/**
 * The eleven end-bonus card designs (pg. 47 — see the component read above). Face values are read off the
 * card art (the keys / doubler tier tables at 300 DPI: keys 2–3/15, 4–5/25, 6+/40; doublers 4–6/20, 7+/30).
 */
export const END_BONUS_CARDS: readonly EndBonusCard[] = [
  { id: 'eb-factories', rule: { kind: 'per-factory', points: 4 } },
  { id: 'eb-engineers', rule: { kind: 'per-engineer', points: 6 } },
  { id: 'eb-end-stations', rule: { kind: 'per-end-station', points: 10 } },
  { id: 'eb-green-bronze-track', rule: { kind: 'per-track', colors: ['green', 'bronze'], points: 1 } },
  {
    id: 'eb-keys',
    rule: {
      kind: 'keys',
      tiers: [
        { min: 2, points: 15 },
        { min: 4, points: 25 },
        { min: 6, points: 40 },
      ],
    },
  },
  {
    id: 'eb-doublers',
    rule: {
      kind: 'doublers',
      tiers: [
        { min: 4, points: 20 },
        { min: 7, points: 30 },
      ],
    },
  },
  { id: 'eb-wood-track', rule: { kind: 'per-track', colors: ['wood'], points: 1 } },
  { id: 'eb-idea-tokens', rule: { kind: 'per-idea-token', points: 7 } },
  { id: 'eb-extra-engineer', rule: { kind: 'extra-engineer' } },
  { id: 'eb-top-locomotives', rule: { kind: 'top-locomotives', count: 4 } },
  { id: 'eb-extra-workers', rule: { kind: 'per-extra-worker', points: 10, max: 3 } },
];

/** The engineer-majority scores (pg. 22): most engineers → 40, second-most → 20. */
export const ENGINEER_MAJORITY_FIRST = 40;
export const ENGINEER_MAJORITY_SECOND = 20;
