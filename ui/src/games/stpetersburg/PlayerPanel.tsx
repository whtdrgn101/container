import {
  ARISTOCRAT_SCORE,
  displacementCost,
  handCost,
  handLimit,
  legalDisplaceTargets,
} from '@game-hub/engine/stpetersburg';
import type { Card, CardKind, Phase, PlayerView } from '@game-hub/engine/stpetersburg';
import { cn } from '@/lib/utils';
import { ActionTip } from '@/components/ActionTip';
import { CardFace } from './art';

/**
 * Saint Petersburg's player tableaus — the "Malachite & Gilt" overhaul (SP8, comps rev 2). ALL players are
 * always listed. The viewer's own seat(s) get a **full tableau** (play area grouped by kind in three tinted
 * columns with per-phase pay chips and the hand as a fan of `CardFace` cards); opponents collapse to a
 * **compact one-line row** that expands read-only on click (public cards visible, rubles 🔒, hand a count).
 *
 * These panels are chrome that sits *below* the diegetic board, so they keep semantic Tailwind tokens
 * (they re-theme in dark mode) — only the board surface itself is hardcoded malachite.
 */

/** Each group's tint on a tableau column / card chrome (pg. 1 colours). */
const KIND_CLASS: Record<CardKind, string> = {
  worker: 'border-emerald-500/60 bg-emerald-500/10',
  building: 'border-sky-500/60 bg-sky-500/10',
  aristocrat: 'border-amber-500/60 bg-amber-500/10',
  trading: 'border-fuchsia-500/60 bg-fuchsia-500/10',
};

/** The three play-area groups, in phase order, with their column label (the "Workers: N" the e2e asserts). */
const GROUPS = [
  { kind: 'worker' as const, label: 'Workers' },
  { kind: 'building' as const, label: 'Buildings' },
  { kind: 'aristocrat' as const, label: 'Aristocrats' },
];

/** Short phase label for a starting-player marker chip (a single letter keeps the chip tiny). */
const PHASE_MARK: Record<Phase, string> = { worker: 'W', building: 'B', aristocrat: 'A', trading: 'T' };

/**
 * The seat palette (the cross-game player-colour feature). Ids are the module's catalog colours (pg. 1's
 * four wood-figure colours) in seat order; each maps to a Tailwind fill (literal strings so the build keeps
 * them). Exported so the board's `colorIdOf` fallback shares one source of truth.
 */
export const SEAT_PALETTE = ['blue', 'yellow', 'green', 'red'] as const;
export const SEAT_CLASS: Record<string, string> = {
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
};

/** A candidate displacement: an owned card to discard and what the trading card then costs (pg. 7). */
export type TradeOption = { readonly target: Card; readonly cost: number };

/** The displacement targets `tradingCard` can afford from `player`'s play area (pg. 7), each with its cost. */
export function tradeOptions(player: PlayerView, tradingCard: Card, fromRow?: 'upper' | 'lower'): TradeOption[] {
  if (player.rubles === null) return [];
  return legalDisplaceTargets(player, tradingCard)
    .map((target) => ({ target, cost: displacementCost(player, tradingCard, target, fromRow) }))
    .filter((o) => o.cost <= player.rubles!);
}

/** The rubles / points marks a group's cards score when its phase scores (pg. 3). */
function phasePay(cards: readonly Card[]): { income: number; points: number } {
  return {
    income: cards.reduce((sum, c) => sum + c.income, 0),
    points: cards.reduce((sum, c) => sum + c.points, 0),
  };
}

/** A small gilt-tinted "phase pay" chip — what this column scores when its phase scores. */
function PayChip({ income, points }: { income: number; points: number }) {
  if (income === 0 && points === 0) return <span className="text-[10px] italic text-muted-foreground">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
      title="Scores this much when the phase scores"
    >
      phase pay
      {income > 0 ? <span>+{income}₽</span> : null}
      {points > 0 ? <span>+{points}★</span> : null}
    </span>
  );
}

/** Distinct-aristocrat end-game bonus (pg. 5–6), priced from the engine's `ARISTOCRAT_SCORE` table. */
function aristocratBonus(cards: readonly Card[]): { distinct: number; score: number } {
  const distinct = new Set(cards.map((c) => c.key)).size;
  const score = ARISTOCRAT_SCORE[Math.min(distinct, ARISTOCRAT_SCORE.length - 1)]!;
  return { distinct, score };
}

