import { Factory as FactoryIcon, Plus } from 'lucide-react';
import type { Action, PlayerView } from '../../../engine';
import { FACTORY_LOT_PRICES } from '../../../engine';
import { ActionTip, Button, cn } from '@game-hub/ui-kit';
import { ContainerChip, nextFactoryLot, StoredChip } from '../../chips';
import { CONTAINER_TIPS } from '../../tips';

export interface FactoryZoneProps {
  readonly player: PlayerView;
  readonly canReprice: boolean;
  readonly canFactoryBuy: boolean;
  readonly factoryPick: readonly number[];
  readonly factoryPickCost: number;
  readonly factoryPickOk: boolean;
  /** Active + drivable + no forced delivery — gates the produce controls living in this zone. */
  readonly showControls: boolean;
  readonly can: (type: Action['type']) => boolean;
  readonly capacity: number;
  readonly produceLot: number;
  readonly setProduceLot: (price: number) => void;
  readonly busy: boolean;
  readonly act: (playerId: string, action: Action) => void;
  readonly toggleBuy: (district: 'factory' | 'harbor', sellerId: string, index: number) => void;
  readonly commitBuy: () => void;
}

/**
 * The mat's factory district (2026-07): the player's factories, their priced store lots, and — on
 * the active mat — the Produce controls, which act on this district so they live in it. The lot
 * click is reprice on your own mat, buy-selection on an opponent's; `store-count`/`store-chip`/
 * `buy-factory` testids and the exact "N / M" text are unchanged.
 */
export function FactoryZone({
  player,
  canReprice,
  canFactoryBuy,
  factoryPick,
  factoryPickCost,
  factoryPickOk,
  showControls,
  can,
  capacity,
  produceLot,
  setProduceLot,
  busy,
  act,
  toggleBuy,
  commitBuy,
}: FactoryZoneProps) {
  return (
    <div className="rounded-lg bg-amber-600/[0.07] p-2 dark:bg-amber-300/[0.06]">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-semibold uppercase tracking-wide text-[10px]">
          <FactoryIcon className="h-3.5 w-3.5" aria-hidden /> Factory district
        </span>
        <span data-testid={`store-count-${player.id}`}>
          {player.factoryStore.length} / {player.factoryLimit}
        </span>
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {player.factories.map((factory) => (
          <ContainerChip key={factory.id} color={factory.color} className="h-3.5 w-5 opacity-90" />
        ))}
        <span className="text-[10px] text-muted-foreground">
          {canReprice ? 'lots — click to reprice' : canFactoryBuy ? 'lots — click to buy' : 'lots'}
        </span>
      </div>
      <div className="flex min-h-9 flex-wrap items-end gap-1.5" data-testid={`store-${player.id}`}>
        {player.factoryStore.map((container, chipIndex) => (
          <StoredChip
            key={chipIndex}
            container={container}
            testid={`store-chip-${player.id}-${chipIndex}`}
            disabled={busy}
            selected={factoryPick.includes(chipIndex)}
            tip={canReprice ? CONTAINER_TIPS.reprice : canFactoryBuy ? CONTAINER_TIPS.buyFactory : undefined}
            onClick={
              canReprice
                ? () =>
                    act(player.id, {
                      type: 'REPRICE',
                      district: 'factory',
                      arrangement: player.factoryStore.map((current, i) =>
                        i === chipIndex ? { color: current.color, price: nextFactoryLot(current.price) } : current,
                      ),
                    })
                : canFactoryBuy
                  ? () => toggleBuy('factory', player.id, chipIndex)
                  : undefined
            }
          />
        ))}
      </div>
      {canFactoryBuy && factoryPick.length > 0 && (
        <ActionTip tip={CONTAINER_TIPS.buyFactory} className="mt-2 block">
          <Button
            size="sm"
            className="w-full"
            data-testid={`buy-factory-${player.id}`}
            disabled={busy || !factoryPickOk}
            onClick={commitBuy}
          >
            Buy {factoryPick.length} for ${factoryPickCost}
          </Button>
        </ActionTip>
      )}
      {showControls && (
        <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
          <div className="flex flex-wrap gap-1">
            {FACTORY_LOT_PRICES.map((price) => (
              <button
                key={price}
                type="button"
                data-testid={`produce-lot-${price}`}
                onClick={() => setProduceLot(price)}
                className={cn(
                  'h-7 w-9 rounded border text-xs tabular-nums',
                  produceLot === price ? 'bg-primary text-primary-foreground' : 'bg-background',
                )}
              >
                ${price}
              </button>
            ))}
          </div>
          <ActionTip tip={CONTAINER_TIPS.produce} className="block">
            <Button
              size="sm"
              className="w-full"
              data-testid={`produce-${player.id}`}
              disabled={busy || !can('PRODUCE')}
              onClick={() =>
                act(player.id, {
                  type: 'PRODUCE',
                  placements: player.factories.slice(0, capacity).map((f) => ({ color: f.color, price: produceLot })),
                })
              }
            >
              <Plus className="h-4 w-4" aria-hidden /> Produce into ${produceLot}
            </Button>
          </ActionTip>
        </div>
      )}
    </div>
  );
}
