import type { ShipLocation } from '../engine';

/**
 * Player-facing help text for Container's action spots (the ActionTip content). Lives with the game
 * (the GameClient seam — a game's own vocabulary stays inside its folder). Plain language: what the
 * action does + its cost. Rulebook pages cited per entry (Container_Rulebook_v8.pdf).
 */

type LocationKind = ShipLocation['kind'];

/** The seven turn actions + the two free anchor actions (pg. 6–14). */
export const CONTAINER_TIPS = {
  // pg. 9 — Produce: one container per factory into a chosen price lot, drawn from the supply.
  produce: 'Produce (1 action): make one container per factory into the chosen price lot, from the shared supply.',
  // pg. 8 — Build: pay the shown cost to add a factory (its colour) or a warehouse (harbor storage).
  buildFactory:
    'Build a factory (1 action): pay the shown cost to add a factory. It produces that colour of container.',
  buildWarehouse: 'Build a warehouse (1 action): pay the shown cost to expand your harbor storage.',
  // pg. 10 — Reprice: you set your own prices; opponents choose whether to buy.
  reprice: 'Reprice (1 action): move this lot to another price. You price your goods; opponents decide whether to buy.',
  // pg. 11 — Factory Purchase: an opponent's factory goods → your harbor, by truck.
  buyFactory: "Factory Purchase (1 action): buy these containers from an opponent's factory into your harbor.",
  // pg. 12 — Harbor Purchase: an opponent's harbor goods → your docked ship.
  buyHarbor: "Harbor Purchase (1 action): load these containers from an opponent's harbor onto your ship.",
  // pg. 13 — a free anchor action: pick up containers you won at the Bank.
  loadBank: 'Load the containers you won at the Bank onto your ship (free).',
  // pg. 16 — Off-Shore Bank loans: $10 in, $1/turn interest, $11 to repay.
  requestLoan: 'Take a $10 loan. You pay $1 interest per loan each turn, and repay $11 at the end.',
  repayLoan: 'Repay a loan ($11) to stop its $1-per-turn interest.',
  // The turn's end (pg. 6): interest is charged, and unused actions are lost.
  endTurn: 'End your turn. Any unused actions are lost; loan interest is charged at each turn start.',
  // pg. 16 — Call Bank on a container lot: bid cash; highest bid at your next turn start wins it.
  bankContainerLot: 'Call Bank: bid cash to win this container lot. The highest bid at your next turn start wins it.',
  bankContainerOutbid: 'Outbid the current leader for this container lot (you must beat their cash bid).',
  // pg. 16 — Call Bank on a cash lot: bid containers off your board; most bid wins the cash.
  bankCashLot: 'Call Bank: bid containers off your board to win this cash. The most bid at your next turn start wins.',
  bankCashOutbid: 'Outbid the current leader for this cash lot (you must bid more containers).',
} as const;

/** A location's help as a static board node (BoardMap), describing what happens there. */
export function nodeTip(kind: LocationKind): string {
  switch (kind) {
    case 'island':
      // pg. 14 — the delivery auction and its matching subsidy.
      return 'Container Island: sail a loaded ship here for a delivery auction — opponents bid, the highest wins your cargo, and you earn the bid plus a matching government subsidy.';
    case 'bank':
      return 'Off-Shore Bank: take loans and bid in Bank auctions here.';
    case 'ocean':
      return 'Open ocean: the sea lane between the harbors, the island, and the Bank.';
    case 'harbor':
      // pg. 12 — you can never buy your own; you sail to an opponent's harbor.
      return "A harbor: sail here to buy that player's harbor goods onto your ship (never your own).";
  }
}

/** A sail button's help (DockZone) — the same destinations, phrased as the move. */
export function sailTip(kind: LocationKind): string {
  switch (kind) {
    case 'island':
      return 'Sail to Container Island (1 action) to deliver your cargo in an auction.';
    case 'bank':
      return 'Sail to the Off-Shore Bank (1 action) for loans and auctions.';
    case 'ocean':
      return 'Sail to the open ocean (1 action).';
    case 'harbor':
      return "Sail to this harbor (1 action) to load the harbor's goods onto your ship.";
  }
}