/** One play-area column: its label + per-kind count, the phase-pay chip, and the cards as `CardFace`s. */
function KindColumn({ kind, label, cards }: { kind: CardKind; label: string; cards: readonly Card[] }) {
  const { income, points } = phasePay(cards);
  const bonus = kind === 'aristocrat' ? aristocratBonus(cards) : null;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-lg border p-1.5', KIND_CLASS[kind])}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold">
          {label}: {cards.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        <PayChip income={income} points={points} />
        {bonus ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
            title={`Distinct aristocrats at game end: ${bonus.distinct} → ${bonus.score} points (pg. 5–6)`}
          >
            distinct {bonus.distinct} → {bonus.score}★ at end
          </span>
        ) : null}
      </div>
      {cards.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {cards.map((card) => (
            <CardFace key={card.id} card={card} width={52} />
          ))}
        </div>
      ) : (
        <span className="text-[10px] italic text-muted-foreground">empty</span>
      )}
    </div>
  );
}

/** The three tinted play-area columns (worker / building / aristocrat) — grouped exactly as the state holds them. */
function PlayAreaColumns({ player }: { player: PlayerView }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {GROUPS.map(({ kind, label }) => (
        <KindColumn key={kind} kind={kind} label={label} cards={player.playArea[kind]} />
      ))}
    </div>
  );
}

/**
 * The viewer's own hidden hand (pg. 3), rendered as a fan of playable `CardFace` cards. Only the active
 * driving seat can play (`playable`); an own but off-turn seat still sees its cards, greyed. A **trading**
 * card is played by *displacing* a card you own (pg. 7): clicking it opens the picker (or acts at once when
 * there is a single legal target); one with nothing legal to displace stays disabled.
 */
