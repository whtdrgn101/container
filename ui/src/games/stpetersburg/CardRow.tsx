import { effectiveCost } from '@game-hub/engine/stpetersburg';
import type { Card, CardKind, PlayerView, StPetersburgView } from '@game-hub/engine/stpetersburg';
import { CardFace, GiltRail, MalachiteBoard, PhaseMedallion, StackCabinet } from './art';
import { tradeOptions } from './PlayerPanel';
import type { TradeOption } from './PlayerPanel';
import { SP_TIPS } from './tips';

/**
 * Saint Petersburg's board surface — the "Malachite & Gilt" salon (SP8, comps rev 2). The two face-up card
 * rows sit on a `MalachiteBoard` backdrop under gilt rails (upper LEFT-aligned, lower RIGHT-aligned — the
 * rows pull apart as the round ages, pg. 5), with the `StackCabinet` (draw counts + discards) and the
 * `PhaseMedallion` (active phase + round) as gilt fittings on the right (stacking below on mobile).
 *
 * Every card renders as a `CardFace`; a buyable card wraps it in a `<button>` carrying the existing
 * `sp-buy-<id>` testid, a non-buyable one is a static `sp-card-<id>` tile, and the free "+ Hand" affordance
 * keeps its `sp-hand-<id>` testid. The board is diegetic printed art and does NOT re-theme in dark mode;
 * chrome text on the malachite uses the light gilt/cream tones the art files carry.
 */

/** Cream text for chrome sitting directly on the dark malachite (matches the art files' `#e8e2d4` family). */
const ON_MALACHITE = '#e8e2d4';
const STACK_LABEL: Record<CardKind, string> = {
  worker: 'Worker',
  building: 'Building',
  aristocrat: 'Aristocrat',
  trading: 'Trading',
};

/** One face-up row card: a buyable `sp-buy` button, or a static `sp-card` tile, plus the free "+ Hand" take. */
function RowCard({
  card,
  row,
  index,
  active,
  acting,
  canAddToHand,
  busy,
  onBuy,
  onAdd,
  onRowTrade,
}: {
  card: Card;
  row: 'upper' | 'lower';
  index: number;
  active: PlayerView | undefined;
  acting: boolean;
  canAddToHand: boolean;
  busy: boolean;
  onBuy: (row: 'upper' | 'lower', index: number) => void;
  onAdd: (row: 'upper' | 'lower', index: number) => void;
  onRowTrade: (card: Card, row: 'upper' | 'lower', index: number, options: TradeOption[]) => void;
}) {
  const trading = card.kind === 'trading';
  // A trading card is bought by displacement (pg. 7): its options + cheapest affordable price.
  const rowTradeOpts = trading && acting && active ? tradeOptions(active, card, row) : [];
  const tradingCost = rowTradeOpts.length ? Math.min(...rowTradeOpts.map((o) => o.cost)) : undefined;
  // A plain card's effective price for the active seat (pg. 6), and whether it's affordable right now.
  const plainCost = active ? effectiveCost(active, card, row) : card.cost;
  const plainAffordable =
    acting && active && !trading && active.rubles !== null && active.rubles >= plainCost ? plainCost : undefined;
  const affordable = trading ? tradingCost : plainAffordable;
  const shown = trading ? (affordable ?? card.cost) : plainCost;

  const onClick =
    affordable === undefined
      ? undefined
      : trading
        ? () => onRowTrade(card, row, index, rowTradeOpts)
        : () => onBuy(row, index);

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {onClick ? (
        <button
          type="button"
          data-testid={`sp-buy-${card.id}`}
          // The card table is `overflow-hidden`, which would clip a floating ActionTip; a descriptive
          // native title is used here (the hand/pub/observatory affordances outside it use ActionTip).
          title={trading ? SP_TIPS.buyTrading : SP_TIPS.buy}
          className="rounded-lg ring-offset-1 transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          disabled={busy}
          onClick={onClick}
        >
          <CardFace card={card} effectiveCost={shown} width={92} />
        </button>
      ) : (
        <span data-testid={`sp-card-${card.id}`} className="inline-block rounded-lg">
          <CardFace card={card} effectiveCost={shown} width={92} />
        </span>
      )}
      {canAddToHand ? (
        <button
          type="button"
          data-testid={`sp-hand-${card.id}`}
          // Bright cream on the dark malachite (owner fix, SP8): the semantic muted token had no
          // contrast on the stone. Diegetic hardcoded tones, like all chrome on the board surface.
          className="rounded border border-dashed border-[#e8e2d4]/70 bg-[#0a2f26]/40 px-2 py-0.5 text-[10px] font-medium text-[#f4efe2] transition hover:border-white hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9b45a]"
          title={`Add ${card.name} to your hand (free)`}
          disabled={busy}
          onClick={() => onAdd(row, index)}
        >
          + Hand
        </button>
      ) : null}
    </div>
  );
}

