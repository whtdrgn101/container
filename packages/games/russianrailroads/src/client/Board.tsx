import { useState } from 'react';
import { legalActions, legalSteps, locoResolutions } from '../engine';
import type { Action, RouteId, RussianRailroadsState, RussianRailroadsView, TrackColor } from '../engine';
import { Button } from '@/components/ui/button';
import { ActionTip } from '@/components/ActionTip';
import { ActivityFeed } from '@/components/ActivityFeed';
import { TurnBanner } from '@/components/TurnBanner';
import { seatIdentity } from '@/components/seatIdentity';
import { cn } from '@/lib/utils';
import type { BoardProps } from './types';
import * as rrApi from './api';
import { describeMove } from './feed';
import { makeSeatHex } from './seat';
import { Results } from './Results';
import { Prompts } from './Prompts';
import { DispatchHall } from './DispatchHall';
import { EngineerStrip } from './EngineerStrip';
import { PlayerBoard } from './PlayerBoard';
import type { PlateAffordances } from './ActionPlate';
import { PASS_TIP } from './tips';

/**
 * Russian Railroads' board (RR9) — the whole game re-skinned as **"The Permanent Way"** and **"The Dispatch
 * Hall"**, as one plugin the shell renders. It shows the shared action spaces (cream enamel plates under
 * iron-chrome group headers), the turn-order departure board, the engineer crew roster, and each player's
 * illustrated route/industry board, and wires every move (gated on `canDrive`). While the active driver holds
 * a track-extension lock, the plates lock and the route bands become clickable (pg. 8–9).
 *
 * Everything Russian Railroads knows lives at or below this file; the shell hands it an opaque state it never
 * reads, pinned back to `RussianRailroadsView` here. This file is the orchestrator: it computes the gating +
 * legal-move sets and composes the sub-boards; the visual pieces live in their own files.
 */
