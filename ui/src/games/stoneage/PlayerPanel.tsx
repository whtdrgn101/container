import { CARD_SYMBOLS, CIV_CARD_DECK, placedBy, RESOURCES } from '@game-hub/engine/stoneage';
import type { StoneAgePlayer, StoneAgeView } from '@game-hub/engine/stoneage';
import { cn } from '@/lib/utils';
import { CardIcon, FieldIcon, FoodIcon, Hut, Meeple, ResourceIcon, SYMBOL_ICON, ToolIcon } from './art';

/** Card lookup for pricing a player's held cards (ids on the player, faces in the fixed deck). */
const CARD_BY_ID = new Map(CIV_CARD_DECK.map((card) => [card.id, card]));

/** What a player's held cards amount to: which green symbols, and how many of each sand multiplier. */
function cardEngines(player: StoneAgePlayer) {
  const symbols = new Set<string>();
  const counts = { farmer: 0, toolMaker: 0, builder: 0, shaman: 0 };
  for (const id of player.civCards) {
    const scoring = CARD_BY_ID.get(id)?.scoring;
    if (!scoring) continue;
    if (scoring.kind === 'green') symbols.add(scoring.symbol);
    else counts[scoring.kind] += 1;
  }
  return { symbols, ...counts };
}

export interface PlayerPanelProps {
  readonly game: StoneAgeView;
  readonly player: StoneAgePlayer;
  readonly seat: number;
  /** Full engines-at-a-glance panel for the viewer's own seats; opponents get the one-line summary. */
  readonly detailed: boolean;
  readonly seatColor: { readonly dot: string; readonly text: string; readonly ring: string };
}

/** One sand-multiplier chip: count × the player's live stat = points today. */
function MultChip({ icon, count, stat, label }: { icon: React.ReactNode; count: number; stat: number; label: string }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[#cfa95d]/25 px-2 py-0.5 text-[11px] font-medium"
      title={`${count} × ${label} (${stat}) = ${count * stat} points at game end`}
    >
      {icon}
      <span className="tabular-nums">
        ×{count} → {count * stat}
      </span>
      <span className="sr-only">
        {count} {label} cards worth {count * stat} points
      </span>
    </span>
  );
}

/**
 * A player's board (pg. 2), upgraded so the card engines are visible at a glance (2026-07): the
 * viewer's own seat(s) show the full panel — the 8-symbol green collection (distinct², all 8 = 64)
 * and each sand multiplier priced against its live stat — while opponents collapse to a one-line
 * summary so a 4-player game stays scannable. Keeps `player-<id>` / `score-<id>` testids and the
 * "Food track: n" wording the e2e asserts.
 */
