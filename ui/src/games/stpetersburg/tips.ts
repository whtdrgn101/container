/**
 * Player-facing help text for Saint Petersburg's action spots (the ActionTip / title content). Lives with
 * the game (the GameClient seam). Plain language: what an action does + how its effective cost works.
 * Rulebook pages cited per entry (pg. 2–8).
 */

export const SP_TIPS = {
  // pg. 6 — buy a card at its effective cost (matching cards you own discount it; the lower row is −1₽).
  buy: 'Buy this card into your play area for the shown price — your matching cards and the lower row already discount it.',
  // pg. 7 — a trading card upgrades one of your cards by displacement.
  buyTrading: 'Upgrade one of your cards to this trading card by displacing it, for the shown price.',
  // pg. 3 — take a face-up card into your hand for free (up to your hand limit).
  addHand: 'Take this card into your hand for free; play it from your hand on a later turn.',
  // pg. 5 — passing, and the consequence of everyone passing.
  pass: 'Pass your turn. Once every player passes in a row, this phase scores and the next phase begins.',
  // pg. 8 — the Observatory: draw instead of a normal action (building phase, once per round).
  observatoryDraw:
    'Observatory: draw the top card of this stack instead of a normal action (building phase, once per round).',
  observatoryBuy: 'Buy the drawn card into your play area for the shown price.',
  observatoryHand: 'Add the drawn card to your hand for free.',
  observatoryDiscard: 'Discard the drawn card and take nothing.',
  // pg. 2 — the four-phase round order (the medallion / phase pills).
  phase:
    'Each round runs four phases in order — Worker, Building, Aristocrat, Trading. Every phase pays its matching cards, then players buy from the rows.',
} as const;

/** The Pub interlude (pg. 8): buy up to a few victory points at a fixed price. */
export function pubTip(points: number, cost: number): string {
  return points === 0
    ? 'Decline: buy no points from the Pub.'
    : `Pub: buy ${points} victory point${points === 1 ? '' : 's'} for ${cost}₽.`;
}
