import { Factory as FactoryIcon, Ship as ShipIcon, Warehouse as WarehouseIcon } from 'lucide-react';
import type { Action, GameView, PlayerView } from '@game-hub/engine/container';
import { COLORS, SHIP_CAPACITY, WAREHOUSE_BUILD_COSTS } from '@game-hub/engine/container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { cardRank, ContainerChip, nextFactoryLot, shipLabel, StoredChip } from '../chips';
import { ActionControls } from './ActionControls';

/** The active player's current buy selection: one district, one seller at a time. */
export interface BuyPick {
  readonly district: 'factory' | 'harbor';
  readonly sellerId: string;
  readonly indices: readonly number[];
}

export interface PlayerCardProps {
  readonly game: GameView;
  readonly player: PlayerView;
  readonly index: number;
  readonly legal: readonly Action[];
  readonly can: (type: Action['type']) => boolean;
  readonly sailActions: readonly Extract<Action, { type: 'SAIL' }>[];
  readonly botIds: readonly string[];
  readonly canDrive: boolean;
  readonly busy: boolean;
  readonly mustDeliverNow: boolean;
  readonly produceLot: number;
  readonly setProduceLot: (price: number) => void;
  readonly pick: BuyPick | null;
  readonly act: (playerId: string, action: Action) => void;
  readonly toggleBuy: (district: 'factory' | 'harbor', sellerId: string, index: number) => void;
  readonly commitBuy: () => void;
}

export function PlayerCard({
  game,
  player,
  index,
  legal,
  can,
  sailActions,
  botIds,
  canDrive,
  busy,
  mustDeliverNow,
  produceLot,
  setProduceLot,
  pick,
  act,
  toggleBuy,
  commitBuy,
}: PlayerCardProps) {
  const isActive = index === game.activePlayerIndex;
  // The server only sends a player's secret scoring card to that player (all cards at game end).
  const card = player.scoringCard;
  const nextWarehouseCost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1];
  const capacity = Math.min(player.factories.length, player.factoryLimit - player.factoryStore.length);
  const canReprice = isActive && can('REPRICE') && !busy && canDrive;

  // Buying is done by the active player from THIS card's player (an opponent).
  const active = game.players[game.activePlayerIndex]!;
  const canFactoryBuy =
    !isActive &&
    !busy &&
    canDrive &&
    legal.some((a) => a.type === 'FACTORY_PURCHASE' && a.sellerId === player.id) &&
    active.harborStore.length < active.harborLimit;
  const activeShipLoc = active.ship.location;
  const canHarborBuy =
    !isActive &&
    !busy &&
    canDrive &&
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
      data-testid={`player-card-${player.id}`}
      data-active={isActive}
      className={cn(isActive && 'ring-2 ring-ring')}
    >
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-1.5">
          {/* Say who's a machine: an unlabelled AI opponent is just a confusing human. */}
          {botIds.includes(player.id) && (
            <span data-testid={`bot-badge-${player.id}`} title="Played by the AI" aria-label="Played by the AI">
              🤖
            </span>
          )}
          {player.name}
        </CardTitle>
        <div className="flex items-center gap-2">
          {player.loans > 0 && (
            <span
              data-testid={`loans-${player.id}`}
              className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
            >
              🏦 {player.loans} loan{player.loans === 1 ? '' : 's'}
            </span>
          )}
          <span
            data-testid={`money-${player.id}`}
            className="rounded-full bg-secondary px-2 py-0.5 text-sm font-medium tabular-nums"
          >
            ${player.money}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <FactoryIcon className="h-4 w-4" aria-hidden />
          <span>Factories</span>
          {player.factories.map((factory) => (
            <ContainerChip key={factory.id} color={factory.color} />
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
              <ContainerChip key={cargoIndex} color={color} />
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
              <ContainerChip key={scoreIndex} color={color} />
            ))
          )}
        </div>

        <div className="border-t pt-2 text-xs" data-testid={`scoring-card-${player.id}`}>
          {card ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{isActive ? 'Your card:' : 'Card:'}</span>
              {[...COLORS]
                .sort((a, b) => cardRank(card, b) - cardRank(card, a))
                .map((color) => {
                  const isTwo = color === card.twoValueColor;
                  return (
                    <span key={color} className="flex items-center gap-1">
                      <ContainerChip color={color} />
                      {isTwo ? `$10/$${card.values[color]} ★` : `$${card.values[color]}`}
                    </span>
                  );
                })}
            </div>
          ) : (
            <span className="text-muted-foreground">🂠 Secret scoring card</span>
          )}
        </div>

        {player.holdingArea.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid={`holding-${player.id}`}>
            <span>Bank holding:</span>
            {player.holdingArea.map((color, holdIndex) => (
              <ContainerChip key={holdIndex} color={color} />
            ))}
          </div>
        )}

        {isActive && canDrive && !mustDeliverNow && (
          <ActionControls
            player={player}
            players={game.players}
            capacity={capacity}
            nextWarehouseCost={nextWarehouseCost}
            sailActions={sailActions}
            can={can}
            busy={busy}
            produceLot={produceLot}
            setProduceLot={setProduceLot}
            act={act}
          />
        )}
      </CardContent>
    </Card>
  );
}
