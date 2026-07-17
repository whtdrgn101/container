import { Plus, Ship as ShipIcon, Warehouse as WarehouseIcon } from 'lucide-react';
import type { Action, PlayerView } from '@game-hub/engine/container';
import { FACTORY_LOT_PRICES } from '@game-hub/engine/container';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sailTarget } from '../chips';

export interface ActionControlsProps {
  readonly player: PlayerView;
  readonly players: readonly PlayerView[];
  readonly capacity: number;
  readonly nextWarehouseCost: number | undefined;
  readonly sailActions: readonly Extract<Action, { type: 'SAIL' }>[];
  readonly can: (type: Action['type']) => boolean;
  readonly busy: boolean;
  readonly produceLot: number;
  readonly setProduceLot: (price: number) => void;
  readonly act: (playerId: string, action: Action) => void;
}

export function ActionControls({
  player,
  players,
  capacity,
  nextWarehouseCost,
  sailActions,
  can,
  busy,
  produceLot,
  setProduceLot,
  act,
}: ActionControlsProps) {
  return (
    <div className="space-y-2 border-t pt-3" data-testid="controls">
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Produce into lot</div>
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
      </div>

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

      <div>
        <div className="mb-1 text-xs text-muted-foreground">Sail to</div>
        <div className="flex flex-wrap gap-1">
          {sailActions.map((sailAction) => {
            const target = sailTarget(sailAction.to, players);
            return (
              <Button
                key={target.testid}
                size="sm"
                variant="outline"
                data-testid={target.testid}
                disabled={busy}
                onClick={() => act(player.id, sailAction)}
              >
                <ShipIcon className="h-4 w-4" aria-hidden /> {target.label}
              </Button>
            );
          })}
        </div>
      </div>

      {(can('REQUEST_LOAN') || can('REPAY_LOAN')) && (
        <div className="flex gap-2">
          {can('REQUEST_LOAN') && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              data-testid="request-loan"
              disabled={busy}
              onClick={() => act(player.id, { type: 'REQUEST_LOAN' })}
            >
              Take loan +$10
            </Button>
          )}
          {can('REPAY_LOAN') && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              data-testid="repay-loan"
              disabled={busy}
              onClick={() => act(player.id, { type: 'REPAY_LOAN' })}
            >
              Repay −$10
            </Button>
          )}
        </div>
      )}

      {can('LOAD_FROM_BANK') && (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          data-testid="load-bank"
          disabled={busy}
          onClick={() => act(player.id, { type: 'LOAD_FROM_BANK' })}
        >
          Load ship from Bank holding
        </Button>
      )}

      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        data-testid="end-turn"
        disabled={busy}
        onClick={() => act(player.id, { type: 'END_TURN' })}
      >
        End turn
      </Button>
    </div>
  );
}
