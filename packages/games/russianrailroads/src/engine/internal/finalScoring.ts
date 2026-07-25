import { ENGINEER_MAJORITY_FIRST, ENGINEER_MAJORITY_SECOND, STARTING_WORKERS } from '../core';
import type { EndBonusCard, EndBonusTier, RussianRailroadsPlayer, RussianRailroadsResult, TrackColor } from '../core';
import { highestEngineerNumber } from './engineers';

/**
 * Final scoring (rulebook pg. 22, RR8): after the last round's scoring phase, each player scores their
 * revealed **end-bonus cards** (pg. 47) and the **engineer majority** (40/20, pg. 22), added onto their
 * cumulative round total. Pure functions over the public roster — no mutation, no randomness — so the 100%
 * gate is reachable and the reveal is deterministic.
 */

/** Whether a player holds the "extra engineer" end-bonus card (pg. 47) — it counts toward majority + count. */
function hasExtraEngineerCard(player: RussianRailroadsPlayer): boolean {
  return player.endBonusCards.some((c) => c.rule.kind === 'extra-engineer');
}

/** How many engineers a player counts for majority + the per-engineer card: hired + the extra-engineer card. */
function engineersFor(player: RussianRailroadsPlayer): number {
  return player.hiredEngineers.length + (hasExtraEngineerCard(player) ? 1 : 0);
}

/** How many gaps a player has filled with factories (pg. 47 "each factory in your industry track"). */
function factoryCount(player: RussianRailroadsPlayer): number {
  return player.industry.factories.filter((f) => f !== null).length;
}

/** How many routes reached their **last space** (end station, pg. 47): the final track space is filled. */
function endStationsReached(player: RussianRailroadsPlayer): number {
  return player.routes.filter((r) => r.spaces[r.spaces.length - 1] != null).length;
}

/**
 * How many spaces `player` moved with their `color` track (pg. 47) — summed over the three routes. A colour
 * tile sits at its frontier (0 or 1 per route); the spaces it moved equal its 1-based position (index + 1).
 */
function trackSpacesMoved(player: RussianRailroadsPlayer, color: TrackColor): number {
  return player.routes.reduce((sum, route) => {
    const index = route.spaces.indexOf(color);
    return sum + (index >= 0 ? index + 1 : 0);
  }, 0);
}

/** The sum of a player's `count` highest-numbered locomotives (pg. 47 sum-of-locos card). */
function sumTopLocomotives(player: RussianRailroadsPlayer, count: number): number {
  return [...player.locomotives]
    .map((l) => l.number)
    .sort((a, b) => b - a)
    .slice(0, count)
    .reduce((sum, n) => sum + n, 0);
}

/** The highest tier whose `min` is met (pg. 47 keys / doublers cards), or 0 below the lowest tier. */
function tierPoints(tiers: readonly EndBonusTier[], amount: number): number {
  return tiers.reduce((best, tier) => (amount >= tier.min ? tier.points : best), 0);
}

/** Score one end-bonus card for a player (pg. 47). `startingWorkers` sizes the "extra worker" card. */
export function scoreEndBonusCard(card: EndBonusCard, player: RussianRailroadsPlayer, startingWorkers: number): number {
  const rule = card.rule;
  switch (rule.kind) {
    case 'per-factory':
      return rule.points * factoryCount(player);
    case 'per-engineer':
      return rule.points * engineersFor(player);
    case 'per-end-station':
      return rule.points * endStationsReached(player);
    case 'per-track':
      return rule.points * rule.colors.reduce((sum, c) => sum + trackSpacesMoved(player, c), 0);
    case 'keys':
      return tierPoints(rule.tiers, player.keysReceived);
    case 'doublers':
      return tierPoints(rule.tiers, player.doublers);
    case 'per-idea-token':
      return rule.points * player.usedIdeaTokens.length;
    case 'extra-engineer':
      return 0; // no direct VP — it only counts toward the majority + the per-engineer card
    case 'top-locomotives':
      return sumTopLocomotives(player, rule.count);
    case 'per-extra-worker':
      return rule.points * Math.min(Math.max(player.workersTotal - startingWorkers, 0), rule.max);
  }
}

/** The total end-bonus points a player scores from all their held cards (pg. 47). */
export function endBonusScore(player: RussianRailroadsPlayer, startingWorkers: number): number {
  return player.endBonusCards.reduce((sum, card) => sum + scoreEndBonusCard(card, player, startingWorkers), 0);
}

/**
 * The engineer-majority award per player (pg. 22): the player with the most engineers scores 40, the
 * second-most scores 20. **Ties break on the highest engineer number** ("the tied player with the highest
 * number on one of their engineers breaks the tie") — so the eligible players (≥1 engineer) are ordered by
 * `(count desc, highest number desc)` and the first two ranks are awarded (a full strict ordering, since
 * engineer numbers are unique so the tiebreak is always decisive — matching the pg. 22 example: three
 * engineers → 40, and of two tied on two engineers the one holding #13 takes the 20). Players with **no**
 * engineers cannot score (pg. 22). The "extra engineer" end-bonus card counts toward a player's engineer
 * count but carries no number (it never helps the tiebreak).
 */
export function engineerMajority(players: readonly RussianRailroadsPlayer[]): Map<string, number> {
  const ranked = players
    .map((p) => ({ id: p.id, count: engineersFor(p), highest: highestEngineerNumber(p) }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || b.highest - a.highest);
  const out = new Map<string, number>();
  if (ranked[0]) out.set(ranked[0].id, ENGINEER_MAJORITY_FIRST);
  if (ranked[1]) out.set(ranked[1].id, ENGINEER_MAJORITY_SECOND);
  return out;
}

/**
 * Compute every player's final-scoring breakdown (pg. 22): `base` (their cumulative round total), `endBonus`
 * (their revealed end-bonus cards, pg. 47), `majority` (the engineer-majority award), and `total` (the sum).
 * The "extra worker" end-bonus card is sized off `STARTING_WORKERS` for the player count.
 */
export function finalScoring(players: readonly RussianRailroadsPlayer[]): RussianRailroadsResult[] {
  const startingWorkers = STARTING_WORKERS[players.length]!;
  const majority = engineerMajority(players);
  return players.map((p) => {
    const base = p.score;
    const endBonus = endBonusScore(p, startingWorkers);
    const maj = majority.get(p.id) ?? 0;
    return { playerId: p.id, base, endBonus, majority: maj, total: base + endBonus + maj };
  });
}