export function PlayerPanel({ game, player, seat, detailed, seatColor }: PlayerPanelProps) {
  const engines = cardEngines(player);
  const toolValue = player.tools.reduce((sum, v) => sum + v, 0);
  const greenPts = engines.symbols.size * engines.symbols.size;
  const cardsTotal =
    greenPts +
    engines.farmer * player.foodTrack +
    engines.toolMaker * toolValue +
    engines.builder * player.buildings +
    engines.shaman * player.people;
  const isActive = seat === game.activePlayerIndex;

  if (!detailed) {
    return (
      <div
        data-testid={`player-${player.id}`}
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-xs',
          isActive && cn('ring-2', seatColor.ring),
        )}
      >
        <span className={cn('flex items-center gap-1.5 font-medium', seatColor.text)}>
          <Meeple className={cn('h-3.5 w-3.5', seatColor.text)} />
          {player.name}
        </span>
        <span className="flex items-center gap-1" title="People placed / total">
          <Meeple className="h-3 w-3 opacity-60" />
          <span className="tabular-nums">
            {placedBy(game, player.id)}/{player.people}
          </span>
        </span>
        <span className="flex items-center gap-1" title={`Food track: ${player.foodTrack}`}>
          <FieldIcon className="h-3.5 w-3.5" />
          <span className="tabular-nums">{player.foodTrack}</span>
        </span>
        <span className="flex items-center gap-1" title={`Tools: ${player.tools.join(', ') || 'none'}`}>
          <ToolIcon className="h-3.5 w-3.5" />
          <span className="tabular-nums">{toolValue}</span>
        </span>
        <span className="flex items-center gap-1" title={`${player.buildings} buildings`}>
          <Hut className="h-3.5 w-3.5" />
          <span className="tabular-nums">{player.buildings}</span>
        </span>
        {engines.symbols.size > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[#5d7c42]/20 px-2 py-0.5 font-medium"
            title={`${engines.symbols.size} distinct culture symbols → ${greenPts} points`}
          >
            <CardIcon className="h-3.5 w-3.5" />
            <span className="tabular-nums">
              {engines.symbols.size} sym → {greenPts}
            </span>
          </span>
        )}
        <MultChip
          icon={<FieldIcon className="h-3 w-3" />}
          count={engines.farmer}
          stat={player.foodTrack}
          label="farmer"
        />
        <MultChip
          icon={<ToolIcon className="h-3 w-3" />}
          count={engines.toolMaker}
          stat={toolValue}
          label="tool maker"
        />
        <MultChip
          icon={<Hut className="h-3 w-3" />}
          count={engines.builder}
          stat={player.buildings}
          label="hut builder"
        />
        <MultChip icon={<Meeple className="h-3 w-3" />} count={engines.shaman} stat={player.people} label="shaman" />
        <span className="ml-auto font-semibold tabular-nums" data-testid={`score-${player.id}`} title="Points banked">
          {player.score} pts
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid={`player-${player.id}`}
      className={cn('rounded-lg border bg-card p-3', isActive && cn('ring-2', seatColor.ring))}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={cn('flex items-center gap-1.5 font-medium', seatColor.text)}>
          <span className={cn('inline-block h-3 w-3 rounded-full', seatColor.dot)} aria-hidden />
          {player.name}
        </span>
        <span className="text-xs text-muted-foreground" data-testid={`score-${player.id}`}>
          {player.score} pts
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <Meeple className={cn('h-3.5 w-3.5', seatColor.text)} />
          People:{' '}
          <span className="font-medium tabular-nums">
            {placedBy(game, player.id)}/{player.people}
          </span>{' '}
          placed
        </span>
        <span className="flex items-center gap-1">
          <FoodIcon className="h-3.5 w-3.5" /> Food: <span className="font-medium tabular-nums">{player.food}</span>
        </span>
        <span className="flex items-center gap-1">
          <FieldIcon className="h-3.5 w-3.5" /> Food track:{' '}
          <span className="font-medium tabular-nums">{player.foodTrack}</span>
        </span>
        <span className="flex items-center gap-1">
          <ToolIcon className="h-3.5 w-3.5" /> Tools:{' '}
          <span className="font-medium tabular-nums">{player.tools.join(', ') || '—'}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {RESOURCES.map((resource) => (
          <span key={resource} className="flex items-center gap-1">
            <ResourceIcon resource={resource} className="h-4 w-4" />
            <span className="tabular-nums">{player.resources[resource]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 text-muted-foreground">
          · <Hut className="h-3.5 w-3.5" /> {player.buildings}
        </span>
      </div>

      {/* The card engines: the green collection and every multiplier, priced live. */}
      <div className="mt-2 border-t pt-2">
        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex items-center gap-1">
            <CardIcon className="h-3.5 w-3.5" /> Cards ({player.civCards.length})
          </span>
          {cardsTotal > 0 && (
            <span className="normal-case tracking-normal tabular-nums">worth {cardsTotal} pts today</span>
          )}
        </div>
        <div
          className="flex items-center gap-1"
          role="img"
          aria-label={`${engines.symbols.size} of ${CARD_SYMBOLS.length} distinct culture symbols, worth ${greenPts} points`}
        >
          {CARD_SYMBOLS.map((symbol) => {
            const held = engines.symbols.has(symbol);
            const Icon = SYMBOL_ICON[symbol]!;
            return (
              <span
                key={symbol}
                title={`${symbol}${held ? '' : ' (not collected)'}`}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-md',
                  held
                    ? 'bg-[#5d7c42] text-[#f3f0e2]'
                    : 'border border-dashed border-muted-foreground/40 text-muted-foreground/50',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
            );
          })}
          <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">
            {engines.symbols.size}/{CARD_SYMBOLS.length} →{' '}
            <span className="font-semibold text-foreground">{greenPts}</span>
            {engines.symbols.size < CARD_SYMBOLS.length && <span className="hidden sm:inline"> (all 8 = 64)</span>}
          </span>
        </div>
        {(engines.farmer > 0 || engines.toolMaker > 0 || engines.builder > 0 || engines.shaman > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <MultChip
              icon={<FieldIcon className="h-3.5 w-3.5" />}
              count={engines.farmer}
              stat={player.foodTrack}
              label="farmer"
            />
            <MultChip
              icon={<ToolIcon className="h-3.5 w-3.5" />}
              count={engines.toolMaker}
              stat={toolValue}
              label="tool maker"
            />
            <MultChip
              icon={<Hut className="h-3.5 w-3.5" />}
              count={engines.builder}
              stat={player.buildings}
              label="hut builder"
            />
            <MultChip
              icon={<Meeple className="h-3.5 w-3.5" />}
              count={engines.shaman}
              stat={player.people}
              label="shaman"
            />
          </div>
        )}
      </div>
    </div>
  );
}
