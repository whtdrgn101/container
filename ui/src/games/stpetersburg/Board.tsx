import { useState } from 'react';
import { CARD_KINDS, PHASES, PUB_MAX_POINTS, PUB_POINT_COST, displacementCost, effectiveCost, handCost, handLimit, legalDisplaceTargets, unusedObservatories } from '@game-hub/engine/stpetersburg';
import type { Card, CardKind, Phase, PlayerView, StPetersburgView } from '@game-hub/engine/stpetersburg';
import { Button } from '@/components/ui/button';
import { ActivityFeed } from '@/components/ActivityFeed';
import { GameOver } from '@/components/GameOver';
import { TurnBanner } from '@/components/TurnBanner';
import { seatIdentity } from '@/components/seatIdentity';
import { cn } from '@/lib/utils';
import type { BoardProps } from '../types';
import * as spApi from './api';

/** Each group's colour on the board (pg. 1: green workers, blue buildings, orange aristocrats, tri-colour trading). */
const KIND_CLASS: Record<CardKind, string> = {
  worker: 'border-emerald-500/60 bg-emerald-500/10',
  building: 'border-sky-500/60 bg-sky-500/10',
  aristocrat: 'border-amber-500/60 bg-amber-500/10',
  trading: 'border-fuchsia-500/60 bg-fuchsia-500/10',
};

const KIND_LABEL: Record<CardKind, string> = {
  worker: 'Workers',
  building: 'Buildings',
  aristocrat: 'Aristocrats',
  trading: 'Trading',
};

/** Short phase label for a starting-player marker chip (a single letter keeps the chip tiny). */
const PHASE_MARK: Record<Phase, string> = { worker: 'W', building: 'B', aristocrat: 'A', trading: 'T' };

/**
 * The seat palette (the cross-game player-colour feature). The ids are the module's own catalog colours
 * (pg. 1's four wood-figure colours), in seat order; each maps to a Tailwind fill (literal strings so the
 * build keeps them). A seat with no picked colour falls back to its seat-index default.
 */
const SEAT_PALETTE = ['blue', 'yellow', 'green', 'red'] as const;
const SEAT_CLASS: Record<string, string> = {
  blue: 'bg-blue-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
};

/**
 * A single face-up card. When `onBuy` is given (the active driving seat can afford it) it renders as a
 * button; otherwise a static tile. The cost shown is the **effective** price for the active player — its
 * printed cost is struck through when reductions apply (pg. 6).
 */
function CardTile({
  card,
  effective,
  onBuy,
  disabled,
}: {
  card: Card;
  effective: number;
  onBuy?: () => void;
  disabled?: boolean;
}) {
  const reduced = effective !== card.cost;
  const inner = (
    <>
      <span className="self-start rounded bg-background/70 px-1 font-semibold tabular-nums">
        {reduced ? <s className="mr-0.5 opacity-50">{card.cost}</s> : null}
        {effective}
      </span>
      <span className="text-center font-medium leading-tight">{card.name}</span>
      <span className="self-end tabular-nums text-muted-foreground">
        {card.income > 0 ? `${card.income}₽` : ''}
        {card.points > 0 ? ` ${card.points}★` : ''}
      </span>
    </>
  );
  const className = cn(
    'flex h-20 w-16 shrink-0 flex-col justify-between rounded border p-1 text-left text-[10px]',
    KIND_CLASS[card.kind],
    onBuy && 'cursor-pointer ring-offset-1 transition hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary',
  );
  const title = `${card.name} — costs ${effective}${reduced ? ` (was ${card.cost})` : ''}`;
  if (onBuy) {
    return (
      <button type="button" data-testid={`sp-buy-${card.id}`} className={className} title={title} disabled={disabled} onClick={onBuy}>
        {inner}
      </button>
    );
  }
  return (
    <div data-testid={`sp-card-${card.id}`} className={className} title={title}>
      {inner}
    </div>
  );
}

