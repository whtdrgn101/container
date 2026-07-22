import { GameError } from '../core';
import type { Card, PlayArea } from '../core';

/**
 * Which play-area group a card belongs to (pg. 3: play areas group workers / buildings / aristocrats). A
 * non-trading card sits in its own `kind`; a **trading** card joins the group it upgrades (`tradingGroup`)
 * — a carpenter workshop (green, upgrades workers) into `worker`, Mariinskij (blue) into `building`, an
 * Abbot (orange) into `aristocrat`. This is also the group a trading card **displaces from** (pg. 7 — "a
 * card of the same colour").
 */
export function groupOf(card: Card): 'worker' | 'building' | 'aristocrat' {
  return card.kind === 'trading' ? card.tradingGroup! : card.kind;
}

/**
 * The already-placed cards `tradingCard` may legally displace (pg. 7): cards of its **own colour group** in
 * the player's play area, excluding trading cards ("a trading card cannot displace another trading card").
 * For a **green** worker upgrade the ware symbols must match — carpenter workshop↔lumberjack, gold
 * smelter↔gold miner, weaving mill↔shepherd, fur shop↔fur trapper, wharf↔ship builder — **except** Czar
 * the Carpenter, who "can be displaced by any green trading card" (pg. 8). Blue upgrades displace any
 * building, orange any aristocrat.
 *
 * A **flipped Observatory** (its id in `usedObservatories`, pg. 8, SP5) is excluded — "he may not upgrade
 * it while it is turned over." `usedObservatories` is `state.observatoryUsed`; defaults empty, so callers
 * with no notion of it (tests, SP4) are unchanged.
 */
export function legalDisplaceTargets(
  player: { readonly playArea: PlayArea },
  tradingCard: Card,
  usedObservatories: readonly string[] = [],
): readonly Card[] {
  const group = groupOf(tradingCard);
  return player.playArea[group].filter((target) => {
    if (target.kind === 'trading') return false; // a trading card never displaces another (pg. 7)
    // A flipped Observatory may not be upgraded until it turns face-up next round (pg. 8).
    if (target.special === 'observatory' && usedObservatories.includes(target.id)) return false;
    if (tradingCard.tradingGroup !== 'worker') return true; // blue/orange: any card of the group
    // Green: the ware symbols must match, or the target is the Czar (any green displaces it, pg. 8).
    return target.key === 'czarCarpenter' || target.ware === tradingCard.ware;
  });
}

/**
 * Resolve a displacement target `id` for buying/playing `tradingCard`, returning the card to discard — or
 * throwing `INVALID_DISPLACE_TARGET` when the id names no legal target (stale/wrong id, wrong colour,
 * another trading card, or a green ware mismatch; see `legalDisplaceTargets`).
 */
export function validateDisplacement(
  player: { readonly playArea: PlayArea },
  tradingCard: Card,
  id: string,
  usedObservatories: readonly string[] = [],
): Card {
  const target = legalDisplaceTargets(player, tradingCard, usedObservatories).find((c) => c.id === id);
  if (!target) {
    throw new GameError(
      'INVALID_DISPLACE_TARGET',
      `No card of yours can be displaced by ${tradingCard.name} for target "${id}" (pg. 7)`,
    );
  }
  return target;
}

/**
 * Place `card` into the player's play area (`groupOf`), discarding `displaced` from that same group when a
 * displacement happened (pg. 7). Returns the new play area and how far the discard pile grows (1 when a
 * card was displaced, else 0) — the single home for the swap so `buy` and `playFromHand` stay parallel.
 */
export function placeInPlayArea(
  playArea: PlayArea,
  card: Card,
  displaced?: Card,
): { readonly playArea: PlayArea; readonly discarded: number } {
  const group = groupOf(card);
  const remaining = displaced ? playArea[group].filter((c) => c.id !== displaced.id) : playArea[group];
  return {
    playArea: { ...playArea, [group]: [...remaining, card] } as PlayArea,
    discarded: displaced ? 1 : 0,
  };
}