export default function RussianRailroadsBoard({
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
}: BoardProps<RussianRailroadsView>) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleExpand = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const active = game.players[game.activePlayerIndex];
  const ended = game.status === 'ended';
  const { canDrive, myNames } = seatIdentity({
    players: game.players,
    activePlayerId: active?.id ?? null,
    bots,
    controlledIds,
  });
  const acting = canDrive && !ended && !!active;
  const pending = game.pendingMoves;
  const pendingLoco = game.pendingLoco;
  const pendingFactory = game.pendingFactory;
  const pendingKey = game.pendingKey;
  const pendingIdeaToken = game.pendingIdeaToken;
  const pendingIdeaCard = game.pendingIdeaCard;
  const inReuse = !!game.pendingReuse;
  const inSetup = !!game.pendingSetupBonus;
  const pool = active?.actionPool ?? [];
  const resolving = acting && !!pending; // holding a track-extension lock: resolve it before anything else
  // The RR6 choice locks (pp. 18–19, 46): key / idea-token / idea-card, in applyAction precedence.
  const resolvingKey = acting && !pending && !!pendingKey;
  const resolvingIdeaToken = acting && !pending && !pendingKey && !!pendingIdeaToken;
  const resolvingIdeaCard = acting && !pending && !pendingKey && !pendingIdeaToken && !!pendingIdeaCard;
  const resolvingLoco = acting && !!pendingLoco; // holding a locomotive: place / upgrade / flip it
  const resolvingFactory = acting && !!pendingFactory; // owing a factory placement (pg. 12)
  const resolvingPool = acting && !pending && !pendingLoco && !pendingFactory && pool.length > 0; // pool credits
  // A lock/choice of any kind blocks placement and the mini-phases.
  const anyLock =
    !!pending ||
    !!pendingKey ||
    !!pendingIdeaToken ||
    !!pendingIdeaCard ||
    !!pendingLoco ||
    !!pendingFactory ||
    pool.length > 0;
  const resolvingSetup = acting && !anyLock && inSetup; // game-start starting-bonus mini-phase (pg. 6)
  const resolvingReuse = acting && !anyLock && !inSetup && inReuse; // between-round reuse mini-phase (pg. 17)
  // Free to place a worker or pass only when nothing is owed and no mini-phase is active.
  const placing = acting && !anyLock && !inSetup && !inReuse;

  const run = (work: () => Promise<rrApi.RussianRailroadsPayload>) => guard(async () => onPayload(await work()));
  const doPlace = (
    space: string,
    opts?: { coins?: number; build?: 'loco' | 'factory'; first?: 'loco' | 'factory' },
  ) => {
    if (!placing || !active) return;
    void run(() => rrApi.act(gameId, active.id, { type: 'PLACE', space, ...opts }, viewer, game.version));
  };
  const doFactory = (action: Action) => {
    if (!resolvingFactory || !active) return;
    void run(() => rrApi.act(gameId, active.id, action, viewer, game.version));
  };
  const doPool = (action: Action) => {
    if (!resolvingPool || !active) return;
    void run(() => rrApi.act(gameId, active.id, action, viewer, game.version));
  };
  const doMoveTrack = (route: RouteId, color?: TrackColor) => {
    if (!resolving || !active) return;
    void run(() =>
      rrApi.act(gameId, active.id, { type: 'MOVE_TRACK', route, ...(color ? { color } : {}) }, viewer, game.version),
    );
  };
  const doLoco = (action: Action) => {
    if (!resolvingLoco || !active) return;
    void run(() => rrApi.act(gameId, active.id, action, viewer, game.version));
  };
  const doPass = () => {
    if (!placing || !active) return;
    void run(() => rrApi.act(gameId, active.id, { type: 'PASS' }, viewer, game.version));
  };
  // RR6 choice / phase resolutions — each guarded on the matching flag, then sent as an opaque action.
  const doAction = (action: Action) => {
    if (!active) return;
    void run(() => rrApi.act(gameId, active.id, action, viewer, game.version));
  };
  const doEngineer = (action: Action) => {
    if (!placing || !active) return;
    void run(() => rrApi.act(gameId, active.id, action, viewer, game.version));
  };

  // The legal place / upgrade / flip resolutions for the held locomotive (pg. 10–11), driving the panel.
  const locoOptions = resolvingLoco && active && pendingLoco ? locoResolutions(active, pendingLoco.number) : [];
  // The legal factory / pool resolutions (pg. 12–13) — the engine's own enumeration drives each panel.
  const factoryOptions =
    resolvingFactory && active ? legalActions(game as unknown as RussianRailroadsState, active.id) : [];
  const poolOptions = resolvingPool && active ? legalActions(game as unknown as RussianRailroadsState, active.id) : [];
  // The RR6 choice / phase options — the engine's own enumeration drives each panel.
  const choiceOptions =
    (resolvingKey || resolvingIdeaToken || resolvingIdeaCard || resolvingSetup || resolvingReuse) && active
      ? legalActions(game as unknown as RussianRailroadsState, active.id)
      : [];

  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
  const seatHex = makeSeatHex(game.players, colors);

  // Which of the active player's routes+colours a lock step may advance right now (drives the clickable
  // bands). A single-colour lock keeps the whole-band `rr-build-<route>` button; a multi-colour lock offers a
  // `rr-build-<route>-<colour>` button per choice.
  const multiColor = resolving && !!pending && pending.colors.length > 1;
  const legalByRoute = new Map<RouteId, TrackColor[]>();
  if (resolving && active && pending) {
    for (const step of legalSteps(active.routes, pending.colors)) {
      const colors = legalByRoute.get(step.route) ?? [];
      colors.push(step.color);
      legalByRoute.set(step.route, colors);
    }
  }

  // Which placements the active seat may actually make right now — the engine's own enumeration, so the board
  // never offers a placement that would be refused or wasted. The View carries every field `legalActions`
  // reads (all public), so the cast is sound — move enumeration never touches a redacted secret.
  const legal = placing && active ? legalActions(game as unknown as RussianRailroadsState, active.id) : [];
  const spaceIds = (withCoins: boolean) =>
    new Set(legal.flatMap((a) => (a.type === 'PLACE' && (a.coins !== undefined) === withCoins ? [a.space] : [])));
  const workerSpaces = spaceIds(false);
  const coinSpaces = spaceIds(true);
  const legalBuild = (spaceId: string, build: 'loco' | 'factory') =>
    legal.some((a) => a.type === 'PLACE' && a.space === spaceId && a.build === build);
  const legalFirst = (spaceId: string, first: 'loco' | 'factory') =>
    legal.some((a) => a.type === 'PLACE' && a.space === spaceId && a.first === first);

  // Engineer affordances (pg. 15–16) — the engine's own enumeration gates hire / use / variable-use.
  const canHire = legal.some((a) => a.type === 'HIRE_ENGINEER');
  const usableEngineers = new Set(legal.flatMap((a) => (a.type === 'USE_ENGINEER' ? [a.engineerId] : [])));
  const usableVarSlots = new Set(legal.flatMap((a) => (a.type === 'USE_VARIABLE_ENGINEER' ? [a.slot] : [])));
  const roundsRemaining = game.rounds - game.round + 1;

  const aff: PlateAffordances = { workerSpaces, coinSpaces, legalBuild, legalFirst, busy, doPlace, nameOf, seatHex };

  // Own seat(s) get the full board; everyone else the compact expandable row. Hotseat (no bound seats)
  // follows the active player — the same split Stone Age / Saint Petersburg use, and it keeps the active
  // seat's track-extension build affordances on a full board.
  const detailedIds = controlledIds && controlledIds.length > 0 ? controlledIds : active ? [active.id] : [];
  const detailed = game.players.filter((p) => detailedIds.includes(p.id));
  const rest = game.players.filter((p) => !detailedIds.includes(p.id));
  const boardFor = (player: (typeof game.players)[number], isDetailed: boolean) => (
    <PlayerBoard
      key={player.id}
      player={player}
      isActive={player.id === active?.id}
      isBot={bots.includes(player.id)}
      seatColor={seatHex(player.id)}
      detailed={isDetailed}
      expanded={!!expanded[player.id]}
      onToggleExpand={() => toggleExpand(player.id)}
      legalByRoute={player.id === active?.id ? legalByRoute : undefined}
      multiColor={multiColor}
      onMoveTrack={player.id === active?.id ? doMoveTrack : undefined}
      busy={busy}
    />
  );

  return (
    <div data-testid="board" className="space-y-4">
      {game.status === 'ended' ? <Results game={game} nameOf={nameOf} onLeave={onLeave} /> : null}

      <TurnBanner testId="rr-banner" canDrive={canDrive} className="mb-0">
        <span>
          {myNames ? (
            <>
              You are <span className="font-medium">{myNames.join(', ')}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Hotseat — pass the device</span>
          )}
        </span>
        <span className="font-medium">
          Round {game.round}/{game.rounds} · {active?.name ?? '—'}
        </span>
      </TurnBanner>

      <Prompts
        resolving={resolving}
        pendingMoves={pending}
        resolvingLoco={resolvingLoco}
        pendingLoco={pendingLoco}
        locoOptions={locoOptions}
        resolvingFactory={resolvingFactory}
        pendingFactory={pendingFactory}
        pendingThen={game.pendingThen}
        factoryOptions={factoryOptions}
        resolvingPool={resolvingPool}
        poolOptions={poolOptions}
        resolvingSetup={resolvingSetup}
        resolvingReuse={resolvingReuse}
        resolvingKey={resolvingKey}
        resolvingIdeaToken={resolvingIdeaToken}
        resolvingIdeaCard={resolvingIdeaCard}
        choiceOptions={choiceOptions}
        busy={busy}
        doLoco={doLoco}
        doFactory={doFactory}
        doPool={doPool}
        doAction={doAction}
      />

      <DispatchHall game={game} aff={aff} seatHex={seatHex} />

      <EngineerStrip
        strip={game.engineerStrip}
        roundsRemaining={roundsRemaining}
        active={active}
        canHire={canHire}
        usableVarSlots={usableVarSlots}
        usableEngineers={usableEngineers}
        busy={busy}
        onEngineer={doEngineer}
      />

      {placing ? (
        <ActionTip tip={PASS_TIP}>
          <Button variant="default" size="sm" data-testid="rr-pass" disabled={busy} onClick={doPass}>
            Pass
          </Button>
        </ActionTip>
      ) : !ended && !resolving ? (
        <p className="text-sm text-muted-foreground">Waiting for {active?.name ?? 'the other player'}…</p>
      ) : null}

      {/* Players — ALL seats listed (pg. 6–7, 20). Own/active seat(s) get the full illustrated board; the
          rest collapse to a compact iron header that expands read-only. */}
      <section aria-label="Players" className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">The Permanent Way</h2>
        {detailed.length > 0 ? (
          <div className={cn('grid gap-3', detailed.length > 1 && 'lg:grid-cols-2')}>
            {detailed.map((player) => boardFor(player, true))}
          </div>
        ) : null}
        {rest.map((player) => boardFor(player, false))}
      </section>

      <ActivityFeed
        log={game.log}
        players={game.players}
        botIds={bots}
        describe={(entry) => describeMove(entry, nameOf)}
        testId="rr-log"
      />
    </div>
  );
}