export interface CardRowProps {
  readonly game: StPetersburgView;
  readonly active: PlayerView | undefined;
  /** `canDrive && !interlude && !ended` — whether the active seat can act right now. */
  readonly acting: boolean;
  readonly canAddToHand: boolean;
  readonly busy: boolean;
  readonly onBuy: (row: 'upper' | 'lower', index: number) => void;
  readonly onAdd: (row: 'upper' | 'lower', index: number) => void;
  readonly onRowTrade: (card: Card, row: 'upper' | 'lower', index: number, options: TradeOption[]) => void;
}

export function CardRow({ game, active, acting, canAddToHand, busy, onBuy, onAdd, onRowTrade }: CardRowProps) {
  const renderRow = (row: 'upper' | 'lower') =>
    game.board[row].map((card, index) => (
      <RowCard
        key={card.id}
        card={card}
        row={row}
        index={index}
        active={active}
        acting={acting}
        canAddToHand={canAddToHand}
        busy={busy}
        onBuy={onBuy}
        onAdd={onAdd}
        onRowTrade={onRowTrade}
      />
    ));

  return (
    <div className="relative overflow-hidden rounded-2xl p-3 shadow-md sm:p-4">
      {/* The malachite backdrop — an absolute-inset stretch layer behind the fittings. */}
      <MalachiteBoard />

      <div className="relative flex flex-col gap-4 lg:flex-row">
        {/* The two card rows. Upper pulls LEFT, lower pulls RIGHT (pg. 5 — they part as the round ages). */}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <GiltRail label="Upper row" className="mb-1.5" />
            <div data-testid="sp-upper-row" className="flex min-h-[8rem] justify-start gap-2 overflow-x-auto">
              {game.board.upper.length > 0 ? (
                renderRow('upper')
              ) : (
                <span className="self-center text-xs italic" style={{ color: ON_MALACHITE }}>
                  empty
                </span>
              )}
            </div>
          </div>
          <div>
            <GiltRail label="Lower row · −1₽" className="mb-1.5" />
            <div data-testid="sp-lower-row" className="flex min-h-[8rem] justify-end gap-2 overflow-x-auto">
              {game.board.lower.length > 0 ? (
                renderRow('lower')
              ) : (
                <span className="self-center text-xs italic" style={{ color: ON_MALACHITE }}>
                  empty (round 1)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Gilt fittings — the draw-stack cabinet and the phase dial. Below the rows on mobile. */}
        <div className="flex shrink-0 flex-row items-start justify-between gap-3 lg:w-56 lg:flex-col lg:items-center">
          <div className="w-full max-w-[13rem]">
            <StackCabinet counts={game.board.stacks} discards={game.board.discard} className="w-full" />
            {/* Semantic count layer (screen readers + the e2e contract): the SVG carries the visual figures. */}
            {(Object.keys(game.board.stacks) as CardKind[]).map((kind) => (
              <span key={kind} data-testid={`sp-stack-${kind}`} className="sr-only">
                {STACK_LABEL[kind]}: {game.board.stacks[kind]} left
              </span>
            ))}
            <span data-testid="sp-discard" className="sr-only">
              Discard: {game.board.discard}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <PhaseMedallion phase={game.phase} round={game.round} className="h-24 w-24" />
            <span className="text-xs font-semibold capitalize" style={{ color: ON_MALACHITE }} title={SP_TIPS.phase}>
              {game.phase} phase
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
