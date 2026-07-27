import { COLUMN_HEIGHTS, COLUMNS, MAX_RUNNERS, legalActions } from '../engine';
import type { Action, CantStopView } from '../engine';
import { Button } from '@/components/ui/button';
import { GameOver } from '@/components/GameOver';
import { ActivityFeed } from '@/components/ActivityFeed';
import { TurnBanner } from '@/components/TurnBanner';
import { seatIdentity } from '@/components/seatIdentity';
import { cn } from '@/lib/utils';
import type { BoardProps } from './types';
import * as cantstopApi from './api';
import { Die } from './art/Die';

/**
 * Can't Stop's squares are player-coloured (rulebook "Set Up"). The palette ids are the module's, in
 * seat order; each maps to a Tailwind fill (literal strings so the build sees them).
 */
const PALETTE = ['rose', 'sky', 'amber', 'emerald'] as const;
const SEAT_CLASS: Record<string, string> = {
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
};

/**
 * Can't Stop's board — the whole game as one plugin the shell renders (roadmap C3).
 *
 * Everything Can't Stop knows lives at or below this file; the shell hands it an opaque state it never
 * reads, pinned back to `CantStopView` here. The board has **no hidden state of its own** — every
 * decision (which pairing, whether to stop) is a server round-trip — so there are no `useState`s: it is
 * a pure function of the projected game, which is the simplest a board on this seam can be.
 */
