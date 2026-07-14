import type { Color, District, ShipLocation, StoredContainer } from '../core';

/**
 * Everything a player can choose to do. `applyAction` is the turn-aware entry point that validates
 * and applies these. PRODUCE / BUILD_* / REPRICE cost one action; END_TURN ends the turn.
 *
 * `placements` (Produce) and `arrangement` (Reprice) are optional here so `legalActions` can return
 * lightweight availability markers; `applyAction` supplies sensible defaults / requires them.
 */
export type Action =
  | { readonly type: 'PRODUCE'; readonly placements?: readonly StoredContainer[] }
  | { readonly type: 'BUILD_FACTORY'; readonly color: Color }
  | { readonly type: 'BUILD_WAREHOUSE' }
  | { readonly type: 'REPRICE'; readonly district: District; readonly arrangement?: readonly StoredContainer[] }
  | { readonly type: 'SAIL'; readonly to: ShipLocation }
  | { readonly type: 'END_TURN' };

export type ActionType = Action['type'];
