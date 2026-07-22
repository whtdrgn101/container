import { PHASES, effectiveCost, handCost, handLimit } from '@game-hub/engine/stpetersburg';
import type { Card, CardKind, Phase, PlayerView, StPetersburgView } from '@game-hub/engine/stpetersburg';
import { Button } from '@/components/ui/button';
import { ActivityFeed } from '@/components/ActivityFeed';
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
}: {
  player: PlayerView;
  isActive: boolean;
  isBot: boolean;
  startsPhases: readonly Phase[];
}) {
  const played = player.playArea.worker.length + player.playArea.building.length + player.playArea.aristocrat.length;
  return (
    <div
      data-testid={`player-${player.id}`}
      className={cn('rounded-lg border p-3 text-sm', isActive ? 'border-primary bg-primary/5' : 'bg-card')}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium">
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

/**
 * The viewer's own hidden hand (pg. 3), rendered as playable cards. Only the active driving seat can play
 * (`playable`); an own but off-turn seat still sees its cards, greyed. A **trading** card can be *held*
 * but not *played* until displacement exists (SP4), so it shows a disabled "needs SP4" state. Effective
 * play cost is shown (printed struck through when reductions apply) — the same `handCost` the engine charges.
 */
function HandSection({
  player,
  playable,
  busy,
  onPlay,
}: {
  player: PlayerView;
  playable: boolean;
  busy: boolean;
  onPlay: (index: number) => void;
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
            const cost = handCost(player, card);
            const reduced = cost !== card.cost;
            const canPlay = playable && !trading && player.rubles !== null && player.rubles >= cost;
            const title = trading
              ? `${card.name} — trading cards can't be played yet (needs SP4)`
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
                onClick={() => onPlay(index)}
              >
                <span className="self-start rounded bg-background/70 px-1 font-semibold tabular-nums">
                  {reduced ? <s className="mr-0.5 opacity-50">{card.cost}</s> : null}
                  {cost}
                </span>
                <span className="text-center font-medium leading-tight">{card.name}</span>
                <span className="self-end text-[9px] text-muted-foreground">{trading ? 'needs SP4' : 'play'}</span>
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
 * Interactive for the phase spine: the active driving seat clicks an affordable card in either row to buy
 * it (effective cost shown, printed cost struck through when reduced), or presses Pass. Everything Saint
 * Petersburg knows lives at or below this file; the shell hands it an opaque state it never reads, pinned
 * back to `StPetersburgView` here. `ADD_TO_HAND` / `PLAY_FROM_HAND` and the trading cards land in SP3–SP4.
 */
export default function StPetersburgBoard({
  gameId,
  game,
  bots,
  controlledIds,
  viewer,
  busy,
  guard,
  onPayload,
}: BoardProps<StPetersburgView>) {
  const active = game.players[game.activePlayerIndex];
  const { canDrive, myNames } = seatIdentity({
    players: game.players,
    activePlayerId: active?.id ?? null,
    bots,
    controlledIds,
  });

  // Which phases each seat opens next (its starting-player markers, pg. 5) — indexed by seat.
  const markersFor = (seatIndex: number): Phase[] => PHASES.filter((phase) => game.startingPlayers[phase] === seatIndex);

  const run = (work: () => Promise<spApi.StPetersburgPayload>) => guard(async () => onPayload(await work()));
  const doBuy = (row: 'upper' | 'lower', index: number) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'BUY', row, index }, viewer));
  };
  const doAdd = (row: 'upper' | 'lower', index: number) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'ADD_TO_HAND', row, index }, viewer));
  };
  const doPlay = (index: number) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'PLAY_FROM_HAND', index }, viewer));
  };
  const doPass = () => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'PASS' }, viewer));
  };

  // The active driving seat may add ANY row card to its hand (free, pg. 3) while under the hand limit.
  const canAddToHand = canDrive && !!active && active.handCount < handLimit(active);

  // The active player's effective cost for a card (public — reads only its play area). A card is buyable
  // when this client drives, the game is live, it isn't a trading card (SP4), and the active seat can afford it.
  const costOf = (card: Card, row: 'upper' | 'lower') => (active ? effectiveCost(active, card, row) : card.cost);
  const buyableCost = (card: Card, row: 'upper' | 'lower'): number | undefined => {
    if (!canDrive || !active || card.kind === 'trading') return undefined;
    const cost = costOf(card, row);
    return active.rubles !== null && active.rubles >= cost ? cost : undefined;
  };

  const renderRow = (row: 'upper' | 'lower') =>
    game.board[row].map((card, index) => {
      const affordableCost = buyableCost(card, row);
      return (
        <div key={card.id} className="flex shrink-0 flex-col gap-1">
          <CardTile
            card={card}
            effective={costOf(card, row)}
            onBuy={affordableCost !== undefined ? () => doBuy(row, index) : undefined}
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

      {/* Controls: the active driving seat buys by clicking a card above, or passes here. */}
      <div className="flex items-center justify-center gap-3 rounded-lg border bg-card p-3">
        {!canDrive ? (
          <span className="text-sm text-muted-foreground">Waiting for {active?.name ?? 'the other player'}…</span>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">Buy a card above, or</span>
            <Button variant="outline" size="sm" data-testid="sp-pass" disabled={busy} onClick={doPass}>
              Pass
            </Button>
          </>
        )}
      </div>

      {/* The viewer's own hidden hand (pg. 3) — playable cards. Opponents' hands show only as a face-down
          count on their panel below. */}
      {ownHands.map((player) => (
        <HandSection key={player.id} player={player} playable={canDrive && player.id === active?.id} busy={busy} onPlay={doPlay} />
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
          />
        ))}
      </div>

      <ActivityFeed
        log={game.log}
        players={game.players}
        botIds={bots}
        describe={(entry) => {
          if (entry.type === 'BUY') {
            const p = entry.payload as { cardName?: string; cost?: number } | undefined;
            return p ? `bought the ${p.cardName} for ${p.cost}₽` : 'bought a card';
          }
          if (entry.type === 'ADD_TO_HAND') {
            // The take is public — everyone at the table sees which card you take from the open rows — so
            // the feed NAMES it. The hand is secret only as a *set* afterward (see the engine's addToHand).
            const p = entry.payload as { cardName?: string } | undefined;
            return p?.cardName ? `took the ${p.cardName} into hand` : 'took a card into hand';
          }
          if (entry.type === 'PLAY_FROM_HAND') {
            const p = entry.payload as { cardName?: string; cost?: number } | undefined;
            return p ? `played the ${p.cardName} from hand for ${p.cost}₽` : 'played a card from hand';
          }
          if (entry.type === 'PASS') {
            const p = entry.payload as { closedPhase?: string; nextRound?: number } | undefined;
            if (p?.nextRound) return `passed — Round ${p.nextRound}: lower row discarded, markers passed left`;
            return p?.closedPhase ? `passed — ${p.closedPhase} phase scored` : 'passed';
          }
          return entry.type.toLowerCase();
        }}
        testId="sp-log"
      />
    </div>
  );
}
