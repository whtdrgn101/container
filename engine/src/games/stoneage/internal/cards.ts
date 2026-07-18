import { CARD_COST, CARD_PLACES, CIV_CARD_DECK, CIV_CARD_SLOTS, RESOURCES } from '../core';
import type { CardPlaceId, CivCard, PlaceId, Resource, StoneAgePlayer } from '../core';
import { totalPaid } from './buildings';
import type { Payment } from './buildings';
import { addTool } from './tools';

/** Type guard: is this place one of the civilization-card slots? */
export function isCardPlace(place: PlaceId): place is CardPlaceId {
  return (CARD_PLACES as readonly PlaceId[]).includes(place);
}

/** The display index (0-based) behind a card slot id — `card1` → 0. */
export function cardIndex(place: CardPlaceId): number {
  return CARD_PLACES.indexOf(place);
}

/** The card slot id for a display index — 0 → `card1`. */
export function cardPlaceId(index: number): CardPlaceId {
  return CARD_PLACES[index]!;
}

/** Look up a card by id (from the fixed deck) — used at final scoring to read acquired cards' scoring. */
export function civCardById(id: string): CivCard {
  return CIV_CARD_DECK.find((card) => card.id === id)!;
}

/**
 * Shuffle the civilization deck (Fisher–Yates on the injected rng) and deal the 4-slot display off the
 * top (pg. 3, setup step 8). Without an rng the deck order is kept — deterministic, for tests. Returns
 * the display and the remaining draw pile.
 */
export function dealCards(rng?: () => number): { display: (CivCard | null)[]; deck: CivCard[] } {
  const deck = [...CIV_CARD_DECK];
  if (rng) {
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const swap = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = swap;
    }
  }
  const display = deck.splice(0, CIV_CARD_SLOTS);
  return { display, deck };
}

/**
 * Refill the display for a new round (pg. 7, "New round"): slide the remaining cards left to the cheap
 * end (preserving order), then draw from the deck into the empty slots left-to-right. Returns the new
 * display and the drawn-down deck.
 */
export function refillDisplay(
  display: readonly (CivCard | null)[],
  deck: readonly CivCard[],
): { display: (CivCard | null)[]; deck: CivCard[] } {
  const kept = display.filter((card): card is CivCard => card !== null);
  const draw = [...deck];
  const next: (CivCard | null)[] = [];
  for (let i = 0; i < CIV_CARD_SLOTS; i += 1) {
    next.push(kept[i] ?? draw.shift() ?? null);
  }
  return { display: next, deck: draw };
}

/**
 * Why `payment` can't buy the card in `slot`, or `null` if it's legal (pg. 6). A card costs a *number*
 * of resources (its position, `CARD_COST[slot]`) of any kinds the player chooses — never food — and the
 * player must own them.
 */
export function cardPaymentError(slot: number, payment: Payment, player: StoneAgePlayer): string | null {
  for (const r of RESOURCES) {
    const n = payment[r] ?? 0;
    if (!Number.isInteger(n) || n < 0) return `Payment of ${r} must be a whole number`;
    if (n > player.resources[r]) return `Not enough ${r} to pay for this card`;
  }
  if (totalPaid(payment) !== CARD_COST[slot]) return `This card costs exactly ${CARD_COST[slot]} resources`;
  return null;
}

/** Apply a card's immediate effect to a player (pg. 6), returning the updated player. */
export function applyCardEffect(player: StoneAgePlayer, card: CivCard): StoneAgePlayer {
  const effect = card.effect;
  switch (effect.kind) {
    case 'resource': {
      const resource: Resource = effect.resource;
      return { ...player, resources: { ...player.resources, [resource]: player.resources[resource] + effect.amount } };
    }
    case 'food':
      return { ...player, food: player.food + effect.amount };
    case 'foodTrack':
      return { ...player, foodTrack: player.foodTrack + effect.amount };
    case 'points':
      return { ...player, score: player.score + effect.amount };
    case 'tool': {
      const tools = addTool(player.tools);
      const toolsUsed = tools.length > player.tools.length ? [...player.toolsUsed, false] : player.toolsUsed;
      return { ...player, tools, toolsUsed };
    }
    default: // 'none'
      return player;
  }
}