export default function CantStopBoard({
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
}: BoardProps<CantStopView>) {
  const active = game.players[game.activePlayerIndex];
  // The colour a seat picked, or its seat-index default (which reproduces the old per-seat tints for a
  // default game — palette order rose/sky/amber/emerald). `colorIdOf` is the raw id (for `data-color`);
  // `seatColor` is its Tailwind fill class.
  const colorIdOf = (playerId: string): string => {
    const picked = colors[playerId];
    if (picked !== undefined && SEAT_CLASS[picked]) return picked;
    const seat = game.players.findIndex((p) => p.id === playerId);
    return PALETTE[(seat < 0 ? 0 : seat) % PALETTE.length]!;
  };
  const seatColor = (playerId: string): string => SEAT_CLASS[colorIdOf(playerId)]!;
  // Same seat-binding rule as every game — the shared platform helper (§3.3): drive only when this
  // client controls the active seat (or holds all of them, in hotseat), and never act for a bot seat.
  const { canDrive, myNames } = seatIdentity({
    players: game.players,
    activePlayerId: active?.id ?? null,
    bots,
    controlledIds,
  });

  const run = (work: () => Promise<cantstopApi.CantStopPayload>) => guard(async () => onPayload(await work()));
  const doRoll = () => {
    if (!canDrive || !active) return;
    void run(() => cantstopApi.roll(gameId, active.id, viewer));
  };
  const doAct = (action: Action) => {
    if (!canDrive || !active) return;
    void run(() => cantstopApi.act(gameId, active.id, action, viewer, game.version));
  };

  // What the active seat may do right now. `legalActions` never lists ROLL (server-only), so rolling
  // is offered separately whenever the phase allows it.
  const options = legalActions(game);
  const pairings = options.flatMap((a) => (a.type === 'SELECT' ? [a.columns] : []));
  const canStop = options.some((a) => a.type === 'STOP');
  const canRoll = game.status === 'active' && game.phase === 'rolling';

  // The three markers ("available dice combinations"): how many runners you may still place. A runner
  // occupies a marker; the rest are free to open a new column. Shown as the marker tray on the left.
  const usedMarkers = Object.keys(game.runners).length;
  const availableMarkers = MAX_RUNNERS - usedMarkers;

  const claimsOf = (playerId: string) => Object.values(game.claimed).filter((id) => id === playerId).length;
  const winner = game.status === 'ended' ? game.players.find((p) => game.winnerIds.includes(p.id)) : undefined;

  const turnLine = winner ? `${winner.name} wins!` : canDrive ? 'Your move' : `Waiting for ${active?.name ?? '—'}`;

  return (
    <div data-testid="board" className="space-y-4">
      {game.status === 'ended' && (
        <GameOver
          winnerNames={game.winnerIds.map((id) => game.players.find((p) => p.id === id)?.name ?? id)}
          onNewGame={onLeave}
        >
          {/* Final standings: columns each player claimed, most first, winner crowned. */}
          <ul className="space-y-1 text-sm">
            {[...game.players]
              .map((player) => ({ player, claims: claimsOf(player.id) }))
              .sort((a, b) => b.claims - a.claims)
              .map(({ player, claims }) => {
                const won = game.winnerIds.includes(player.id);
                return (
                  <li
                    key={player.id}
                    data-testid={`standing-${player.id}`}
                    className={cn('flex items-center justify-between border-b py-1', won && 'font-semibold')}
                  >
                    <span>
                      {player.name}
                      {won ? ' 👑' : ''}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{claims}/3 columns</span>
                  </li>
                );
              })}
          </ul>
        </GameOver>
      )}

      <TurnBanner testId="identity-banner" canDrive={canDrive} className="mb-0">
        <span>
          {myNames ? (
            <>
              You are <span className="font-medium">{myNames.join(', ')}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Hotseat — pass the device</span>
          )}
        </span>
        <span className={cn('font-medium', winner && 'text-primary')}>{turnLine}</span>
      </TurnBanner>

      {/* Legend: each seat's colour + how many columns they've claimed (first to three wins). */}
      <div className="flex flex-wrap gap-3 text-xs">
        {game.players.map((player) => (
          <span
            key={player.id}
            data-testid={`seat-legend-${player.id}`}
            data-color={colorIdOf(player.id)}
            className="flex items-center gap-1.5"
          >
            <span className={cn('inline-block h-3 w-3 rounded-full', seatColor(player.id))} aria-hidden />
            <span className={cn(player.id === active?.id && 'font-semibold')}>{player.name}</span>
            <span className="text-muted-foreground">· {claimsOf(player.id)}/3</span>
          </span>
        ))}
      </div>

      {/* Marker tray (left) + the eleven columns, bottom-aligned so the taller middle columns form a
          mountain silhouette (7 is the peak) — Can't Stop's climb, drawn without any published artwork.
          The tray and track sit at the base; the track scrolls within itself on a narrow screen. */}
      <div className="flex items-end gap-2">
        <div
          data-testid="markers-tray"
          className="flex shrink-0 flex-col items-center gap-1.5"
          title={`${availableMarkers} of ${MAX_RUNNERS} markers available`}
        >
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Markers</span>
          {Array.from({ length: MAX_RUNNERS }, (_, i) => {
            const used = i < usedMarkers;
            return (
              <span
                key={i}
                data-testid={used ? 'marker-used' : 'marker-free'}
                aria-label={used ? 'Marker in play' : 'Marker available'}
                className={cn(
                  'h-4 w-4 rounded-full border-2 border-foreground',
                  used ? 'bg-foreground' : 'bg-background',
                )}
              />
            );
          })}
        </div>

        <div className="overflow-x-auto" role="group" aria-label="Column board — first to claim three columns wins">
          <div className="flex min-w-max items-end gap-1">
            {COLUMNS.map((col) => {
              const height = COLUMN_HEIGHTS[col]!;
              const claimedBy = game.claimed[col];
              const claimedSeat = claimedBy ? game.players.findIndex((p) => p.id === claimedBy) : -1;
              const runnerAt = game.runners[col];
              const levels = Array.from({ length: height }, (_, i) => height - i); // top → bottom
              const label = claimedBy
                ? `Column ${col}, won by ${game.players[claimedSeat]?.name}`
                : runnerAt
                  ? `Column ${col}, runner at ${runnerAt} of ${height}`
                  : `Column ${col}, ${height} to the top`;
              return (
                <div
                  key={col}
                  data-testid={`column-${col}`}
                  role="img"
                  aria-label={label}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={cn(
                      'flex h-5 w-6 items-center justify-center rounded text-[11px] font-semibold tabular-nums',
                      claimedBy ? cn(seatColor(claimedBy), 'text-white') : 'bg-muted text-muted-foreground',
                    )}
                    title={claimedBy ? `Won by ${game.players[claimedSeat]?.name}` : `Column ${col}`}
                    data-testid={claimedBy ? `claimed-${col}` : undefined}
                  >
                    {col}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {levels.map((level) => {
                      const runnerHere = game.runners[col] === level;
                      const squares = game.players
                        .map((player) => ({ id: player.id, here: player.progress[col] === level }))
                        .filter((s) => s.here);
                      return (
                        <div
                          key={level}
                          className={cn(
                            'flex h-4 w-6 items-center justify-center gap-0.5 rounded-sm border',
                            level === height ? 'border-foreground/40' : 'border-border',
                            runnerHere && 'bg-foreground/10',
                          )}
                        >
                          {runnerHere && (
                            <span
                              data-testid={`runner-${col}`}
                              className="reveal-in h-2.5 w-2.5 rounded-full border-2 border-foreground bg-background"
                              aria-label={`Runner in column ${col}`}
                            />
                          )}
                          {/* Banked progress is the rulebook's player-coloured *squares* — distinct from
                            the round temporary runners above. */}
                          {squares.map(({ id }) => (
                            <span key={id} className={cn('h-2 w-2 rounded-[2px]', seatColor(id))} aria-hidden />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Controls: roll / choose a pairing / stop. Hidden once the game ends — the shared GameOver
          screen above takes over. Only the driving client sees live buttons. */}
      {game.status !== 'ended' && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="text-center text-xs text-muted-foreground">
            Rolls this turn:{' '}
            <span data-testid="roll-count" className="font-semibold tabular-nums text-foreground">
              {game.rollsThisTurn}
            </span>
          </div>
          {!canDrive ? (
            <p className="text-center text-sm text-muted-foreground">
              Waiting for {active?.name ?? 'the other player'}…
            </p>
          ) : game.phase === 'selecting' ? (
            <div className="space-y-2">
              <div className="reveal-in flex items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">You rolled</span>
                {(game.dice ?? []).map((die, i) => (
                  <span key={i} data-testid={`die-${i}`} className="inline-block h-8 w-8">
                    <Die value={die} />
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {pairings.map((columns) => (
                  <Button
                    key={columns.join('-')}
                    size="sm"
                    data-testid={`cantstop-select-${columns.join('-')}`}
                    disabled={busy}
                    onClick={() => doAct({ type: 'SELECT', columns })}
                  >
                    {columns.join(' + ')}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Button data-testid="cantstop-roll" disabled={busy || !canRoll} onClick={doRoll}>
                Roll dice
              </Button>
              <Button
                variant="outline"
                data-testid="cantstop-stop"
                disabled={busy || !canStop}
                onClick={() => doAct({ type: 'STOP' })}
              >
                Stop &amp; bank
              </Button>
            </div>
          )}
        </div>
      )}

      {/* The activity feed — the whole log is public in Can't Stop. Shared frame; the per-game part is
          just the move-to-text `describe` (Can't Stop's moves need no more than their lowercased type). */}
      <ActivityFeed
        log={game.log}
        players={game.players}
        botIds={bots}
        describe={(entry) => entry.type.toLowerCase()}
        testId="cantstop-log"
      />
    </div>
  );
}