/**
 * One player's panel — rubles (own only), public points, hand count, and grouped play area. The
 * `startsPhases` are the phases this seat opens next: its starting-player markers (pg. 5), which rotate one
 * seat left each round — so they visibly hop to a neighbour when the round rolls over.
 */
function PlayerPanel({
  player,
  isActive,
  isBot,
  startsPhases,
  colorId,
}: {
  player: PlayerView;
  isActive: boolean;
  isBot: boolean;
  startsPhases: readonly Phase[];
  colorId: string;
}) {
  const played = player.playArea.worker.length + player.playArea.building.length + player.playArea.aristocrat.length;
  return (
    <div
      data-testid={`player-${player.id}`}
      className={cn('rounded-lg border p-3 text-sm', isActive ? 'border-primary bg-primary/5' : 'bg-card')}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium">
          {/* The seat's chosen player colour (the cross-game palette feature). */}
          <span
            data-testid={`seat-legend-${player.id}`}
            data-color={colorId}
            aria-hidden
            className={cn('inline-block h-3 w-3 shrink-0 rounded-full', SEAT_CLASS[colorId] ?? 'bg-muted-foreground')}
          />
          {isBot ? '🤖 ' : ''}
          {player.name}
          {isActive ? ' ←' : ''}
          {startsPhases.map((phase) => (
            <span
              key={phase}
              data-testid={`sp-marker-${phase}-${player.id}`}
              title={`Starts the ${phase} phase`}
              aria-label={`Starting player marker: ${phase} phase`}
              className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-semibold', KIND_CLASS[phase])}
            >
              {PHASE_MARK[phase]}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-2">
          <span data-testid={`sp-points-${player.id}`} className="tabular-nums font-semibold" title="Victory points">
            {player.points}★
          </span>
          {player.rubles !== null ? (
            <span data-testid={`sp-rubles-${player.id}`} className="tabular-nums font-semibold">
              {player.rubles}₽
            </span>
          ) : (
            <span data-testid={`sp-rubles-hidden-${player.id}`} className="text-xs text-muted-foreground" title="Rubles are secret">
              🔒 rubles
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span data-testid={`sp-handcount-${player.id}`} className="inline-flex items-center gap-1" title={`${player.handCount} card(s) in hand — face down`}>
          Hand:
          {player.handCount === 0 ? (
            <span className="italic">0</span>
          ) : (
            <span className="inline-flex items-center gap-0.5" aria-hidden>
              {Array.from({ length: player.handCount }, (_, i) => (
                <span key={i} className="inline-block h-3 w-2 rounded-[1px] border border-muted-foreground/50 bg-muted-foreground/20" />
              ))}
            </span>
          )}
          <span className="tabular-nums">{player.handCount}</span>
        </span>
        <span>Workers: {player.playArea.worker.length}</span>
        <span>Buildings: {player.playArea.building.length}</span>
        <span>Aristocrats: {player.playArea.aristocrat.length}</span>
        {played === 0 ? <span className="italic">empty play area</span> : null}
      </div>
    </div>
  );
}

/** A candidate displacement: an owned card to discard and what the trading card then costs (pg. 7). */
type TradeOption = { readonly target: Card; readonly cost: number };

/** The displacement targets `tradingCard` can afford from `player`'s play area (pg. 7), each with its cost. */
function tradeOptions(player: PlayerView, tradingCard: Card, fromRow?: 'upper' | 'lower'): TradeOption[] {
  if (player.rubles === null) return [];
  return legalDisplaceTargets(player, tradingCard)
    .map((target) => ({ target, cost: displacementCost(player, tradingCard, target, fromRow) }))
    .filter((o) => o.cost <= player.rubles!);
}

/**
 * The viewer's own hidden hand (pg. 3), rendered as playable cards. Only the active driving seat can play
 * (`playable`); an own but off-turn seat still sees its cards, greyed. A **trading** card is played by
 * *displacing* a card you own (SP4, pg. 7): clicking it opens the displacement picker (or acts at once when
 * there is a single legal target). Effective cost is shown (printed struck through when reduced), and a
 * trading card with nothing legal to displace stays disabled.
 */
function HandSection({
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
    <div data-testid={`sp-hand-panel-${player.id}`} className="rounded-lg border bg-card p-3">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        Your hand ({hand.length}/{handLimit(player)})
      </div>
      <div className="flex min-h-[5.5rem] flex-wrap gap-1.5">
        {hand.length === 0 ? (
          <span className="text-xs italic text-muted-foreground">empty — take a card from a row into your hand</span>
        ) : (
          hand.map((card, index) => {
            const trading = card.kind === 'trading';
            const options = trading ? tradeOptions(player, card) : [];
            // A trading card's shown price is the cheapest affordable displacement; a plain card its hand cost.
            const cost = trading ? (options.length ? Math.min(...options.map((o) => o.cost)) : card.cost) : handCost(player, card);
            const reduced = cost !== card.cost;
            const canPlay = playable && (trading ? options.length > 0 : player.rubles !== null && player.rubles >= cost);
            const title = trading
              ? options.length
                ? `${card.name} — upgrade by displacing a card you own (from ${cost}₽)`
                : `${card.name} — no card of yours to displace, or you can't afford it (pg. 7)`
              : `${card.name} — play for ${cost}${reduced ? ` (was ${card.cost})` : ''}`;
            return (
              <button
                key={card.id}
                type="button"
                data-testid={`sp-play-${index}`}
                className={cn(
                  'flex h-20 w-16 shrink-0 flex-col justify-between rounded border p-1 text-left text-[10px]',
                  KIND_CLASS[card.kind],
                  canPlay
                    ? 'cursor-pointer ring-offset-1 transition hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary'
                    : 'opacity-60',
                )}
                title={title}
                disabled={!canPlay || busy}
                onClick={() => (trading ? onTrade(card, index, options) : onPlay(index))}
              >
                <span className="self-start rounded bg-background/70 px-1 font-semibold tabular-nums">
                  {reduced ? <s className="mr-0.5 opacity-50">{card.cost}</s> : null}
                  {cost}
                </span>
                <span className="text-center font-medium leading-tight">{card.name}</span>
                <span className="self-end text-[9px] text-muted-foreground">{trading ? 'upgrade' : 'play'}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Saint Petersburg's board — the whole game as one plugin the shell renders (roadmap SP1).
 *
 * Interactive across the whole game: the active driving seat clicks an affordable card in either row to
 * buy it (effective cost shown, printed cost struck through when reduced), takes a card into hand (free),
 * plays from its hand, or presses Pass. A **trading** card is bought/played by *displacing* a card you own
 * (SP4, pg. 7) — click it to pick which card to discard (a single legal target acts at once). Everything
 * Saint Petersburg knows lives at or below this file; the shell hands it an opaque state it never reads,
 * pinned back to `StPetersburgView` here.
 */
export default function StPetersburgBoard({
  gameId,
  game,
  bots,
  colors,
  controlledIds,
  viewer,
  busy,
  guard,
  onPayload,
  onLeave,
}: BoardProps<StPetersburgView>) {
  const active = game.players[game.activePlayerIndex];
  const ended = game.status === 'ended';
  const playerName = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
  // The colour a seat picked (colors[id] → a palette id), or its seat-index default — the same
  // fallback the other games use so an un-picked game still shows distinct seat colours.
  const colorIdOf = (playerId: string): string => {
    const picked = colors[playerId];
    if (picked !== undefined && SEAT_CLASS[picked]) return picked;
    const seat = game.players.findIndex((p) => p.id === playerId);
    return SEAT_PALETTE[(seat < 0 ? 0 : seat) % SEAT_PALETTE.length]!;
  };
  const { canDrive, myNames } = seatIdentity({
    players: game.players,
    activePlayerId: active?.id ?? null,
    bots,
    controlledIds,
  });

  // An open displacement picker (pg. 7): the trading card being bought/played, and how each candidate
  // target resolves to a `BUY`/`PLAY_FROM_HAND`. Shown when a trading card has more than one legal target.
  const [picker, setPicker] = useState<{ title: string; options: TradeOption[]; act: (targetId: string) => void } | null>(null);

  // Which phases each seat opens next (its starting-player markers, pg. 5) — indexed by seat.
  const markersFor = (seatIndex: number): Phase[] => PHASES.filter((phase) => game.startingPlayers[phase] === seatIndex);

  const run = (work: () => Promise<spApi.StPetersburgPayload>) => guard(async () => onPayload(await work()));
  const doBuy = (row: 'upper' | 'lower', index: number, displace?: string) => {
    if (!canDrive || !active) return;
    setPicker(null);
    void run(() => spApi.act(gameId, active.id, { type: 'BUY', row, index, ...(displace ? { displace } : {}) }, viewer));
  };
  const doAdd = (row: 'upper' | 'lower', index: number) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'ADD_TO_HAND', row, index }, viewer));
  };
  const doPlay = (index: number, displace?: string) => {
    if (!canDrive || !active) return;
    setPicker(null);
    void run(() => spApi.act(gameId, active.id, { type: 'PLAY_FROM_HAND', index, ...(displace ? { displace } : {}) }, viewer));
  };
  const doPass = () => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'PASS' }, viewer));
  };

  // ── SP5 special-card interludes (pg. 8) ──
  // While a Pub buy-points window or an Observatory draw is pending, the active seat's turn is locked to
  // resolving it — the normal buy/add/play/pass affordances are hidden and a focused prompt shows instead.
  const interlude = !!game.pendingPubBuy || !!game.pendingDraw;
  // No affordances once the game has ended (pg. 5): the engine refuses every move with GAME_OVER, so the
  // board offers none — the results screen renders instead.
  const acting = canDrive && !interlude && !ended;

  const doPubBuy = (points: number) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'PUB_BUY', points }, viewer));
  };
  const doObservatoryDraw = (stack: CardKind) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'OBSERVATORY_DRAW', stack }, viewer));
  };
  const doResolve = (choice: 'buy' | 'hand' | 'discard', displace?: string) => {
    if (!canDrive || !active) return;
    setPicker(null);
    void run(() => spApi.act(gameId, active.id, { type: 'OBSERVATORY_RESOLVE', choice, ...(displace ? { displace } : {}) }, viewer));
  };

  // Buy/play a trading card by displacement (pg. 7): with a single legal target act at once, otherwise open
  // the picker so the driver chooses which card of theirs to discard.
  const startTrade = (title: string, options: TradeOption[], act: (targetId: string) => void) => {
    if (options.length === 0) return;
    if (options.length === 1) act(options[0]!.target.id);
    else setPicker({ title, options, act });
  };
  const startRowTrade = (card: Card, row: 'upper' | 'lower', index: number, options: TradeOption[]) =>
    startTrade(`Upgrade to ${card.name} — choose a card to displace`, options, (targetId) => doBuy(row, index, targetId));
  const startHandTrade = (card: Card, index: number, options: TradeOption[]) =>
    startTrade(`Play ${card.name} — choose a card to displace`, options, (targetId) => doPlay(index, targetId));

  // The active driving seat may add ANY row card to its hand (free, pg. 3) while under the hand limit.
  const canAddToHand = acting && !!active && active.handCount < handLimit(active);

  // The active player's effective cost for a card (public — reads only its play area). A card is buyable
  // when this client drives, the game is live, it isn't a trading card (SP4), and the active seat can afford it.
  const costOf = (card: Card, row: 'upper' | 'lower') => (active ? effectiveCost(active, card, row) : card.cost);
  const buyableCost = (card: Card, row: 'upper' | 'lower'): number | undefined => {
    if (!acting || !active || card.kind === 'trading') return undefined;
    const cost = costOf(card, row);
    return active.rubles !== null && active.rubles >= cost ? cost : undefined;
  };

  // Observatory (pg. 8): the active driving seat may draw (instead of a normal action) in the building phase
  // if it owns an unflipped one; a stack is drawable only when it holds ≥2 cards ("not the last card").
  const myObservatories = acting && active && game.phase === 'building' ? unusedObservatories(active, game.observatoryUsed) : [];
  const canUseObservatory = myObservatories.length > 0;

  const renderRow = (row: 'upper' | 'lower') =>
    game.board[row].map((card, index) => {
      const trading = card.kind === 'trading';
      // A trading card is bought by displacement (pg. 7): its options + cheapest affordable price.
      const rowTradeOpts = trading && acting && active ? tradeOptions(active, card, row) : [];
      const tradingCost = rowTradeOpts.length ? Math.min(...rowTradeOpts.map((o) => o.cost)) : undefined;
      const affordableCost = trading ? tradingCost : buyableCost(card, row);
      const onBuy =
        affordableCost === undefined
          ? undefined
          : trading
            ? () => startRowTrade(card, row, index, rowTradeOpts)
            : () => doBuy(row, index);
      return (
        <div key={card.id} className="flex shrink-0 flex-col gap-1">
          <CardTile
            card={card}
            effective={trading ? (affordableCost ?? card.cost) : costOf(card, row)}
            onBuy={onBuy}
            disabled={busy}
          />
          {canAddToHand ? (
            <button
              type="button"
              data-testid={`sp-hand-${card.id}`}
              className="rounded border border-dashed border-muted-foreground/50 px-1 py-0.5 text-[9px] text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
              title={`Add ${card.name} to your hand (free)`}
              disabled={busy}
              onClick={() => doAdd(row, index)}
            >
              + Hand
            </button>
          ) : null}
        </div>
      );
    });

  // The viewer's own hand(s): seats whose hand contents are visible (never redacted for the viewer).
  const ownHands = game.players.filter((p) => p.hand !== null);

  return (
    <div data-testid="board" className="space-y-4">
      {/* Final scoring (pg. 5–6, SP6): the shared end-of-game frame with the per-player breakdown —
          base points + distinct-aristocrat table + 1 pt per 10₽ − 5 per hand card = total. */}
      {ended && game.status === 'ended' && (
        <GameOver winnerNames={game.winnerIds.map((id) => playerName(id))} onNewGame={onLeave}>
          <table className="w-full text-sm" data-testid="sp-results">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Player</th>
                <th className="px-1 font-medium" title="Points already banked on the score track">Base</th>
                <th className="px-1 font-medium" title="Distinct aristocrats, scored by the board table">Aristocrats</th>
                <th className="px-1 font-medium" title="1 point per full 10 rubles">Money</th>
                <th className="px-1 font-medium" title="−5 per card still in hand">Hand</th>
                <th className="pl-1 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...game.results]
                .sort((a, b) => b.total - a.total)
                .map((r) => {
                  const won = game.status === 'ended' && game.winnerIds.includes(r.playerId);
                  return (
                    <tr key={r.playerId} data-testid={`sp-result-${r.playerId}`} className={cn('border-t', won && 'font-semibold text-primary')}>
                      <td className="py-1 pr-2 font-medium">
                        {playerName(r.playerId)}
                        {won ? ' 🏁' : ''}
                      </td>
                      <td className="px-1 tabular-nums text-muted-foreground">{r.base}</td>
                      <td className="px-1 tabular-nums text-muted-foreground" title={`${r.distinctAristocrats} distinct`}>
                        {r.aristocrats}
                        <span className="ml-0.5 text-[10px]">×{r.distinctAristocrats}</span>
                      </td>
                      <td className="px-1 tabular-nums text-muted-foreground">{r.money}</td>
                      <td className="px-1 tabular-nums text-muted-foreground">{r.handPenalty > 0 ? `−${r.handPenalty}` : '0'}</td>
                      <td className="pl-1 text-right font-semibold tabular-nums">{r.total}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </GameOver>
      )}
      <TurnBanner testId="sp-banner" canDrive={canDrive} className="mb-0">
        <span>
          {myNames ? (
            <>
              You are <span className="font-medium">{myNames.join(', ')}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Hotseat — pass the device</span>
          )}
        </span>
        <span className="font-medium capitalize">
          {game.phase} phase · {active?.name ?? '—'}
        </span>
      </TurnBanner>

      {/* Displacement picker (pg. 7): a trading card with more than one legal target to displace. */}
      {picker ? (
        <div data-testid="sp-displace-picker" className="rounded-lg border border-primary bg-primary/5 p-3">
          <div className="mb-2 text-sm font-medium">{picker.title}</div>
          <div className="flex flex-wrap gap-2">
            {picker.options.map(({ target, cost }) => (
              <button
                key={target.id}
                type="button"
                data-testid={`sp-displace-${target.id}`}
                className="rounded border bg-card px-2 py-1 text-xs transition hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-primary"
                title={`Displace ${target.name} — pay ${cost}₽`}
                disabled={busy}
                onClick={() => picker.act(target.id)}
              >
                <span className="font-medium">{target.name}</span> · <span className="tabular-nums">{cost}₽</span>
              </button>
            ))}
            <button
              type="button"
              data-testid="sp-displace-cancel"
              className="rounded border px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
              onClick={() => setPicker(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* Phase track — which of the four phases is in progress (pg. 2). */}
      <div className="flex flex-wrap gap-2 text-xs" role="group" aria-label="Phase order">
        {PHASES.map((phase) => (
          <span
            key={phase}
            data-testid={`sp-phase-${phase}`}
            className={cn(
              'rounded-full border px-2 py-0.5 capitalize',
              phase === game.phase ? 'border-primary bg-primary/10 font-semibold' : 'text-muted-foreground',
            )}
            aria-current={phase === game.phase ? 'step' : undefined}
          >
            {phase}
          </span>
        ))}
      </div>

      {/* The board: two face-up card rows + the four face-down draw stacks (counts only). */}
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Upper row (new cards)</div>
          <div data-testid="sp-upper-row" className="flex min-h-[5.5rem] gap-1.5 overflow-x-auto">
            {game.board.upper.length > 0 ? renderRow('upper') : <span className="text-xs italic text-muted-foreground">empty</span>}
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Lower row (−1 ruble)</div>
          <div data-testid="sp-lower-row" className="flex min-h-[5.5rem] gap-1.5 overflow-x-auto">
            {game.board.lower.length > 0 ? renderRow('lower') : <span className="text-xs italic text-muted-foreground">empty (round 1)</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-2">
          {(Object.keys(game.board.stacks) as CardKind[]).map((kind) => (
            <div
              key={kind}
              data-testid={`sp-stack-${kind}`}
              className={cn(
                'flex flex-col items-center rounded border px-3 py-1.5 text-xs',
                kind === game.phase ? 'border-primary bg-primary/10' : 'bg-background',
              )}
              title={`${KIND_LABEL[kind]} stack`}
            >
              <span className="font-medium">{KIND_LABEL[kind]}</span>
              <span className="tabular-nums text-muted-foreground">{game.board.stacks[kind]} left</span>
            </div>
          ))}
          <div data-testid="sp-discard" className="flex flex-col items-center rounded border bg-background px-3 py-1.5 text-xs">
            <span className="font-medium">Discard</span>
            <span className="tabular-nums text-muted-foreground">{game.board.discard}</span>
          </div>
        </div>
      </div>

      {/* Pub interlude (pg. 8): after building scoring, the Pub owner on the clock buys up to 5 points. */}
      {game.pendingPubBuy && active ? (
        <div data-testid="sp-pub-prompt" className="rounded-lg border border-primary bg-primary/5 p-3">
          {canDrive ? (
            <>
              <div className="mb-2 text-sm font-medium">
                Pub — buy up to {PUB_MAX_POINTS} points at {PUB_POINT_COST}₽ each ({active.name})
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: PUB_MAX_POINTS + 1 }, (_, points) => {
                  const cost = points * PUB_POINT_COST;
                  const affordable = active.rubles !== null && active.rubles >= cost;
                  return (
                    <Button
                      key={points}
                      variant={points === 0 ? 'ghost' : 'outline'}
                      size="sm"
                      data-testid={`sp-pub-buy-${points}`}
                      disabled={busy || !affordable}
                      title={points === 0 ? 'Decline' : `Buy ${points} point(s) for ${cost}₽`}
                      onClick={() => doPubBuy(points)}
                    >
                      {points === 0 ? 'Decline' : `+${points}★ · ${cost}₽`}
                    </Button>
                  );
                })}
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Waiting for {active.name} to use the Pub…</span>
          )}
        </div>
      ) : null}

      {/* Observatory resolve (pg. 8): the drawn card is public; its owner buys / hands / discards it. */}
      {game.pendingDraw && active ? (
        <div data-testid="sp-observatory-prompt" className="rounded-lg border border-primary bg-primary/5 p-3">
          {canDrive ? (
            (() => {
              const card = game.pendingDraw.card;
              const trading = card.kind === 'trading';
              const opts = trading ? tradeOptions(active, card) : [];
              const buyCost = trading ? (opts.length ? Math.min(...opts.map((o) => o.cost)) : undefined) : handCost(active, card);
              const canBuy = trading ? opts.length > 0 : active.rubles !== null && buyCost !== undefined && active.rubles >= buyCost;
              const canHand = active.handCount < handLimit(active);
              return (
                <>
                  <div className="mb-2 text-sm font-medium">
                    Observatory — drew the <span className="capitalize">{card.name}</span> ({active.name})
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTile card={card} effective={buyCost ?? card.cost} />
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="sp-observatory-buy"
                      disabled={busy || !canBuy}
                      title={canBuy ? `Buy and place${buyCost !== undefined ? ` for ${buyCost}₽` : ''}` : 'Cannot afford / nothing to displace'}
                      onClick={() =>
                        trading
                          ? startTrade(`Buy ${card.name} — choose a card to displace`, opts, (targetId) => doResolve('buy', targetId))
                          : doResolve('buy')
                      }
                    >
                      Buy{buyCost !== undefined ? ` · ${buyCost}₽` : ''}
                    </Button>
                    <Button variant="outline" size="sm" data-testid="sp-observatory-hand" disabled={busy || !canHand} title={canHand ? 'Add to hand (free)' : 'Hand full'} onClick={() => doResolve('hand')}>
                      Add to hand
                    </Button>
                    <Button variant="ghost" size="sm" data-testid="sp-observatory-discard" disabled={busy} onClick={() => doResolve('discard')}>
                      Discard
                    </Button>
                  </div>
                </>
              );
            })()
          ) : (
            <span className="text-sm text-muted-foreground">Waiting for {active.name} to resolve the Observatory draw…</span>
          )}
        </div>
      ) : null}

      {/* Controls: the active driving seat buys by clicking a card above, may use the Observatory, or passes. */}
      {!interlude && !ended ? (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border bg-card p-3">
          {!canDrive ? (
            <span className="text-sm text-muted-foreground">Waiting for {active?.name ?? 'the other player'}…</span>
          ) : (
            <>
              <span className="text-sm text-muted-foreground">Buy a card above, or</span>
              {canUseObservatory ? (
                <span className="flex items-center gap-1" data-testid="sp-observatory-draw">
                  <span className="text-sm text-muted-foreground">Observatory — draw:</span>
                  {(CARD_KINDS as readonly CardKind[]).map((kind) => (
                    <Button
                      key={kind}
                      variant="outline"
                      size="sm"
                      data-testid={`sp-observatory-draw-${kind}`}
                      disabled={busy || game.board.stacks[kind] < 2}
                      title={game.board.stacks[kind] < 2 ? `The ${kind} stack has too few cards` : `Draw the top ${kind} card`}
                      onClick={() => doObservatoryDraw(kind)}
                    >
                      {kind[0]!.toUpperCase()}
                    </Button>
                  ))}
                </span>
              ) : null}
              <Button variant="outline" size="sm" data-testid="sp-pass" disabled={busy} onClick={doPass}>
                Pass
              </Button>
            </>
          )}
        </div>
      ) : null}

      {/* The viewer's own hidden hand (pg. 3) — playable cards. Opponents' hands show only as a face-down
          count on their panel below. */}
      {ownHands.map((player) => (
        <HandSection
          key={player.id}
          player={player}
          playable={acting && player.id === active?.id}
          busy={busy}
          onPlay={doPlay}
          onTrade={startHandTrade}
        />
      ))}

      {/* Players — rubles are the game's secret, so opponents show a lock, not a number. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {game.players.map((player, seatIndex) => (
          <PlayerPanel
            key={player.id}
            player={player}
            isActive={player.id === active?.id}
            isBot={bots.includes(player.id)}
            startsPhases={markersFor(seatIndex)}
            colorId={colorIdOf(player.id)}
          />
        ))}
      </div>

      <ActivityFeed
        log={game.log}
        players={game.players}
        botIds={bots}
        describe={(entry) => {
          if (entry.type === 'BUY') {
            const p = entry.payload as { cardName?: string; cost?: number; displacedName?: string } | undefined;
            if (p?.displacedName) return `upgraded the ${p.displacedName} to the ${p.cardName} (${p.cost}₽)`;
            return p ? `bought the ${p.cardName} for ${p.cost}₽` : 'bought a card';
          }
          if (entry.type === 'ADD_TO_HAND') {
            // The take is public — everyone at the table sees which card you take from the open rows — so
            // the feed NAMES it. The hand is secret only as a *set* afterward (see the engine's addToHand).
            const p = entry.payload as { cardName?: string } | undefined;
            return p?.cardName ? `took the ${p.cardName} into hand` : 'took a card into hand';
          }
          if (entry.type === 'PLAY_FROM_HAND') {
            const p = entry.payload as { cardName?: string; cost?: number; displacedName?: string } | undefined;
            if (p?.displacedName) return `upgraded the ${p.displacedName} to the ${p.cardName} from hand (${p.cost}₽)`;
            return p ? `played the ${p.cardName} from hand for ${p.cost}₽` : 'played a card from hand';
          }
          if (entry.type === 'PASS') {
            const p = entry.payload as { closedPhase?: string; nextRound?: number; pubPending?: boolean } | undefined;
            if (p?.nextRound) return `passed — Round ${p.nextRound}: lower row discarded, markers passed left`;
            if (p?.pubPending) return 'passed — buildings scored; the Pub is open';
            return p?.closedPhase ? `passed — ${p.closedPhase} phase scored` : 'passed';
          }
          if (entry.type === 'PUB_BUY') {
            const p = entry.payload as { points?: number; cost?: number } | undefined;
            return p && p.points ? `bought ${p.points} point(s) at the Pub for ${p.cost}₽` : 'declined the Pub';
          }
          if (entry.type === 'OBSERVATORY_DRAW') {
            const p = entry.payload as { stack?: string; cardName?: string } | undefined;
            return p?.cardName ? `drew the ${p.cardName} from the ${p.stack} stack (Observatory)` : 'drew from a stack (Observatory)';
          }
          if (entry.type === 'OBSERVATORY_RESOLVE') {
            const p = entry.payload as { choice?: string; cardName?: string; cost?: number; displacedName?: string } | undefined;
            if (!p) return 'resolved the Observatory draw';
            if (p.choice === 'discard') return `discarded the ${p.cardName} (Observatory)`;
            if (p.choice === 'hand') return `took the ${p.cardName} into hand (Observatory)`;
            if (p.displacedName) return `upgraded the ${p.displacedName} to the ${p.cardName} (Observatory, ${p.cost}₽)`;
            return `bought the ${p.cardName} for ${p.cost}₽ (Observatory)`;
          }
          return entry.type.toLowerCase();
        }}
        testId="sp-log"
      />
    </div>
  );
}
