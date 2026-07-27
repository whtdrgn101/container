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
  | { readonly type: 'FACTORY_PURCHASE'; readonly sellerId: string; readonly bought?: readonly StoredContainer[] }
  | { readonly type: 'HARBOR_PURCHASE'; readonly bought?: readonly StoredContainer[] }
  | { readonly type: 'REQUEST_LOAN' }
  | { readonly type: 'REPAY_LOAN' }
  | {
      readonly type: 'CALL_BANK';
      readonly lotIndex: number;
      readonly lotKind?: 'container' | 'cash';
      /** Cash bid for a container lot. */
      readonly bid?: number;
      /** Containers to bid for a cash lot (removed from your board). */
      readonly containerBid?: readonly StoredContainer[];
    }
  | { readonly type: 'LOAD_FROM_BANK' }
  | {
      readonly type: 'DELIVER';
      readonly bids?: Readonly<Record<string, number>>;
      readonly runoffBids?: Readonly<Record<string, number>>;
      readonly buyout?: boolean;
      /** Deliverer's pick when a runoff leaves bidders still tied (pg. 16). */
      readonly chosenWinnerId?: string;
    }
  | { readonly type: 'END_TURN' };

export type ActionType = Action['type'];
