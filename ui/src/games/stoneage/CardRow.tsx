import { useState } from 'react';
import {
  availableToPlace,
  CARD_COST,
  cardIndex,
  cardPaymentError,
  CARD_PLACES,
  RESOURCES,
} from '@game-hub/engine/stoneage';
import type { CardEffect, CardScoring, CivCard, PlaceId, Resource, StoneAgePlayer, StoneAgeView } from '@game-hub/engine/stoneage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const RESOURCE_LABEL: Record<Resource, string> = { wood: 'Wood', brick: 'Brick', stone: 'Stone', gold: 'Gold' };
const RESOURCE_DOT: Record<Resource, string> = { wood: 'bg-amber-700', brick: 'bg-orange-500', stone: 'bg-slate-400', gold: 'bg-yellow-400' };

/** A one-line summary of a card's immediate benefit (pg. 6). */
const effectLabel = (effect: CardEffect): string => {
  switch (effect.kind) {
    case 'resource':
      return `+${effect.amount} ${RESOURCE_LABEL[effect.resource]}`;
    case 'food':
      return `+${effect.amount} food`;
    case 'foodTrack':
      return `+${effect.amount} food track`;
    case 'tool':
      return 'Take a tool';
    case 'points':
      return `+${effect.amount} pts`;
    default:
      return 'No instant effect';
  }
};

/** How a card scores at game end (pg. 8) — a green culture symbol or a sand-coloured multiplier. */
const scoringLabel = (scoring: CardScoring): string => {
  switch (scoring.kind) {
    case 'green':
      return `🟢 ${scoring.symbol}`;
    case 'farmer':
      return '🌾 farmer';
    case 'toolMaker':
      return '🔨 tool maker';
    case 'builder':
      return '🏠 hut builder';
    default:
      return '🧙 shaman';
  }
};

export interface CardRowProps {
  readonly game: StoneAgeView;
  readonly active: StoneAgePlayer | undefined;
  readonly canDrive: boolean;
  readonly placing: boolean;
  readonly acting: boolean;
  /** True when a gather roll is pending — it locks the turn, so the acquire controls hide. */
  readonly pending: boolean;
  readonly busy: boolean;
  readonly onPlace: (place: PlaceId) => void;
  readonly onAcquire: (slot: number, resources: Partial<Record<Resource, number>>) => void;
  readonly playerName: (id: string) => string;
  readonly seatColorOf: (id: string) => { readonly dot: string; readonly text: string; readonly ring: string };
}

/**
 * The civilization-card display (pg. 4, 6, SA10): four slots, cheapest (left) to dearest. Place a worker
 * on a slot during placement, then in the action phase pay its position cost — any resources, never food
 * — to take the card (its immediate effect fires and it's kept for scoring), or **Pass**.
 */
export function CardRow({ game, active, canDrive, placing, acting, pending, busy, onPlace, onAcquire, playerName, seatColorOf }: CardRowProps) {
  // In-progress payment per card slot (which resources you'll spend when you press Acquire).
  const [pay, setPay] = useState<Record<number, Partial<Record<Resource, number>>>>({});
  const bumpPay = (slot: number, resource: Resource, by: number, owned: number) =>
    setPay((prev) => {
      const draft = prev[slot] ?? {};
      const next = Math.max(0, Math.min(owned, (draft[resource] ?? 0) + by));
      return { ...prev, [slot]: { ...draft, [resource]: next } };
    });

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">Civilization cards</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CARD_PLACES.map((placeId) => {
          const slot = cardIndex(placeId);
          const card: CivCard | null = game.cardDisplay[slot] ?? null;
          const occupants = Object.entries(game.placements[placeId] ?? {});
          const mineHere = !!active && (game.placements[placeId]?.[active.id] ?? undefined) !== undefined;
          const canPlaceHere = canDrive && placing && !!card && occupants.length === 0 && !!active && availableToPlace(game, active.id) >= 1;
          const draft = pay[slot] ?? {};
          const canAcquire = acting && canDrive && mineHere && !!card && !!active && cardPaymentError(slot, draft, active) === null;
          return (
            <div key={placeId} data-testid={`place-${placeId}`} className="flex flex-col rounded-md border bg-card px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Card {slot + 1}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{CARD_COST[slot]} res</span>
              </div>
              {card ? (
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  <div>{effectLabel(card.effect)}</div>
                  <div>{scoringLabel(card.scoring)}</div>
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">empty</div>
              )}
              {occupants.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-2 text-xs">
                  {occupants.map(([id, n]) => (
                    <span key={id} className={cn('flex items-center gap-1 font-medium', seatColorOf(id).text)}>
                      <span className={cn('inline-block h-2 w-2 rounded-full', seatColorOf(id).dot)} aria-hidden />
                      {playerName(id)}×{n}
                    </span>
                  ))}
                </div>
              )}
              {canPlaceHere && (
                <Button size="sm" className="mt-2 self-end" data-testid={`place-${placeId}-go`} disabled={busy} onClick={() => onPlace(placeId)}>
                  Place worker
                </Button>
              )}
              {acting && canDrive && mineHere && card && active && !pending && (
                <div className="mt-2 space-y-1.5 border-t pt-2">
                  {RESOURCES.filter((r) => active.resources[r] > 0).map((r) => (
                    <div key={r} className="flex items-center gap-1 text-xs">
                      <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', RESOURCE_DOT[r])} aria-hidden />
                      <span className="w-9">{RESOURCE_LABEL[r]}</span>
                      <Button size="sm" variant="outline" aria-label={`Less ${r}`} data-testid={`card-pay-${slot}-${r}-dec`} disabled={busy} onClick={() => bumpPay(slot, r, -1, active.resources[r])}>−</Button>
                      <span className="w-4 text-center tabular-nums" data-testid={`card-pay-${slot}-${r}`}>{draft[r] ?? 0}</span>
                      <Button size="sm" variant="outline" aria-label={`More ${r}`} data-testid={`card-pay-${slot}-${r}-inc`} disabled={busy} onClick={() => bumpPay(slot, r, 1, active.resources[r])}>+</Button>
                    </div>
                  ))}
                  <div className="flex items-center justify-end gap-1 pt-1">
                    <Button size="sm" variant="outline" data-testid={`card-pass-${slot}`} disabled={busy} onClick={() => onAcquire(slot, {})}>Pass</Button>
                    <Button size="sm" data-testid={`acquire-${slot}`} disabled={busy || !canAcquire} onClick={() => onAcquire(slot, draft)}>Take</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
