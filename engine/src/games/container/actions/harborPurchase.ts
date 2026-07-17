import { GameError, SHIP_CAPACITY } from '../core';
import type { GameState, StoredContainer } from '../core';
import { record, removeContainers, seatOf } from '../internal';

/**
 * Harbor Purchase action (rulebook pg. 9): your ship must be docked at an opponent's harbor. Buy any
 * number of containers from that harbor (paying the owner each container's lot price) and load them
 * onto your ship. The ship holds at most SHIP_CAPACITY (5) containers — no way to increase it.
 *
 * The seller is whichever harbor your ship is docked at. `bought` names the harbor containers to buy.
 */
export function harborPurchase(state: GameState, buyerId: string, bought: readonly StoredContainer[]): GameState {
  const buyerSeat = seatOf(state, buyerId);
  const buyer = state.players[buyerSeat]!;

  const location = buyer.ship.location;
  if (location.kind !== 'harbor') {
    throw new GameError('SHIP_NOT_DOCKED', `Player "${buyerId}"'s ship is not docked at a harbor`);
  }
  const sellerSeat = seatOf(state, location.playerId);
  const seller = state.players[sellerSeat]!;

  if (bought.length === 0) {
    throw new GameError('INVALID_SELECTION', 'Buy at least one container');
  }

  const sellerRemaining = removeContainers(seller.harborStore, bought);
  if (sellerRemaining === null) {
    throw new GameError('INVALID_SELECTION', "Those containers are not in the seller's harbor");
  }

  if (buyer.ship.cargo.length + bought.length > SHIP_CAPACITY) {
    throw new GameError('SHIP_CAPACITY_EXCEEDED', `A ship can hold at most ${SHIP_CAPACITY} containers`);
  }

  const cost = bought.reduce((sum, container) => sum + container.price, 0);
  if (buyer.money < cost) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${buyerId}" cannot afford the $${cost} purchase`);
  }

  const loaded = bought.map((container) => container.color);
  const players = state.players.map((player, index) => {
    if (index === buyerSeat) {
      return { ...player, money: player.money - cost, ship: { ...player.ship, cargo: [...player.ship.cargo, ...loaded] } };
    }
    if (index === sellerSeat) {
      return { ...player, money: player.money + cost, harborStore: sellerRemaining };
    }
    return player;
  });

  return record(state, players, 'HARBOR_PURCHASE', buyerId, {}, { sellerId: location.playerId, cost, count: bought.length });
}
