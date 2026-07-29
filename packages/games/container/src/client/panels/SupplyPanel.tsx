import { Factory as FactoryIcon, Warehouse as WarehouseIcon } from 'lucide-react';
import type { Action, Color, GameView, PlayerView } from '../../engine';
import { COLORS } from '../../engine';
import { ContainerChip } from '../chips';
import { CONTAINER_TIPS } from '../tips';
import { ActionTip, Button, Card, CardContent, cn } from '@game-hub/ui-kit';

export interface SupplyPanelProps {
  readonly game: GameView;
  readonly activePlayer: PlayerView | undefined;
  readonly canDrive: boolean;
  readonly busy: boolean;
  /** How many container colors are exhausted — the end-game clock (game ends at 2). */
  readonly containersGone: number;
  readonly buildableColors: readonly Color[];
  readonly buildColor: Color | null;
  readonly setBuildColor: (color: Color) => void;
  readonly nextFactoryCost: number | undefined;
  readonly act: (playerId: string, action: Action) => void;
}

/** Container/factory/warehouse supply, doubling as the color picker for Build factory. */
export function SupplyPanel({
  game,
  activePlayer,
  canDrive,
  busy,
  containersGone,
  buildableColors,
  buildColor,
  setBuildColor,
  nextFactoryCost,
  act,
}: SupplyPanelProps) {
  return (
    <Card className="mb-4" data-testid="supply">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-medium">Containers left</span>
          {COLORS.map((color) => {
            const count = game.supply.containers[color];
            return (
              <span
                key={color}
                data-testid={`supply-container-${color}`}
                title={`${color}: ${count} left in the supply`}
                className={cn(
                  'flex items-center gap-1 text-xs tabular-nums',
                  count === 0 && 'font-semibold text-destructive',
                )}
              >
                <ContainerChip color={color} />×{count}
              </span>
            );
          })}
          <span className="text-xs text-muted-foreground" data-testid="endgame-hint">
            {containersGone === 0
              ? 'Game ends when 2 colors run out'
              : `${containersGone}/2 colors exhausted — game ends at 2`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Factory supply</span>
            {COLORS.map((color) => {
              const count = game.supply.factories[color];
              const selectable = buildableColors.includes(color) && !busy;
              return (
                <button
                  key={color}
                  type="button"
                  data-testid={`supply-factory-${color}`}
                  title={`${color}: ${count} available`}
                  disabled={!selectable}
                  onClick={() => setBuildColor(color)}
                  className={cn(
                    'flex items-center gap-1 rounded border px-1.5 py-1 text-xs tabular-nums transition-colors',
                    selectable ? 'hover:bg-accent' : 'opacity-40',
                    buildColor === color && 'ring-2 ring-ring',
                  )}
                >
                  <ContainerChip color={color} />×{count}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <WarehouseIcon className="h-4 w-4" aria-hidden />
            <span data-testid="supply-warehouses">Warehouses: {game.supply.warehouses}</span>
          </div>

          {activePlayer &&
            canDrive &&
            buildColor &&
            buildableColors.includes(buildColor) &&
            nextFactoryCost !== undefined && (
              <ActionTip tip={CONTAINER_TIPS.buildFactory} className="sm:ml-auto">
                <Button
                  size="sm"
                  data-testid="build-factory"
                  disabled={busy}
                  onClick={() => act(activePlayer.id, { type: 'BUILD_FACTORY', color: buildColor })}
                >
                  <FactoryIcon className="h-4 w-4" aria-hidden /> Build {buildColor} factory (${nextFactoryCost})
                </Button>
              </ActionTip>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
