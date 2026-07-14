import { Factory as FactoryIcon, Plus, Warehouse as WarehouseIcon } from 'lucide-react';
import { useState } from 'react';
import type { Action, Color, GameState, StoredContainer } from '@container/engine';
import { FACTORY_BUILD_COSTS, FACTORY_LOT_PRICES, legalActions, WAREHOUSE_BUILD_COSTS } from '@container/engine';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import * as api from '@/lib/api';

/** Display colors for the five container types (see engine COLORS). */
const COLOR_HEX: Record<Color, string> = {
  white: '#f8fafc',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#eab308',
};

const DEFAULT_NAMES = ['Ann', 'Bob', 'Cid'];

/** Next factory lot price, wrapping around the track. */
function nextFactoryLot(price: number): number {
  const index = FACTORY_LOT_PRICES.indexOf(price as (typeof FACTORY_LOT_PRICES)[number]);
  return FACTORY_LOT_PRICES[(index + 1) % FACTORY_LOT_PRICES.length]!;
}

function StoredChip({
  container,
  testid,
  onClick,
  disabled,
}: {
  container: StoredContainer;
  testid: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const swatch = (
    <span
      className="h-4 w-6 rounded-sm border border-black/20 shadow-sm"
      style={{ backgroundColor: COLOR_HEX[container.color] }}
    />
  );
  const label = <span className="text-[10px] leading-none tabular-nums text-muted-foreground">${container.price}</span>;
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testid}
        title={`Reprice ${container.color} (1 action)`}
        disabled={disabled}
        onClick={onClick}
        className="flex flex-col items-center gap-0.5 rounded transition-transform hover:scale-110 disabled:opacity-50"
      >
        {swatch}
        {label}
      </button>
    );
  }
  return (
    <span data-testid={testid} className="flex flex-col items-center gap-0.5">
      {swatch}
      {label}
    </span>
  );
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [produceLot, setProduceLot] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<GameState>) {
    setBusy(true);
    setError(null);
    try {
      setGame(await work());
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const legal = game ? legalActions(game) : [];
  const can = (type: Action['type']) => legal.some((action) => action.type === type);
  const buildableColors = legal
    .filter((action): action is Extract<Action, { type: 'BUILD_FACTORY' }> => action.type === 'BUILD_FACTORY')
    .map((action) => action.color);

  function act(playerId: string, action: Action) {
    if (!game) return;
    void run(() => api.applyAction(game.id, playerId, action));
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Container</h1>
          {game && (
            <div className="flex items-center gap-3">
              <span data-testid="turn-info" className="text-sm text-muted-foreground">
                Turn {game.turn} · <span className="font-medium text-foreground">{game.players[game.activePlayerIndex]?.name}</span>{' '}
                · {game.actionsRemaining} action{game.actionsRemaining === 1 ? '' : 's'} left
              </span>
              <Button variant="outline" size="sm" data-testid="new-game" onClick={() => setGame(null)}>
                New game
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <p
            role="alert"
            data-testid="error"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {game ? (
          <section
            aria-label="Player boards"
            data-testid="board"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {game.players.map((player, index) => {
              const isActive = index === game.activePlayerIndex;
              const nextFactoryCost = FACTORY_BUILD_COSTS[player.factories.length - 1];
              const nextWarehouseCost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1];
              const capacity = Math.min(player.factories.length, player.factoryLimit - player.factoryStore.length);
              const canReprice = isActive && can('REPRICE') && !busy;
              return (
                <Card
                  key={player.id}
                  data-testid={`player-card-${player.id}`}
                  data-active={isActive}
                  className={cn(isActive && 'ring-2 ring-ring')}
                >
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{player.name}</CardTitle>
                    <span
                      data-testid={`money-${player.id}`}
                      className="rounded-full bg-secondary px-2 py-0.5 text-sm font-medium tabular-nums"
                    >
                      ${player.money}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <FactoryIcon className="h-4 w-4" aria-hidden />
                      <span>Factories</span>
                      {player.factories.map((factory) => (
                        <span
                          key={factory.id}
                          className="h-4 w-6 rounded-sm border border-black/20 shadow-sm"
                          style={{ backgroundColor: COLOR_HEX[factory.color] }}
                          title={factory.color}
                        />
                      ))}
                      <span className="ml-auto inline-flex items-center gap-1" data-testid={`warehouses-${player.id}`}>
                        <WarehouseIcon className="h-4 w-4" aria-hidden />
                        {player.warehouses}
                      </span>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Factory store{isActive && canReprice ? ' (click to reprice)' : ''}</span>
                        <span data-testid={`store-count-${player.id}`}>
                          {player.factoryStore.length} / {player.factoryLimit}
                        </span>
                      </div>
                      <div className="flex min-h-8 flex-wrap items-end gap-2" data-testid={`store-${player.id}`}>
                        {player.factoryStore.map((container, chipIndex) => (
                          <StoredChip
                            key={chipIndex}
                            container={container}
                            testid={`store-chip-${player.id}-${chipIndex}`}
                            disabled={busy}
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
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    </div>

                    {isActive && (
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

                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">
                            Build factory{nextFactoryCost !== undefined ? ` ($${nextFactoryCost})` : ''}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {buildableColors.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              buildableColors.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  data-testid={`build-factory-${color}`}
                                  title={`Build ${color} factory`}
                                  disabled={busy}
                                  onClick={() => act(player.id, { type: 'BUILD_FACTORY', color })}
                                  className="h-7 w-9 rounded border border-black/20 shadow-sm transition-transform hover:scale-105 disabled:opacity-50"
                                  style={{ backgroundColor: COLOR_HEX[color] }}
                                />
                              ))
                            )}
                          </div>
                        </div>

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
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ) : (
          <Card className="mx-auto max-w-md">
            <CardHeader>
              <CardTitle>New game</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {names.map((name, index) => (
                <input
                  // eslint-disable-next-line react/no-array-index-key -- fixed-length setup form
                  key={index}
                  aria-label={`Player ${index + 1} name`}
                  data-testid={`player-name-${index}`}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={name}
                  onChange={(event) =>
                    setNames((prev) => prev.map((value, j) => (j === index ? event.target.value : value)))
                  }
                />
              ))}
              <Button
                className="w-full"
                data-testid="start-game"
                disabled={busy}
                onClick={() => void run(() => api.createGame(names.map((name) => ({ name }))))}
              >
                Start game
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
