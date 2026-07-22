import { ARISTOCRAT_SCORE } from '../core';
import type { GameEndState } from '../../../kernel';
import type { StPetersburgPlayer, StPetersburgResult, StPetersburgState } from '../core';

// Final scoring (rulebook pg. 5–6, SP6). The game ends when the trading phase of the final round closes;
// `pass` folds the result of `finalScoring` into the closing move. Read pg. 5–6 before touching a value.

/** 1 victory point per this many rubles left at game end (pg. 6: "for each full 10 rubles, a player earns 1 point"). */
const RUBLES_PER_POINT = 10;
/** −5 points for every card still in hand at game end (pg. 6: "-5, -10, -15, or -20 (with warehouse)"). */
const HAND_CARD_PENALTY = 5;

/**
 * Points for a count of **distinct** aristocrats, from the board's scoring table (pg. 5–6): the triangular
 * numbers 1/3/6/10/15/21/28/36/45/55 for 1..10 distinct (0 for none). Verified against pg. 6's worked
 * example — "6 different aristocrats … earns 21 points" (= `ARISTOCRAT_SCORE[6]`). The table stops at 10;
 * a play area holding more than 10 distinct aristocrats (possible only with the ADAPTED orange trading
 * deck) scores the table maximum (55) — respecting the board's domain, not inventing a new tier.
 */
export function aristocratScore(distinct: number): number {
  return ARISTOCRAT_SCORE[Math.min(distinct, ARISTOCRAT_SCORE.length - 1)]!;
}

/**
 * Score one player at game end (pg. 5–6): banked points + distinct-aristocrat table + 1/10 rubles − 5/hand
 * card. **Distinct** counts by card identity (`key`) across the whole aristocrat group — plain aristocrats
 * *and* orange aristocrat trading cards both live in `playArea.aristocrat` (pg. 5: "all different aristocrats
 * … same aristocrats count nothing"). No clamp: `total` may be negative if hand penalties exceed the rest.
 */
export function scorePlayer(player: StPetersburgPlayer): StPetersburgResult {
  const distinctAristocrats = new Set(player.playArea.aristocrat.map((c) => c.key)).size;
  const aristocrats = aristocratScore(distinctAristocrats);
  const money = Math.floor(player.rubles / RUBLES_PER_POINT);
  const handPenalty = player.hand.length * HAND_CARD_PENALTY;
  const base = player.points;
  return {
    playerId: player.id,
    base,
    aristocrats,
    distinctAristocrats,
    money,
    handPenalty,
    total: base + aristocrats + money - handPenalty,
  };
}

/**
 * Compute the whole game's end state (pg. 5–6): a per-player breakdown plus `winnerIds`. The winner has the
 * **highest total**; ties break by **most rubles** (pg. 6: "the one among them with the most money is the
 * winner"); if still tied the win is **shared** (every seat still level appears in `winnerIds`).
 *
 * Returns the kernel `GameEndState` `ended` arm — `pass` spreads it over the state to end the game, and
 * `viewFor` reveals everything once `status === 'ended'`.
 */
export function finalScoring(state: StPetersburgState): Extract<GameEndState<StPetersburgResult>, { status: 'ended' }> {
  const results = state.players.map(scorePlayer);

  const bestTotal = Math.max(...results.map((r) => r.total));
  const topByTotal = results.filter((r) => r.total === bestTotal);
  // Tiebreak by rubles (pg. 6). Pair each tied result back to its seat's rubles.
  const rublesOf = (playerId: string) => state.players.find((p) => p.id === playerId)!.rubles;
  const bestRubles = Math.max(...topByTotal.map((r) => rublesOf(r.playerId)));
  const winnerIds = topByTotal.filter((r) => rublesOf(r.playerId) === bestRubles).map((r) => r.playerId);

  return { status: 'ended', results, winnerIds };
}
