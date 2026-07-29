import { useState } from 'react';
import {
  CARD_KINDS,
  PHASES,
  PUB_MAX_POINTS,
  PUB_POINT_COST,
  handCost,
  handLimit,
  unusedObservatories,
} from '../engine';
import type { Card, CardKind, Phase, PlayerView, StPetersburgView } from '../engine';
import { ActionTip, ActivityFeed, Button, cn, seatIdentity, TurnBanner } from '@game-hub/ui-kit';
import type { BoardProps } from './types';
import * as spApi from './api';
import { CardFace } from './art';
import { CardRow } from './CardRow';
import { PlayerPanel, SEAT_CLASS, SEAT_PALETTE, tradeOptions } from './PlayerPanel';
import type { TradeOption } from './PlayerPanel';
import { Results } from './Results';
import { describeMove } from './feed';
import { pubTip, SP_TIPS } from './tips';

/**
 * Saint Petersburg's board — the "Malachite & Gilt" salon (SP8, comps rev 2). The whole game as one plugin
 * the shell renders: the malachite card table (`CardRow`) with its gilt fittings, the player tableaus
 * (`PlayerPanel` — own seats full, opponents compact-and-expandable), the SP5 special-card interludes, and
 * final scoring. Everything Saint Petersburg knows lives at or below this file; the shell hands it an opaque
 * state it never reads, pinned back to `StPetersburgView` here.
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
  // The colour a seat picked (colors[id] → a palette id), or its seat-index default — the same fallback the
  // other games use so an un-picked game still shows distinct seat colours.
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

  // An open displacement picker (pg. 7): the trading card being bought/played, and how each candidate target
  // resolves to a `BUY`/`PLAY_FROM_HAND`. Shown when a trading card has more than one legal target.
  const [picker, setPicker] = useState<{
    title: string;
    options: TradeOption[];
    act: (targetId: string) => void;
  } | null>(null);
  // Which collapsed opponent tableaus are expanded (read-only, their cards are public).
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // Which phases each seat opens next (its starting-player markers, pg. 5) — indexed by seat.
  const markersFor = (seatIndex: number): Phase[] =>
    PHASES.filter((phase) => game.startingPlayers[phase] === seatIndex);

  const run = (work: () => Promise<spApi.StPetersburgPayload>) => guard(async () => onPayload(await work()));
  const doBuy = (row: 'upper' | 'lower', index: number, displace?: string) => {
    if (!canDrive || !active) return;
    setPicker(null);
    void run(() =>
      spApi.act(
        gameId,
        active.id,
        { type: 'BUY', row, index, ...(displace ? { displace } : {}) },
        viewer,
        game.version,
      ),
    );
  };
  const doAdd = (row: 'upper' | 'lower', index: number) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'ADD_TO_HAND', row, index }, viewer, game.version));
  };
  const doPlay = (index: number, displace?: string) => {
    if (!canDrive || !active) return;
    setPicker(null);
    void run(() =>
      spApi.act(
        gameId,
        active.id,
        { type: 'PLAY_FROM_HAND', index, ...(displace ? { displace } : {}) },
        viewer,
        game.version,
      ),
    );
  };
  const doPass = () => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'PASS' }, viewer, game.version));
  };

  // ── SP5 special-card interludes (pg. 8) ──
  // While a Pub buy-points window or an Observatory draw is pending, the active seat's turn is locked to
  // resolving it — the normal buy/add/play/pass affordances are hidden and a focused prompt shows instead.
  const interlude = !!game.pendingPubBuy || !!game.pendingDraw;
  // No affordances once the game has ended (pg. 5): the engine refuses every move with GAME_OVER.
  const acting = canDrive && !interlude && !ended;

  const doPubBuy = (points: number) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'PUB_BUY', points }, viewer, game.version));
  };
  const doObservatoryDraw = (stack: CardKind) => {
    if (!canDrive || !active) return;
    void run(() => spApi.act(gameId, active.id, { type: 'OBSERVATORY_DRAW', stack }, viewer, game.version));
  };
  const doResolve = (choice: 'buy' | 'hand' | 'discard', displace?: string) => {
    if (!canDrive || !active) return;
    setPicker(null);
    void run(() =>
      spApi.act(
        gameId,
        active.id,
        { type: 'OBSERVATORY_RESOLVE', choice, ...(displace ? { displace } : {}) },
        viewer,
        game.version,
      ),
    );
  };

  // Buy/play a trading card by displacement (pg. 7): a single legal target acts at once, otherwise open the
  // picker so the driver chooses which card of theirs to discard.
  const startTrade = (title: string, options: TradeOption[], act: (targetId: string) => void) => {
    if (options.length === 0) return;
    if (options.length === 1) act(options[0]!.target.id);
    else setPicker({ title, options, act });
  };
  const onRowTrade = (card: Card, row: 'upper' | 'lower', index: number, options: TradeOption[]) =>
    startTrade(`Upgrade to ${card.name} — choose a card to displace`, options, (targetId) =>
      doBuy(row, index, targetId),
    );
  const onHandTrade = (card: Card, index: number, options: TradeOption[]) =>
    startTrade(`Play ${card.name} — choose a card to displace`, options, (targetId) => doPlay(index, targetId));

  // The active driving seat may add ANY row card to its hand (free, pg. 3) while under the hand limit.
  const canAddToHand = acting && !!active && active.handCount < handLimit(active);

  // Observatory (pg. 8): the active driving seat may draw (instead of a normal action) in the building phase
  // if it owns an unflipped one; a stack is drawable only when it holds ≥2 cards ("not the last card").
  const myObservatories =
    acting && active && game.phase === 'building' ? unusedObservatories(active, game.observatoryUsed) : [];
  const canUseObservatory = myObservatories.length > 0;

  // Own seat(s) get the full tableau; everyone else the compact expandable row. Hotseat (no bound seats)
  // follows the active player — the same split Stone Age uses.
  const detailedIds = controlledIds && controlledIds.length > 0 ? controlledIds : active ? [active.id] : [];
  const detailed = game.players.filter((p) => detailedIds.includes(p.id));
  const rest = game.players.filter((p) => !detailedIds.includes(p.id));
  const panelFor = (player: PlayerView, isDetailed: boolean) => (
    <PlayerPanel
      key={player.id}
      player={player}
      isActive={player.id === active?.id}
      isBot={bots.includes(player.id)}
      colorId={colorIdOf(player.id)}
      startsPhases={markersFor(game.players.indexOf(player))}
      detailed={isDetailed}
      expanded={!!expanded[player.id]}
      onToggleExpand={() => toggleExpand(player.id)}
      playable={acting && player.id === active?.id}
      busy={busy}
      onPlay={doPlay}
      onTrade={onHandTrade}
    />
  );

  return (
    <div data-testid="board" className="space-y-4">
      {/* Final scoring (pg. 5–6, SP6): the shared end-of-game frame with the per-player breakdown. */}
      {ended && game.status === 'ended' && <Results game={game} playerName={playerName} onLeave={onLeave} />}

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
              <ActionTip key={target.id} tip={`Displace ${target.name} — pay ${cost}₽ to complete the upgrade.`}>
                <button
                  type="button"
                  data-testid={`sp-displace-${target.id}`}
                  className="rounded border bg-card px-2 py-1 text-xs transition hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  disabled={busy}
                  onClick={() => picker.act(target.id)}
                >
                  <span className="font-medium">{target.name}</span> · <span className="tabular-nums">{cost}₽</span>
                </button>
              </ActionTip>
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

      {/* Phase track — which of the four phases is in progress (pg. 2). The medallion on the board mirrors
          it; these pills carry the accessible `aria-current` step + testids. */}
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

      {/* The malachite card table: the two face-up rows + the gilt draw-stack cabinet and phase dial. */}
      <CardRow
        game={game}
        active={active}
        acting={acting}
        canAddToHand={canAddToHand}
        busy={busy}
        onBuy={doBuy}
        onAdd={doAdd}
        onRowTrade={onRowTrade}
      />

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
                    <ActionTip key={points} tip={pubTip(points, cost)}>
                      <Button
                        variant={points === 0 ? 'ghost' : 'outline'}
                        size="sm"
                        data-testid={`sp-pub-buy-${points}`}
                        disabled={busy || !affordable}
                        onClick={() => doPubBuy(points)}
                      >
                        {points === 0 ? 'Decline' : `+${points}★ · ${cost}₽`}
                      </Button>
                    </ActionTip>
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
              const buyCost = trading
                ? opts.length
                  ? Math.min(...opts.map((o) => o.cost))
                  : undefined
                : handCost(active, card);
              const canBuy = trading
                ? opts.length > 0
                : active.rubles !== null && buyCost !== undefined && active.rubles >= buyCost;
              const canHand = active.handCount < handLimit(active);
              return (
                <>
                  <div className="mb-2 text-sm font-medium">
                    Observatory — drew the <span className="capitalize">{card.name}</span> ({active.name})
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardFace card={card} effectiveCost={buyCost} width={80} />
                    <ActionTip tip={SP_TIPS.observatoryBuy}>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="sp-observatory-buy"
                        disabled={busy || !canBuy}
                        onClick={() =>
                          trading
                            ? startTrade(`Buy ${card.name} — choose a card to displace`, opts, (targetId) =>
                                doResolve('buy', targetId),
                              )
                            : doResolve('buy')
                        }
                      >
                        Buy{buyCost !== undefined ? ` · ${buyCost}₽` : ''}
                      </Button>
                    </ActionTip>
                    <ActionTip tip={SP_TIPS.observatoryHand}>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="sp-observatory-hand"
                        disabled={busy || !canHand}
                        onClick={() => doResolve('hand')}
                      >
                        Add to hand
                      </Button>
                    </ActionTip>
                    <ActionTip tip={SP_TIPS.observatoryDiscard}>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="sp-observatory-discard"
                        disabled={busy}
                        onClick={() => doResolve('discard')}
                      >
                        Discard
                      </Button>
                    </ActionTip>
                  </div>
                </>
              );
            })()
          ) : (
            <span className="text-sm text-muted-foreground">
              Waiting for {active.name} to resolve the Observatory draw…
            </span>
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
                    <ActionTip
                      key={kind}
                      tip={
                        game.board.stacks[kind] < 2
                          ? `The ${kind} stack has too few cards to draw from.`
                          : SP_TIPS.observatoryDraw
                      }
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`sp-observatory-draw-${kind}`}
                        disabled={busy || game.board.stacks[kind] < 2}
                        onClick={() => doObservatoryDraw(kind)}
                      >
                        {kind[0]!.toUpperCase()}
                      </Button>
                    </ActionTip>
                  ))}
                </span>
              ) : null}
              <ActionTip tip={SP_TIPS.pass}>
                <Button variant="outline" size="sm" data-testid="sp-pass" disabled={busy} onClick={doPass}>
                  Pass
                </Button>
              </ActionTip>
            </>
          )}
        </div>
      ) : null}

      {/* Players — ALL seats listed. Own seat(s) get the full tableau (with the hand fan); opponents the
          compact row that expands read-only. Rubles are the game's secret, so opponents show a lock. */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Players</h2>
        <div className="space-y-2">
          {detailed.length > 0 && (
            <div className={cn('grid gap-2', detailed.length > 1 && 'sm:grid-cols-2')}>
              {detailed.map((player) => panelFor(player, true))}
            </div>
          )}
          {rest.map((player) => panelFor(player, false))}
        </div>
      </div>

      <ActivityFeed log={game.log} players={game.players} botIds={bots} describe={describeMove} testId="sp-log" />
    </div>
  );
}
