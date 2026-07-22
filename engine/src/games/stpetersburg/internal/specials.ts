import { POTEMKIN_DISPLACE_VALUE } from '../core';
import type { Card, StPetersburgPlayer, StPetersburgState } from '../core';

// The passive hooks for the six special cards (pg. 7–8, SP5). Each is a tiny pure function so its owning
// mechanic — displacement cost (`buy.ts`), phase scoring (`phase.ts`), the Pub/Observatory interludes —
// reads it in one place. Read the cited sheet panel before touching a value.

/**
 * What a displacement target is *worth* for the difference calculation (pg. 7–8). Normally its printed
 * cost; but **Potjomkin's Village** counts as **6 rubles** when displaced ("if he displaces the card with
 * a trading card, it is worth 6 rubles", pg. 8), not its printed buy cost of 2.
 */
export function displaceValueOf(target: Card): number {
  return target.special === 'potemkin' ? POTEMKIN_DISPLACE_VALUE : target.cost;
}

/**
 * **Mariinskij Theater** bonus at *building* scoring (pg. 7): "When scoring the buildings, the player earns
 * 1 ruble for each aristocrat that he has in his play area." 0 rubles unless the player owns it. Counts
 * every card in the aristocrat group (plain aristocrats *and* orange trading upgrades sit there).
 */
export function mariinskijBonus(player: StPetersburgPlayer): number {
  const owns = player.playArea.building.some((c) => c.special === 'mariinskij');
  return owns ? player.playArea.aristocrat.length : 0;
}

/**
 * **Tax man** bonus at *aristocrat* scoring (pg. 7): "When scoring the aristocrats, the player earns 1
 * ruble for each worker that he has in his play area." 0 rubles unless the player owns it. Counts every
 * card in the worker group (plain workers *and* green trading upgrades sit there).
 */
export function taxmanBonus(player: StPetersburgPlayer): number {
  const owns = player.playArea.aristocrat.some((c) => c.special === 'taxman');
  return owns ? player.playArea.worker.length : 0;
}

/**
 * The **Observatory** cards a player owns that are **not** flipped (used) this round (pg. 8) — the ones
 * still available for the mid-phase draw *and* still scoring their 1 point. `used` is `state.observatoryUsed`.
 */
export function unusedObservatories(player: StPetersburgPlayer, used: readonly string[]): readonly Card[] {
  return player.playArea.building.filter((c) => c.special === 'observatory' && !used.includes(c.id));
}

/**
 * Seats owning at least one **Pub** (pg. 8), in ascending seat order — the queue for the after-building
 * buy-points interlude. **Ruling (documented):** the sheet says "the player can buy up to 5 points" — a
 * *per-player* cap, not per-card — so a seat owning two Pubs still appears **once** (5 points, not 10).
 */
export function pubOwnerSeats(state: StPetersburgState): number[] {
  const seats: number[] = [];
  state.players.forEach((player, seat) => {
    if (player.playArea.building.some((c) => c.special === 'pub')) seats.push(seat);
  });
  return seats;
}
