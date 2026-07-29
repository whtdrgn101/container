import { Warehouse as WarehouseIcon } from 'lucide-react';
import type { Action, PlayerView } from '../../../engine';
import { ActionTip, Button } from '@game-hub/ui-kit';
import { StoredChip } from '../../chips';
import { CONTAINER_TIPS } from '../../tips';

export interface HarborZoneProps {
  readonly player: PlayerView;
  readonly canHarborBuy: boolean;
  readonly harborPick: readonly number[];
  readonly harborPickCost: number;
  readonly harborPickOk: boolean;
  /** Active + drivable + no forced delivery — gates the build control living in this zone. */
  readonly showControls: boolean;
  readonly can: (type: Action['type']) => boolean;
  readonly nextWarehouseCost: number | undefined;
  readonly busy: boolean;
  readonly act: (playerId: string, action: Action) => void;
  readonly toggleBuy: (district: 'factory' | 'harbor', sellerId: string, index: number) => void;
  readonly commitBuy: () => void;
}

/**
 * The mat's harbor district (2026-07): warehouses, the priced harbor lots, and — on the active mat —
 * Build warehouse, which grows this district so it lives in it. `warehouses`/`harbor-count`/
 * `harbor-chip`/`buy-harbor` testids and the exact "N / M" text are unchanged.
 */
export function HarborZone({
  player,
  canHarborBuy,
  harborPick,
  harborPickCost,
  harborPickOk,
  showControls,
  can,
  nextWarehouseCost,
  busy,
  act,
  toggleBuy,
  commitBuy,
}: HarborZoneProps) {
  return (
    <div className="rounded-lg bg-sky-700/[0.07] p-2 dark:bg-sky-300/[0.06]">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
          <WarehouseIcon className="h-3.5 w-3.5" aria-hidden /> Harbor district
        </span>
        <span data-testid={`harbor-count-${player.id}`}>
          {player.harborStore.length} / {player.harborLimit}
        </span>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1" data-testid={`warehouses-${player.id}`}>
          <WarehouseIcon className="h-3.5 w-3.5" aria-hidden />
          {player.warehouses}
        </span>
        <span>warehouses{canHarborBuy ? ' · lots — click to load ship' : ''}</span>
      </div>
      <div className="flex min-h-9 flex-wrap items-end gap-1.5" data-testid={`harbor-${player.id}`}>
        {player.harborStore.map((container, chipIndex) => (
          <StoredChip
            key={chipIndex}
            container={container}
            testid={`harbor-chip-${player.id}-${chipIndex}`}
            disabled={busy}
            selected={harborPick.includes(chipIndex)}
            tip={canHarborBuy ? CONTAINER_TIPS.buyHarbor : undefined}
            onClick={canHarborBuy ? () => toggleBuy('harbor', player.id, chipIndex) : undefined}
          />
        ))}
      </div>
      {canHarborBuy && harborPick.length > 0 && (
        <ActionTip tip={CONTAINER_TIPS.buyHarbor} className="mt-2 block">
          <Button
            size="sm"
            className="w-full"
            data-testid={`buy-harbor-${player.id}`}
            disabled={busy || !harborPickOk}
            onClick={commitBuy}
          >
            Load {harborPick.length} for ${harborPickCost}
          </Button>
        </ActionTip>
      )}
      {showControls && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <ActionTip tip={CONTAINER_TIPS.buildWarehouse} className="block">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              data-testid="build-warehouse"
              disabled={busy || !can('BUILD_WAREHOUSE')}
              onClick={() => act(player.id, { type: 'BUILD_WAREHOUSE' })}
            >
              <WarehouseIcon className="h-4 w-4" aria-hidden /> Build warehouse
              {nextWarehouseCost !== undefined ? ` ($${nextWarehouseCost})` : ''}
            </Button>
          </ActionTip>
        </div>
      )}
    </div>
  );
}
