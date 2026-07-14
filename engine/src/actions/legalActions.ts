import {
  COLORS,
  FACTORY_BUILD_COSTS,
  MAX_FACTORIES,
  MAX_WAREHOUSES,
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

  return actions;
}
