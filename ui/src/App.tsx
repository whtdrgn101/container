import { Factory as FactoryIcon, Plus, Ship as ShipIcon, Warehouse as WarehouseIcon } from 'lucide-react';
import { useState } from 'react';
import type { Action, Color, GameState, PlayerState, ShipLocation, StoredContainer } from '@container/engine';
import {
  COLORS,
  FACTORY_BUILD_COSTS,
  FACTORY_LOT_PRICES,
  legalActions,
  SHIP_CAPACITY,
  WAREHOUSE_BUILD_COSTS,
} from '@container/engine';
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

const nameOf = (players: readonly PlayerState[], id: string) => players.find((p) => p.id === id)?.name ?? id;

/** Human-readable ship location, e.g. "Ocean" or "Bob's harbor". */
function shipLabel(location: ShipLocation, players: readonly PlayerState[]): string {
  switch (location.kind) {
    case 'ocean':
      return 'Ocean';
    case 'island':
      return 'Container Island';
    case 'bank':
      return 'Off-Shore Bank';
    case 'harbor':
      return `${nameOf(players, location.playerId)}'s harbor`;
  }
}

/** Short label + testid suffix for a sail button target. */
function sailTarget(location: ShipLocation, players: readonly PlayerState[]): { label: string; testid: string } {
  switch (location.kind) {
    case 'ocean':
      return { label: 'Ocean', testid: 'sail-ocean' };
    case 'island':
      return { label: 'Island', testid: 'sail-island' };
    case 'bank':
      return { label: 'Bank', testid: 'sail-bank' };
    case 'harbor':
      return { label: nameOf(players, location.playerId), testid: `sail-harbor-${location.playerId}` };
  }
}

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
  selected,
}: {
  container: StoredContainer;
  testid: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const swatch = (
    <span
      className={cn(
        'h-4 w-6 rounded-sm border border-black/20 shadow-sm',
        selected && 'ring-2 ring-ring ring-offset-1',
      )}
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
  // Which containers the active player has selected to buy (one district, one seller at a time).
  const [pick, setPick] = useState<{ district: 'factory' | 'harbor'; sellerId: string; indices: number[] } | null>(null);
  // Which factory color the active player has selected to build from the shared supply.
  const [buildColor, setBuildColor] = useState<Color | null>(null);
  // Opponents' bids in a delivery auction (and runoff bids on a tie), keyed by player id.
  const [bids, setBids] = useState<Record<string, number>>({});
  const [runoffBids, setRunoffBids] = useState<Record<string, number>>({});

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
  const sailActions = legal.filter((action): action is Extract<Action, { type: 'SAIL' }> => action.type === 'SAIL');
  const activePlayer = game ? game.players[game.activePlayerIndex] : undefined;
  const nextFactoryCost = activePlayer ? FACTORY_BUILD_COSTS[activePlayer.factories.length - 1] : undefined;
  const containersGone = game ? COLORS.filter((color) => game.supply.containers[color] === 0).length : 0;
  const mustDeliverNow =
    !!activePlayer && activePlayer.ship.location.kind === 'island' && activePlayer.ship.cargo.length > 0;
  const auctionOpponents = game && activePlayer ? game.players.filter((p) => p.id !== activePlayer.id) : [];
  const maxBid = auctionOpponents.length > 0 ? Math.max(0, ...auctionOpponents.map((o) => bids[o.id] ?? 0)) : 0;
  const tiedBidderIds = auctionOpponents.filter((o) => (bids[o.id] ?? 0) === maxBid).map((o) => o.id);
  const runoffNeeded = mustDeliverNow && maxBid > 0 && tiedBidderIds.length >= 2;
  const winningBidPreview = runoffNeeded
    ? Math.max(0, ...tiedBidderIds.map((id) => (bids[id] ?? 0) + (runoffBids[id] ?? 0)))
    : maxBid;

  function act(playerId: string, action: Action) {
    if (!game) return;
    setPick(null);
    setBuildColor(null);
    void run(() => api.applyAction(game.id, playerId, action));
  }

  /** Toggle a container into/out of the current buy selection. */
  function toggleBuy(district: 'factory' | 'harbor', sellerId: string, index: number) {
    setPick((prev) => {
      if (!prev || prev.district !== district || prev.sellerId !== sellerId) {
        return { district, sellerId, indices: [index] };
      }
      const indices = prev.indices.includes(index)
        ? prev.indices.filter((i) => i !== index)
        : [...prev.indices, index];
      return indices.length ? { district, sellerId, indices } : null;
    });
  }

  /** Resolve the delivery auction with the entered bids — accept the high bid, or buy out (ends the turn). */
  function submitDelivery(buyout = false) {
    if (!game || !activePlayer) return;
    const action: Action = {
      type: 'DELIVER',
      bids,
      ...(runoffNeeded ? { runoffBids } : {}),
      ...(buyout ? { buyout: true } : {}),
    };
    setPick(null);
    setBuildColor(null);
    setBids({});
    setRunoffBids({});
    void run(() => api.applyAction(game.id, activePlayer.id, action));
  }

  /** Buy every selected container from the seller in a single action. */
  function commitBuy() {
    if (!game || !pick) return;
    const active = game.players[game.activePlayerIndex];
    const seller = game.players.find((p) => p.id === pick.sellerId);
    if (!active || !seller) return;
    const store = pick.district === 'factory' ? seller.factoryStore : seller.harborStore;
    const bought = pick.indices
      .map((i) => store[i])
      .filter((c): c is StoredContainer => c !== undefined)
      .map((c) => ({ color: c.color, price: c.price }));
    const action: Action =
      pick.district === 'factory'
        ? { type: 'FACTORY_PURCHASE', sellerId: pick.sellerId, bought }
        : { type: 'HARBOR_PURCHASE', bought };
    setPick(null);
    void run(() => api.applyAction(game.id, active.id, action));
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
          <>
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
                        <span
                          className="h-4 w-6 rounded-sm border border-black/20"
                          style={{ backgroundColor: COLOR_HEX[color] }}
                        />
                        ×{count}
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
                          <span
                            className="h-4 w-6 rounded-sm border border-black/20"
                            style={{ backgroundColor: COLOR_HEX[color] }}
                          />
                          ×{count}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <WarehouseIcon className="h-4 w-4" aria-hidden />
                    <span data-testid="supply-warehouses">Warehouses: {game.supply.warehouses}</span>
                  </div>

                  {activePlayer && buildColor && buildableColors.includes(buildColor) && nextFactoryCost !== undefined && (
                    <Button
                      size="sm"
                      className="sm:ml-auto"
                      data-testid="build-factory"
                      disabled={busy}
                      onClick={() => act(activePlayer.id, { type: 'BUILD_FACTORY', color: buildColor })}
                    >
                      <FactoryIcon className="h-4 w-4" aria-hidden /> Build {buildColor} factory (${nextFactoryCost})
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <section
              aria-label="Player boards"
              data-testid="board"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
            {game.players.map((player, index) => {
              const isActive = index === game.activePlayerIndex;
              const nextWarehouseCost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1];
              const capacity = Math.min(player.factories.length, player.factoryLimit - player.factoryStore.length);
              const canReprice = isActive && can('REPRICE') && !busy;

              // Buying is done by the active player from THIS card's player (an opponent).
              const active = game.players[game.activePlayerIndex]!;
              const canFactoryBuy =
                !isActive &&
                !busy &&
                legal.some((a) => a.type === 'FACTORY_PURCHASE' && a.sellerId === player.id) &&
                active.harborStore.length < active.harborLimit;
              const activeShipLoc = active.ship.location;
              const canHarborBuy =
                !isActive &&
                !busy &&
                activeShipLoc.kind === 'harbor' &&
                activeShipLoc.playerId === player.id &&
                active.ship.cargo.length < SHIP_CAPACITY &&
                player.harborStore.length > 0;

              // Current buy selection against this card's store (if any).
              const factoryPick = pick?.district === 'factory' && pick.sellerId === player.id ? pick.indices : [];
              const factoryPickCost = factoryPick.reduce((s, i) => s + (player.factoryStore[i]?.price ?? 0), 0);
              const factoryPickOk =
                factoryPick.length > 0 &&
                active.money >= factoryPickCost &&
                active.harborStore.length + factoryPick.length <= active.harborLimit;
              const harborPick = pick?.district === 'harbor' && pick.sellerId === player.id ? pick.indices : [];
              const harborPickCost = harborPick.reduce((s, i) => s + (player.harborStore[i]?.price ?? 0), 0);
              const harborPickOk =
                harborPick.length > 0 &&
                active.money >= harborPickCost &&
                active.ship.cargo.length + harborPick.length <= SHIP_CAPACITY;
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

                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid={`ship-${player.id}`}>
                      <ShipIcon className="h-4 w-4" aria-hidden />
                      <span>{shipLabel(player.ship.location, game.players)}</span>
                      <span className="flex flex-wrap gap-1" data-testid={`cargo-${player.id}`}>
                        {player.ship.cargo.map((color, cargoIndex) => (
                          <span
                            key={cargoIndex}
                            className="h-4 w-6 rounded-sm border border-black/20 shadow-sm"
                            style={{ backgroundColor: COLOR_HEX[color] }}
                            title={color}
                          />
                        ))}
                      </span>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Factory store
                          {canReprice ? ' (click to reprice)' : canFactoryBuy ? ' (click to buy)' : ''}
                        </span>
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
                            selected={factoryPick.includes(chipIndex)}
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
                        <Button
                          size="sm"
                          className="mt-2 w-full"
                          data-testid={`buy-factory-${player.id}`}
                          disabled={busy || !factoryPickOk}
                          onClick={commitBuy}
                        >
                          Buy {factoryPick.length} for ${factoryPickCost}
                        </Button>
                      )}
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Harbor{canHarborBuy ? ' (click to load ship)' : ''}</span>
                        <span data-testid={`harbor-count-${player.id}`}>
                          {player.harborStore.length} / {player.harborLimit}
                        </span>
                      </div>
                      <div className="flex min-h-8 flex-wrap items-end gap-2" data-testid={`harbor-${player.id}`}>
                        {player.harborStore.map((container, chipIndex) => (
                          <StoredChip
                            key={chipIndex}
                            container={container}
                            testid={`harbor-chip-${player.id}-${chipIndex}`}
                            disabled={busy}
                            selected={harborPick.includes(chipIndex)}
                            onClick={canHarborBuy ? () => toggleBuy('harbor', player.id, chipIndex) : undefined}
                          />
                        ))}
                      </div>
                      {canHarborBuy && harborPick.length > 0 && (
                        <Button
                          size="sm"
                          className="mt-2 w-full"
                          data-testid={`buy-harbor-${player.id}`}
                          disabled={busy || !harborPickOk}
                          onClick={commitBuy}
                        >
                          Load {harborPick.length} for ${harborPickCost}
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid={`scoring-${player.id}`}>
                      <span>Island:</span>
                      {player.scoringArea.length === 0 ? (
                        <span>—</span>
                      ) : (
                        player.scoringArea.map((color, scoreIndex) => (
                          <span
                            key={scoreIndex}
                            className="h-4 w-6 rounded-sm border border-black/20 shadow-sm"
                            style={{ backgroundColor: COLOR_HEX[color] }}
                            title={color}
                          />
                        ))
                      )}
                    </div>

                    {isActive &&
                      (mustDeliverNow ? (
                        <div className="space-y-2 border-t pt-3" data-testid="auction">
                          <div className="text-sm font-medium">Delivery auction</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>Cargo:</span>
                            {active.ship.cargo.map((color, cargoIndex) => (
                              <span
                                key={cargoIndex}
                                className="h-4 w-6 rounded-sm border border-black/20 shadow-sm"
                                style={{ backgroundColor: COLOR_HEX[color] }}
                                title={color}
                              />
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">Each opponent secretly bids cash ($0 allowed).</p>
                          {game.players
                            .filter((opp) => opp.id !== active.id)
                            .map((opp) => (
                              <label key={opp.id} className="flex items-center justify-between gap-2 text-sm">
                                <span>{opp.name}</span>
                                <input
                                  type="number"
                                  min={0}
                                  data-testid={`bid-${opp.id}`}
                                  className="w-20 rounded-md border bg-background px-2 py-1 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  value={bids[opp.id] ?? 0}
                                  onChange={(event) =>
                                    setBids((prev) => ({
                                      ...prev,
                                      [opp.id]: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                    }))
                                  }
                                />
                              </label>
                            ))}
                          {runoffNeeded && (
                            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2" data-testid="runoff">
                              <div className="mb-1 text-xs font-medium text-destructive">
                                Tie at ${maxBid} — runoff! Tied players add cash:
                              </div>
                              {tiedBidderIds.map((id) => (
                                <label key={id} className="flex items-center justify-between gap-2 text-sm">
                                  <span>{nameOf(game.players, id)} +</span>
                                  <input
                                    type="number"
                                    min={0}
                                    data-testid={`runoff-${id}`}
                                    className="w-20 rounded-md border bg-background px-2 py-1 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={runoffBids[id] ?? 0}
                                    onChange={(event) =>
                                      setRunoffBids((prev) => ({
                                        ...prev,
                                        [id]: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                      }))
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1" data-testid="deliver" disabled={busy} onClick={() => submitDelivery(false)}>
                              Deliver
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              data-testid="buyout"
                              disabled={busy}
                              onClick={() => submitDelivery(true)}
                            >
                              Buy out (${winningBidPreview})
                            </Button>
                          </div>
                        </div>
                      ) : (
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
                              const target = sailTarget(sailAction.to, game.players);
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
                      ))}
                  </CardContent>
                </Card>
              );
            })}
            </section>
          </>
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
