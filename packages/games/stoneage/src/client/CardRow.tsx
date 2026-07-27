import { useState } from 'react';
import { availableToPlace, CARD_COST, cardIndex, cardPaymentError, CARD_PLACES, RESOURCES } from '../engine';
import type {
  CardEffect,
  CardScoring,
  CivCard,
  PlaceId,
  Resource,
  StoneAgePlayer,
  StoneAgeState,
  StoneAgeView,
} from '../engine';
import { Button } from '@/components/ui/button';
import { ActionTip } from '@/components/ActionTip';
import { cn } from '@/lib/utils';
import { FieldIcon, FoodIcon, Hut, Meeple, ResourceIcon, SYMBOL_ICON, ToolIcon } from './art';
import { AnyPips } from './pieces';
import { ACQUIRE_CARD_TIP, DECLINE_TIP, PLACE_CARD_TIP } from './tips';

const RESOURCE_LABEL: Record<Resource, string> = { wood: 'Wood', brick: 'Brick', stone: 'Stone', gold: 'Gold' };

/** A card's title: its green symbol, or its sand multiplier kind. */
const cardTitle = (scoring: CardScoring): string => {
  if (scoring.kind === 'green') return scoring.symbol.charAt(0).toUpperCase() + scoring.symbol.slice(1);
  return { farmer: 'Farmer', toolMaker: 'Tool maker', builder: 'Hut builder', shaman: 'Shaman' }[scoring.kind];
};

/** The icon a sand multiplier multiplies by (its stat), shared with the player panel's chips. */
const MULT_ICON: Record<Exclude<CardScoring['kind'], 'green'>, (p: { className?: string }) => React.ReactNode> = {
  farmer: FieldIcon,
  toolMaker: ToolIcon,
  builder: Hut,
  shaman: (p) => <Meeple {...p} />,
};

/** A card's immediate benefit (pg. 6) as icon + value. */
function EffectLine({ effect }: { effect: CardEffect }) {
  switch (effect.kind) {
    case 'resource':
      return (
        <span className="flex items-center gap-1">
          {Array.from({ length: effect.amount }, (_, i) => (
            <ResourceIcon key={i} resource={effect.resource} className="h-4 w-4" />
          ))}
          +{effect.amount} {RESOURCE_LABEL[effect.resource].toLowerCase()}
        </span>
      );
    case 'food':
      return (
        <span className="flex items-center gap-1">
          <FoodIcon className="h-4 w-4" /> +{effect.amount} food
        </span>
      );
    case 'foodTrack':
      return (
        <span className="flex items-center gap-1">
          <FieldIcon className="h-4 w-4" /> +{effect.amount} food track
        </span>
      );
    case 'tool':
      return (
        <span className="flex items-center gap-1">
          <ToolIcon className="h-4 w-4" /> Take a tool
        </span>
      );
    case 'points':
      return <span className="font-medium">+{effect.amount} pts</span>;
    default:
      return <span className="text-muted-foreground">No instant effect</span>;
  }
}