function HandFan({
  player,
  playable,
  busy,
  onPlay,
  onTrade,
}: {
  player: PlayerView;
  playable: boolean;
  busy: boolean;
  onPlay: (index: number) => void;
  onTrade: (card: Card, index: number, options: TradeOption[]) => void;
}) {
  const hand = player.hand ?? [];
  return (
    <div data-testid={`sp-hand-panel-${player.id}`} className="mt-2 border-t pt-2">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
        Your hand ({hand.length}/{handLimit(player)})
      </div>
      {hand.length === 0 ? (
        <span className="text-xs italic text-muted-foreground">empty — take a card from a row into your hand</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hand.map((card, index) => {
            const trading = card.kind === 'trading';
            const options = trading ? tradeOptions(player, card) : [];
            const cost = trading
              ? options.length
                ? Math.min(...options.map((o) => o.cost))
                : card.cost
              : handCost(player, card);
            const canPlay =
              playable && (trading ? options.length > 0 : player.rubles !== null && player.rubles >= cost);
            const title = trading
              ? options.length
                ? `${card.name} — upgrade by displacing a card you own (from ${cost}₽)`
                : `${card.name} — no card of yours to displace, or you can't afford it (pg. 7)`
              : `${card.name} — play for ${cost}${cost !== card.cost ? ` (was ${card.cost})` : ''}`;
            return (
              <ActionTip key={card.id} tip={title}>
                <button
                  type="button"
                  data-testid={`sp-play-${index}`}
                  className={cn(
                    'rounded-lg ring-offset-1 transition',
                    canPlay
                      ? 'cursor-pointer hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                      : 'opacity-55',
                  )}
                  disabled={!canPlay || busy}
                  onClick={() => (trading ? onTrade(card, index, options) : onPlay(index))}
                >
                  <CardFace card={card} effectiveCost={cost} width={64} />
                </button>
              </ActionTip>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The header line shared by the compact and detailed tableaus: colour dot, name, markers, points, rubles, hand. */
function PlayerHeader({
  player,
  isActive,
  isBot,
  colorId,
  startsPhases,
}: {
  player: PlayerView;
  isActive: boolean;
  isBot: boolean;
  colorId: string;
  startsPhases: readonly Phase[];
}) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5 font-medium">
        <span
          data-testid={`seat-legend-${player.id}`}
          data-color={colorId}
          aria-hidden
          className={cn('inline-block h-3 w-3 shrink-0 rounded-full', SEAT_CLASS[colorId] ?? 'bg-muted-foreground')}
        />
        {isBot ? '🤖 ' : ''}
        <span className="truncate">{player.name}</span>
        {isActive ? ' ←' : ''}
        {startsPhases.map((phase) => (
          <span
            key={phase}
            data-testid={`sp-marker-${phase}-${player.id}`}
            title={`Starts the ${phase} phase`}
            aria-label={`Starting player marker: ${phase} phase`}
            className={cn(
              'inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold',
              KIND_CLASS[phase],
            )}
          >
            {PHASE_MARK[phase]}
          </span>
        ))}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span data-testid={`sp-points-${player.id}`} className="font-semibold tabular-nums" title="Victory points">
          {player.points}★
        </span>
        {player.rubles !== null ? (
          <span data-testid={`sp-rubles-${player.id}`} className="font-semibold tabular-nums">
            {player.rubles}₽
          </span>
        ) : (
          <span
            data-testid={`sp-rubles-hidden-${player.id}`}
            className="text-xs text-muted-foreground"
            title="Rubles are secret"
          >
            🔒 rubles
          </span>
        )}
        <span
          data-testid={`sp-handcount-${player.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          title={`${player.handCount} card(s) in hand`}
        >
          🖐 {player.handCount}
        </span>
      </span>
    </>
  );
}

/** Per-kind counts on one compact line — carries the "Workers: N" text the e2e asserts. */
function KindCounts({ player }: { player: PlayerView }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {GROUPS.map(({ kind, label }) => (
        <span key={kind}>
          {label}: {player.playArea[kind].length}
        </span>
      ))}
    </span>
  );
}

export interface PlayerPanelProps {
  readonly player: PlayerView;
  readonly isActive: boolean;
  readonly isBot: boolean;
  readonly colorId: string;
  readonly startsPhases: readonly Phase[];
  /** True for the viewer's own seat(s) — a full tableau; opponents get the compact row. */
  readonly detailed: boolean;
  /** Whether a collapsed opponent row is expanded to its read-only tableau. */
  readonly expanded: boolean;
  readonly onToggleExpand: () => void;
  /** Hand interactivity (own detailed seat only). */
  readonly playable: boolean;
  readonly busy: boolean;
  readonly onPlay: (index: number) => void;
  readonly onTrade: (card: Card, index: number, options: TradeOption[]) => void;
}

/**
 * One player's tableau. The viewer's own seat renders the full engines-at-a-glance panel (grouped play area
 * + phase-pay chips + the hand fan); every opponent renders a compact one-line summary that expands to a
 * read-only tableau on click (its cards are public; rubles stay 🔒 and the hand stays a count).
 */
export function PlayerPanel(props: PlayerPanelProps) {
  const { player, isActive, isBot, colorId, startsPhases, detailed, expanded, onToggleExpand } = props;

  if (detailed) {
    return (
      <div
        data-testid={`player-${player.id}`}
        className={cn('rounded-lg border p-3 text-sm', isActive ? 'border-primary bg-primary/5' : 'bg-card')}
      >
        <div className="flex items-center justify-between gap-2">
          <PlayerHeader
            player={player}
            isActive={isActive}
            isBot={isBot}
            colorId={colorId}
            startsPhases={startsPhases}
          />
        </div>
        <PlayAreaColumns player={player} />
        {player.hand !== null ? (
          <HandFan
            player={player}
            playable={props.playable}
            busy={props.busy}
            onPlay={props.onPlay}
            onTrade={props.onTrade}
          />
        ) : null}
      </div>
    );
  }

  // Compact opponent row — a single scannable line; click to expand its (public) tableau read-only.
  return (
    <div
      data-testid={`player-${player.id}`}
      className={cn('rounded-lg border text-sm', isActive ? 'border-primary bg-primary/5' : 'bg-card')}
    >
      <button
        type="button"
        data-testid={`sp-expand-${player.id}`}
        aria-expanded={expanded}
        title={expanded ? 'Hide play area' : 'Show play area (public)'}
        className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onToggleExpand}
      >
        <span className="flex flex-1 items-center justify-between gap-2">
          <PlayerHeader
            player={player}
            isActive={isActive}
            isBot={isBot}
            colorId={colorId}
            startsPhases={startsPhases}
          />
        </span>
        <span className="flex w-full items-center justify-between gap-2">
          <KindCounts player={player} />
          <span aria-hidden className="text-xs text-muted-foreground">
            {expanded ? '▲' : '▼'}
          </span>
        </span>
      </button>
      {expanded ? (
        <div className="border-t px-3 pb-3 pt-1">
          <PlayAreaColumns player={player} />
        </div>
      ) : null}
    </div>
  );
}
