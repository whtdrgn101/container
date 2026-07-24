import { ACTION_SPACES } from '../engine';
import type { PlayerView, RussianRailroadsView } from '../engine';
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
 * Russian Railroads' board (RR1) — a read-only-ish worker-placement spine as one plugin the shell renders.
 * It shows the shared action spaces with their occupancy, each player's routes / workers / coins, whose
 * turn it is, and wires `PLACE` / `PASS` (gated on `canDrive`). The full illustrated player board — the
 * three routes as a real track, locomotives, industry, engineers — is RR9; this is functional-not-fancy.
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

  const run = (work: () => Promise<rrApi.RussianRailroadsPayload>) => guard(async () => onPayload(await work()));
  const doPlace = (space: string, coins?: number) => {
    if (!acting || !active) return;
    void run(() =>
      rrApi.act(gameId, active.id, { type: 'PLACE', space, ...(coins ? { coins } : {}) }, viewer, game.version),
    );
  };
  const doPass = () => {
    if (!acting || !active) return;
    void run(() => rrApi.act(gameId, active.id, { type: 'PASS' }, viewer, game.version));
  };

  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;

  const winnerNames = game.status === 'ended' ? game.winnerIds.map(nameOf) : [];

  return (
    <div data-testid="board" className="space-y-4">
      {game.status === 'ended' && (
        <GameOver winnerNames={winnerNames} onNewGame={onLeave}>
          <p className="text-sm text-muted-foreground" data-testid="rr-result-note">
            Final scoring lands in a later slice — this early build ends the game at the round count with a shared
            result.
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

      {/* Shared action spaces (pg. 7). Each shows its occupancy; the active driving seat may place on an
          unoccupied one (the bottom track space is never occupied — pg. 9). */}
      <section aria-label="Action spaces">
        <h2 className="mb-2 text-sm font-semibold">Action spaces</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACTION_SPACES.map((space) => {
            const placements = game.actionSpaces[space.id] ?? [];
            const occupied = !space.neverOccupies && placements.length > 0;
            const canWorkers = acting && !occupied && !!active && active.workersAvailable >= space.workers;
            const canCoins = acting && !occupied && !!active && active.coins >= space.workers;
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
                    Place worker
                  </Button>
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
                </div>
              </div>
            );
          })}
        </div>
        {acting ? (
          <div className="mt-3">
            <Button variant="default" size="sm" data-testid="rr-pass" disabled={busy} onClick={doPass}>
              Pass
            </Button>
          </div>
        ) : !ended ? (
          <p className="mt-3 text-sm text-muted-foreground">Waiting for {active?.name ?? 'the other player'}…</p>
        ) : null}
      </section>

      {/* Players — routes, workers, coins, pass state (pg. 6–7). */}
      <section aria-label="Players">
        <h2 className="mb-2 text-sm font-semibold">Players</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {game.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isActive={player.id === active?.id}
              isBot={bots.includes(player.id)}
            />
          ))}
        </div>
      </section>

      <ActivityFeed log={game.log} players={game.players} botIds={bots} describe={describeMove} testId="rr-log" />
    </div>
  );
}

/** One player's tableau card (RR1): turn-order card, workers, coins, and the three routes' tracks. */
function PlayerCard({ player, isActive, isBot }: { player: PlayerView; isActive: boolean; isBot: boolean }) {
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
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {player.routes.map((route) => (
          <li key={route.id} className="flex items-center gap-1">
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
          </li>
        ))}
      </ul>
    </div>
  );
}