/** How a card scores at game end (pg. 8), as an iconized formula with a readable label. */
function ScoringLine({ scoring }: { scoring: CardScoring }) {
  if (scoring.kind === 'green') {
    const Icon = SYMBOL_ICON[scoring.symbol]!;
    return (
      <span className="flex items-center gap-1">
        <Icon className="h-4 w-4" /> distinct symbols<sup className="font-bold">2</sup>
      </span>
    );
  }
  const Icon = MULT_ICON[scoring.kind];
  const stat = { farmer: 'food track', toolMaker: 'tool value', builder: 'buildings', shaman: 'people' }[scoring.kind];
  return (
    <span className="flex items-center gap-1">
      <Icon className="h-4 w-4" /> <span className="font-bold">×</span> {stat}
    </span>
  );
}

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
export function CardRow({
  game,
  active,
  canDrive,
  placing,
  acting,
  pending,
  busy,
  onPlace,
  onAcquire,
  playerName,
  seatColorOf,
}: CardRowProps) {
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
          const canPlaceHere =
            canDrive &&
            placing &&
            !!card &&
            occupants.length === 0 &&
            !!active &&
            // Placement room is public state; availableToPlace never reads the redacted deck (§4.6) — safe cast.
            availableToPlace(game as unknown as StoneAgeState, active.id) >= 1;
          const draft = pay[slot] ?? {};
          const canAcquire =
            acting && canDrive && mineHere && !!card && !!active && cardPaymentError(slot, draft, active) === null;
          return (
            <div
              key={placeId}
              data-testid={`place-${placeId}`}
              className="flex flex-col overflow-hidden rounded-md border"
            >
              {/* The header band is the card's type at a glance: green = culture set, sand = multiplier. */}
              <div
                className={cn(
                  'flex items-center justify-between gap-2 px-3 py-1.5',
                  !card && 'bg-muted text-muted-foreground',
                  card &&
                    (card.scoring.kind === 'green' ? 'bg-[#5d7c42] text-[#f3f0e2]' : 'bg-[#cfa95d] text-[#46392a]'),
                )}
              >
                <span className="text-sm font-semibold">{card ? cardTitle(card.scoring) : `Card ${slot + 1}`}</span>
                {card &&
                  card.scoring.kind === 'green' &&
                  (() => {
                    const Icon = SYMBOL_ICON[card.scoring.symbol]!;
                    return <Icon className="h-4 w-4" />;
                  })()}
              </div>
              <div className="flex flex-1 flex-col bg-card px-3 py-2">
                {card ? (
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="mr-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                        Now
                      </span>
                      <EffectLine effect={card.effect} />
                    </div>
                    <div>
                      <span className="mr-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                        End
                      </span>
                      <ScoringLine scoring={card.scoring} />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">empty</div>
                )}
                <div className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  <AnyPips count={CARD_COST[slot]!} />
                  {CARD_COST[slot]} res
                </div>
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
                  <ActionTip tip={PLACE_CARD_TIP} className="mt-2 self-end">
                    <Button
                      size="sm"
                      data-testid={`place-${placeId}-go`}
                      disabled={busy}
                      onClick={() => onPlace(placeId)}
                    >
                      Place worker
                    </Button>
                  </ActionTip>
                )}
                {acting && canDrive && mineHere && card && active && !pending && (
                  <div className="mt-2 space-y-1.5 border-t pt-2">
                    {RESOURCES.filter((r) => active.resources[r] > 0).map((r) => (
                      <div key={r} className="flex items-center gap-1 text-xs">
                        <ResourceIcon resource={r} className="h-4 w-4" />
                        <span className="w-9">{RESOURCE_LABEL[r]}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Less ${r}`}
                          data-testid={`card-pay-${slot}-${r}-dec`}
                          disabled={busy}
                          onClick={() => bumpPay(slot, r, -1, active.resources[r])}
                        >
                          −
                        </Button>
                        <span className="w-4 text-center tabular-nums" data-testid={`card-pay-${slot}-${r}`}>
                          {draft[r] ?? 0}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`More ${r}`}
                          data-testid={`card-pay-${slot}-${r}-inc`}
                          disabled={busy}
                          onClick={() => bumpPay(slot, r, 1, active.resources[r])}
                        >
                          +
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-end gap-1 pt-1">
                      <ActionTip tip={DECLINE_TIP}>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`card-pass-${slot}`}
                          disabled={busy}
                          onClick={() => onAcquire(slot, {})}
                        >
                          Pass
                        </Button>
                      </ActionTip>
                      <ActionTip tip={ACQUIRE_CARD_TIP}>
                        <Button
                          size="sm"
                          data-testid={`acquire-${slot}`}
                          disabled={busy || !canAcquire}
                          onClick={() => onAcquire(slot, draft)}
                        >
                          Take
                        </Button>
                      </ActionTip>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
