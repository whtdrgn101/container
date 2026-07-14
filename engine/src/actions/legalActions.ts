import {
  COLORS,
  FACTORY_BUILD_COSTS,
  MAX_FACTORIES,
  MAX_WAREHOUSES,
  SHIP_CAPACITY,
  UNION_WAGE,
  WAREHOUSE_BUILD_COSTS,
} from '../core';
import type { GameState } from '../core';
import type { Action } from './action';

/**
 * Enumerate the actions the active player may legally take right now. Drives the UI (enable/disable)
 * and, later, AI search. END_TURN is always available on your turn. PRODUCE and REPRICE are returned
 * as markers (without placements/arrangement) — the caller supplies those.
 */
export function legalActions(state: GameState): Action[] {
  const player = state.players[state.activePlayerIndex]!;
  const actions: Action[] = [{ type: 'END_TURN' }];

  if (state.actionsRemaining <= 0) {
    return actions;
  }

  if (
    player.factories.length > 0 &&
    player.money >= UNION_WAGE &&
    player.factoryStore.length < player.factoryLimit
  ) {
    actions.push({ type: 'PRODUCE' });
  }

  if (player.factories.length < MAX_FACTORIES) {
    const cost = FACTORY_BUILD_COSTS[player.factories.length - 1]!;
    if (player.money >= cost) {
      const owned = new Set(player.factories.map((factory) => factory.color));
      for (const color of COLORS) {
        if (!owned.has(color) && state.supply.factories[color] > 0) {
          actions.push({ type: 'BUILD_FACTORY', color });
        }
      }
    }
  }

  if (player.warehouses < MAX_WAREHOUSES) {
    const cost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1]!;
    if (player.money >= cost && state.supply.warehouses > 0) {
      actions.push({ type: 'BUILD_WAREHOUSE' });
    }
  }

  if (player.factoryStore.length > 0) {
    actions.push({ type: 'REPRICE', district: 'factory' });
  }
  if (player.harborStore.length > 0) {
    actions.push({ type: 'REPRICE', district: 'harbor' });
  }

  // Sail: from the ocean to any destination (never your own harbor); otherwise back to the ocean.
  if (player.ship.location.kind === 'ocean') {
    for (const opponent of state.players) {
      if (opponent.id !== player.id) {
        actions.push({ type: 'SAIL', to: { kind: 'harbor', playerId: opponent.id } });
      }
    }
    actions.push({ type: 'SAIL', to: { kind: 'island' } });
    actions.push({ type: 'SAIL', to: { kind: 'bank' } });
  } else {
    actions.push({ type: 'SAIL', to: { kind: 'ocean' } });
  }

  // Factory Purchase: buy from any opponent who has factory containers, if you have harbor room.
  if (player.harborStore.length < player.harborLimit) {
    for (const opponent of state.players) {
      if (opponent.id !== player.id && opponent.factoryStore.length > 0) {
        actions.push({ type: 'FACTORY_PURCHASE', sellerId: opponent.id });
      }
    }
  }

  // Harbor Purchase: docked at an opponent whose harbor has containers, and your ship has room.
  const shipLocation = player.ship.location;
  if (shipLocation.kind === 'harbor') {
    const seller = state.players.find((p) => p.id === shipLocation.playerId)!;
    if (seller.harborStore.length > 0 && player.ship.cargo.length < SHIP_CAPACITY) {
      actions.push({ type: 'HARBOR_PURCHASE' });
    }
  }

  return actions;
}
