import type { Action, GameView, PlayerView } from '@game-hub/engine/container';
import { COLORS, SHIP_CAPACITY, WAREHOUSE_BUILD_COSTS } from '@game-hub/engine/container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { cardRank, ContainerChip } from '../chips';
import { seatColorOf } from '../seatColors';
import { MatHeader } from './mat/MatHeader';
import { FactoryZone } from './mat/FactoryZone';
import { HarborZone } from './mat/HarborZone';
import { DockZone } from './mat/DockZone';

/** The active player's current buy selection: one district, one seller at a time. */
export interface BuyPick {
  readonly district: 'factory' | 'harbor';
  readonly sellerId: string;
  readonly indices: readonly number[];
}

export interface PlayerCardProps {
  readonly game: GameView;
  /** Each seat's picked colour (playerId → palette id) for the mat's ribbon/ring tint. */
  readonly colors?: Readonly<Record<string, string>>;
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

/** A tiny face-down-card glyph for the hidden scoring card (replaces the 🂠 emoji). */
function FaceDownCard() {
  return (
    <svg viewBox="0 0 16 20" className="h-4 w-3.5" aria-hidden focusable="false">
      <rect x="1" y="1" width="14" height="18" rx="2" fill="currentColor" opacity="0.15" />
      <rect x="1" y="1" width="14" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M4.5 5.5 L11.5 14.5 M11.5 5.5 L4.5 14.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

/**
 * A player's board as a spatial **mat** (visual overhaul, 2026-07): money strip up top, then the
 * factory district and harbor district side by side, the dock (ship + cargo aboard) full-width, and
 * the island/scoring-card/holding rows in the footer. The active seat's action controls live inside
 * the zone they act on (Produce → factory, Build → harbor, Sail/Load → dock, loans → money strip),
 * with `data-testid="controls"` as the end-turn console strip. Every testid and text contract from
 * the pre-mat card is preserved.
 */
export function PlayerCard({
  game,
  colors,
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
  const seatColor = seatColorOf(game.players, player.id, colors);
  // The server only sends a player's secret scoring card to that player (all cards at game end).
  const card = player.scoringCard;
  const nextWarehouseCost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1];
  const capacity = Math.min(player.factories.length, player.factoryLimit - player.factoryStore.length);
  const canReprice = isActive && can('REPRICE') && !busy && canDrive;
  const showControls = isActive && canDrive && !mustDeliverNow;

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
      className={cn('overflow-hidden border-l-4', isActive && cn('ring-2', seatColor.ring))}
      style={{ borderLeftColor: seatColor.hull }}
    >
      <MatHeader player={player} isBot={botIds.includes(player.id)} showControls={showControls} can={can} busy={busy} act={act} />
      <CardContent className="space-y-2">
        <div className="grid gap-2 min-[420px]:grid-cols-2">
          <FactoryZone
            player={player}
            canReprice={canReprice}
            canFactoryBuy={canFactoryBuy}
            factoryPick={factoryPick}
            factoryPickCost={factoryPickCost}
            factoryPickOk={factoryPickOk}
            showControls={showControls}
            can={can}
            capacity={capacity}
            produceLot={produceLot}
            setProduceLot={setProduceLot}
            busy={busy}
            act={act}
            toggleBuy={toggleBuy}
            commitBuy={commitBuy}
          />
          <HarborZone
            player={player}
            canHarborBuy={canHarborBuy}
            harborPick={harborPick}
            harborPickCost={harborPickCost}
            harborPickOk={harborPickOk}
            showControls={showControls}
            can={can}
            nextWarehouseCost={nextWarehouseCost}
            busy={busy}
            act={act}
            toggleBuy={toggleBuy}
            commitBuy={commitBuy}
          />
        </div>
        <DockZone
          player={player}
          players={game.players}
          hull={seatColor.hull}
          showControls={showControls}
          sailActions={sailActions}
          can={can}
          busy={busy}
          act={act}
        />

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid={`scoring-${player.id}`}>
          <span>Island:</span>
          {player.scoringArea.length === 0 ? (
            <span>—</span>
          ) : (
            player.scoringArea.map((color, scoreIndex) => <ContainerChip key={scoreIndex} color={color} />)
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
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <FaceDownCard /> Secret scoring card
            </span>
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

        {/* The turn console: end the turn from anywhere. (The other actions live in their zones.) */}
        {showControls && (
          <div className="flex items-center justify-end gap-2 border-t pt-2" data-testid="controls">
            <Button size="sm" variant="secondary" data-testid="end-turn" disabled={busy} onClick={() => act(player.id, { type: 'END_TURN' })}>
              End turn
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
