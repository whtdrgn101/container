import { ACTION_SPACES, legalSteps } from '../engine';
import type { PlayerView, RouteId, RussianRailroadsView } from '../engine';
import { Button } from '@/components/ui/button';
import { ActivityFeed } from '@/components/ActivityFeed';
import { GameOver } from '@/components/GameOver';
import { TurnBanner } from '@/components/TurnBanner';
import { seatIdentity } from '@/components/seatIdentity';
import { cn } from '@/lib/utils';
import type { BoardProps } from './types';
import * as rrApi from './api';
import { describeMove } from './feed';

/**
 * Russian Railroads' board (RR2) — the worker-placement spine plus track extension, as one plugin the
 * shell renders. It shows the shared action spaces with their occupancy, each player's routes / workers /
 * coins / score, whose turn it is, and wires `PLACE` / `MOVE_TRACK` / `PASS` (gated on `canDrive`). While
 * the active driver holds a track-extension lock, the action spaces lock and the route rows become
 * clickable — one click resolves one step (pg. 8–9). The full illustrated player board is RR9.
 *
 * Everything Russian Railroads knows lives at or below this file; the shell hands it an opaque state it
 * never reads, pinned back to `RussianRailroadsView` here.
 */
export default function RussianRailroadsBoard({
  gameId,
  game,
  bots,
  controlledIds,
  viewer,
  busy,
  guard,
  onPayload,
  onLeave,
}: BoardProps<RussianRailroadsView>) {
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
  const resolving = acting && !!pending; // holding a track-extension lock: resolve it before anything else
  const placing = acting && !pending; // free to place a worker or pass

  const run = (work: () => Promise<rrApi.RussianRailroadsPayload>) => guard(async () => onPayload(await work()));
  const doPlace = (space: string, coins?: number) => {
    if (!placing || !active) return;
    void run(() =>
      rrApi.act(gameId, active.id, { type: 'PLACE', space, ...(coins ? { coins } : {}) }, viewer, game.version),
    );
  };
  const doMoveTrack = (route: RouteId) => {
    if (!resolving || !active) return;
    void run(() => rrApi.act(gameId, active.id, { type: 'MOVE_TRACK', route }, viewer, game.version));
  };
  const doPass = () => {
    if (!placing || !active) return;
    void run(() => rrApi.act(gameId, active.id, { type: 'PASS' }, viewer, game.version));
  };

  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
  const winnerNames = game.status === 'ended' ? game.winnerIds.map(nameOf) : [];

  // Which of the active player's routes a lock step may advance right now (drives the clickable rows).
  const advanceable = new Set<RouteId>(
    resolving && active && pending ? legalSteps(active.routes, pending.colors).map((s) => s.route) : [],
  );

  return (
    <div data-testid="board" className="space-y-4">
      {game.status === 'ended' && (
        <GameOver winnerNames={winnerNames} onNewGame={onLeave}>
          <p className="text-sm text-muted-foreground" data-testid="rr-result-note">
            Scored by each round's routes + industry (pg. 20–21). Final scoring — end-bonus cards + engineer majority —
            lands in a later slice.
          </p>
        </GameOver>
      )}

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

      {/* The active lock prompt (pg. 8–9): click a route to spend one move. */}
      {resolving && pending ? (
        <div data-testid="rr-pending" className="rounded-lg border border-primary bg-primary/5 p-3 text-sm font-medium">
          {pending.remaining} track move{pending.remaining > 1 ? 's' : ''} left — click a route below to build.
        </div>
      ) : null}

      {/* Shared action spaces (pg. 7–9). Each shows its occupancy; the active driving seat may place on an
          unoccupied one (the bottom track space is never occupied — pg. 9). Locked out while resolving. */}
      <section aria-label="Action spaces">
        <h2 className="mb-2 text-sm font-semibold">Action spaces</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACTION_SPACES.map((space) => {
            const placements = game.actionSpaces[space.id] ?? [];
            const occupied = !space.neverOccupies && placements.length > 0;
            const coinCost = space.coinCost ?? 0;
            const canWorkers =
              placing && !occupied && !!active && active.workersAvailable >= space.workers && active.coins >= coinCost;
            // The coin *substitution* variant (pg. 14) — not offered on the mandatory worker+coin space.
            const canCoins = placing && !occupied && !!active && coinCost === 0 && active.coins >= space.workers;
            return (
              <div
                key={space.id}
                data-testid={`rr-space-${space.id}`}
                className={cn(
                  'rounded-lg border p-3',
                  occupied ? 'bg-muted/50' : 'bg-card',
                  space.neverOccupies && 'border-dashed',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{space.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {space.workers} worker{space.workers > 1 ? 's' : ''}
                    {coinCost ? ` + ${coinCost} coin` : ''}
                  </span>
                </div>
                {placements.length > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground" data-testid={`rr-occupied-${space.id}`}>
                    {placements
                      .map((p) => `${nameOf(p.ownerId)} (${p.workers}w${p.coins ? ` ${p.coins}c` : ''})`)
                      .join(', ')}
                    {space.neverOccupies ? ' — open to all' : ''}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">Empty</div>
                )}
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid={`rr-place-${space.id}`}
                    disabled={busy || !canWorkers}
                    onClick={() => doPlace(space.id)}
                  >
                    {coinCost ? 'Place worker + coin' : 'Place worker'}
                  </Button>
                  {coinCost === 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`rr-place-coin-${space.id}`}
                      disabled={busy || !canCoins}
                      title="Use a coin instead of a worker (pg. 14)"
                      onClick={() => doPlace(space.id, space.workers)}
                    >
                      Use coin
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {placing ? (
          <div className="mt-3">
            <Button variant="default" size="sm" data-testid="rr-pass" disabled={busy} onClick={doPass}>
              Pass
            </Button>
          </div>
        ) : !ended && !resolving ? (
          <p className="mt-3 text-sm text-muted-foreground">Waiting for {active?.name ?? 'the other player'}…</p>
        ) : null}
      </section>

      {/* Players — routes, workers, coins, score, pass state (pg. 6–7, 20). */}
      <section aria-label="Players">
        <h2 className="mb-2 text-sm font-semibold">Players</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {game.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isActive={player.id === active?.id}
              isBot={bots.includes(player.id)}
              advanceable={player.id === active?.id ? advanceable : undefined}
              onMoveTrack={player.id === active?.id ? doMoveTrack : undefined}
              busy={busy}
            />
          ))}
        </div>
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

/** One player's tableau card (RR2): turn-order card, workers, coins, score, and the three routes' tracks. */
function PlayerCard({
  player,
  isActive,
  isBot,
  advanceable,
  onMoveTrack,
  busy,
}: {
  player: PlayerView;
  isActive: boolean;
  isBot: boolean;
  advanceable?: Set<RouteId>;
  onMoveTrack?: (route: RouteId) => void;
  busy?: boolean;
}) {
  return (
    <div
      data-testid={`player-${player.id}`}
      className={cn('rounded-lg border p-3 text-sm', isActive ? 'border-primary bg-primary/5' : 'bg-card')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {isBot ? '🤖 ' : ''}
          {player.name}
          <span className="ml-1 text-xs text-muted-foreground">#{player.turnOrderCard}</span>
        </span>
        {player.passed ? (
          <span className="text-xs text-muted-foreground" data-testid={`rr-passed-${player.id}`}>
            passed
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex gap-4 text-xs">
        <span data-testid={`rr-workers-${player.id}`}>
          Workers: {player.workersAvailable}/{player.workersTotal}
        </span>
        <span data-testid={`rr-coins-${player.id}`}>Coins: {player.coins}</span>
        <span data-testid={`rr-score-${player.id}`} className="font-medium">
          Score: {player.score}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {player.routes.map((route) => {
          const canBuild = !!onMoveTrack && !!advanceable?.has(route.id);
          const row = (
            <>
              <span className="w-28 shrink-0 capitalize text-muted-foreground">{route.id}</span>
              <span className="flex gap-0.5">
                {route.spaces.map((track, i) => (
                  <span
                    key={i}
                    className={cn(
                      'inline-block h-3 w-3 rounded-sm border',
                      track === 'wood' ? 'bg-amber-700' : 'bg-transparent',
                    )}
                    title={track ?? 'empty'}
                  />
                ))}
              </span>
            </>
          );
          return canBuild ? (
            <li key={route.id}>
              <button
                type="button"
                data-testid={`rr-build-${route.id}`}
                disabled={busy}
                onClick={() => onMoveTrack(route.id)}
                className="flex w-full items-center gap-1 rounded-sm border border-primary bg-primary/10 px-1 py-0.5 text-left hover:bg-primary/20 disabled:opacity-50"
              >
                {row}
              </button>
            </li>
          ) : (
            <li key={route.id} className="flex items-center gap-1 px-1 py-0.5">
              {row}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
