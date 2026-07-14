import { DEFAULT_HARBOR_LOT, GameError } from '../core';
import type { GameState, StoredContainer } from '../core';
import { record, removeContainers, seatOf } from '../internal';

/**
 * Factory Purchase action (rulebook pg. 9): buy any number of containers from **one opponent's**
 * factory storage lots (paying them each container's lot price) and truck them into your harbor.
 * `bought` names the seller's containers to buy (color + the lot price you pay). Bought containers
 * land in your harbor at the default $2 lot — reprice the harbor afterwards to set sale prices.
 *
 * Not ship-dependent: containers arrive immediately regardless of where your ship is.
 */
export function factoryPurchase(
  state: GameState,
  buyerId: string,
  sellerId: string,
  bought: readonly StoredContainer[],
): GameState {
  const buyerSeat = seatOf(state, buyerId);
  if (sellerId === buyerId) {
    throw new GameError('NOT_AN_OPPONENT', 'You can only buy from an opponent, not yourself');
  }
  const sellerSeat = seatOf(state, sellerId);
  const buyer = state.players[buyerSeat]!;
  const seller = state.players[sellerSeat]!;

  if (bought.length === 0) {
    throw new GameError('INVALID_SELECTION', 'Buy at least one container');
  }

  const sellerRemaining = removeContainers(seller.factoryStore, bought);
  if (sellerRemaining === null) {
    throw new GameError('INVALID_SELECTION', "Those containers are not in the seller's factory");
  }

  if (buyer.harborStore.length + bought.length > buyer.harborLimit) {
    throw new GameError('STORAGE_LIMIT_EXCEEDED', `Player "${buyerId}" has no harbor room for ${bought.length} container(s)`);
  }

  const cost = bought.reduce((sum, container) => sum + container.price, 0);
  if (buyer.money < cost) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${buyerId}" cannot afford the $${cost} purchase`);
  }

  const placed = bought.map((container) => ({ color: container.color, price: DEFAULT_HARBOR_LOT }));
  const players = state.players.map((player, index) => {
    if (index === buyerSeat) {
      return { ...player, money: player.money - cost, harborStore: [...player.harborStore, ...placed] };
    }
    if (index === sellerSeat) {
      return { ...player, money: player.money + cost, factoryStore: sellerRemaining };
    }
    return player;
  });

  return record(state, players, 'FACTORY_PURCHASE', buyerId, {}, { sellerId, cost, count: bought.length });
}
