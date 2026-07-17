import { COLUMN_HEIGHTS, COLUMNS, MAX_RUNNERS, legalActions } from '@game-hub/engine/cantstop';
import type { Action, CantStopView } from '@game-hub/engine/cantstop';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BoardProps } from '../types';
import * as cantstopApi from './api';

/** A colour per seat, by index. Can't Stop's squares are player-coloured (rulebook "Set Up"). */
const SEAT_COLORS = ['bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500'] as const;
const seatColor = (index: number) => SEAT_COLORS[index % SEAT_COLORS.length]!;

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
  controlledIds,
  viewer,
  busy,
  guard,
  onPayload,
}: BoardProps<CantStopView>) {
  const active = game.players[game.activePlayerIndex];
  // Same seat-binding rule as Container: drive only when this client controls the active seat (or
  // holds all of them, in hotseat), and never act for a bot seat. Can't Stop has no bots yet, but the
  // gate is the platform's, not the game's.
  const activeIsBot = !!active && bots.includes(active.id);
  const canDrive = !activeIsBot && (!controlledIds || (!!active && controlledIds.includes(active.id)));
  const myNames = controlledIds ? game.players.filter((p) => controlledIds.includes(p.id)).map((p) => p.name) : null;

  const run = (work: () => Promise<cantstopApi.CantStopPayload>) => guard(async () => onPayload(await work()));
  const doRoll = () => {
    if (!canDrive || !active) return;
    void run(() => cantstopApi.roll(gameId, active.id, viewer));
  };
  const doAct = (action: Action) => {
    if (!canDrive || !active) return;
    void run(() => cantstopApi.act(gameId, active.id, action, viewer));
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

  const turnLine = winner
    ? `${winner.name} wins!`
    : canDrive
      ? 'Your move'
      : `Waiting for ${active?.name ?? '—'}`;

  return (
    <div data-testid="board" className="space-y-4">
      <div
        data-testid="identity-banner"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
      >
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
      </div>

      {/* Legend: each seat's colour + how many columns they've claimed (first to three wins). */}
      <div className="flex flex-wrap gap-3 text-xs">
        {game.players.map((player, seat) => (
          <span key={player.id} data-testid={`seat-legend-${player.id}`} className="flex items-center gap-1.5">
            <span className={cn('inline-block h-3 w-3 rounded-full', seatColor(seat))} aria-hidden />
            <span className={cn(seat === game.activePlayerIndex && 'font-semibold')}>{player.name}</span>
            <span className="text-muted-foreground">· {claimsOf(player.id)}/3</span>
          </span>
        ))}
      </div>

      {/* Marker tray (left) + the eleven columns. The tray stays fixed while the track scrolls on a
          narrow screen. Available markers are drawn as the same empty black circles as the runners. */}
      <div className="flex items-start gap-2">
        <div
          data-testid="markers-tray"
          className="flex shrink-0 flex-col items-center gap-1.5 pt-6"
          title={`${availableMarkers} of ${MAX_RUNNERS} markers available`}
        >
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Markers</span>
          {Array.from({ length: MAX_RUNNERS }, (_, i) => {
            const used = i < usedMarkers;
            return (
              <span
                key={i} // eslint-disable-line react/no-array-index-key -- fixed 3 marker slots
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

        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-1">
            {COLUMNS.map((col) => {
            const height = COLUMN_HEIGHTS[col]!;
            const claimedBy = game.claimed[col];
            const claimedSeat = claimedBy ? game.players.findIndex((p) => p.id === claimedBy) : -1;
            const levels = Array.from({ length: height }, (_, i) => height - i); // top → bottom
            return (
              <div key={col} data-testid={`column-${col}`} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-5 w-6 items-center justify-center rounded text-[11px] font-semibold tabular-nums',
                    claimedSeat >= 0 ? cn(seatColor(claimedSeat), 'text-white') : 'bg-muted text-muted-foreground',
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
                      .map((player, seat) => ({ seat, here: player.progress[col] === level }))
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
                            className="h-2.5 w-2.5 rounded-full border-2 border-foreground bg-background"
                            aria-label={`Runner in column ${col}`}
                          />
                        )}
                        {squares.map(({ seat }) => (
                          <span key={seat} className={cn('h-2 w-2 rounded-full', seatColor(seat))} aria-hidden />
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

      {/* Controls: roll / choose a pairing / stop. Only the driving client sees live buttons. */}
      <div className="space-y-2 rounded-lg border bg-card p-3">
        {game.status !== 'ended' && (
          <div className="text-center text-xs text-muted-foreground">
            Rolls this turn:{' '}
            <span data-testid="roll-count" className="font-semibold tabular-nums text-foreground">
              {game.rollsThisTurn}
            </span>
          </div>
        )}
        {game.status === 'ended' ? (
          <p data-testid="cantstop-winner" className="text-center font-medium text-primary">
            🏆 {winner?.name} claimed three columns and wins!
          </p>
        ) : !canDrive ? (
          <p className="text-center text-sm text-muted-foreground">Waiting for {active?.name ?? 'the other player'}…</p>
        ) : game.phase === 'selecting' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">You rolled</span>
              {(game.dice ?? []).map((die, i) => (
                // eslint-disable-next-line react/no-array-index-key -- dice are positional
                <span key={i} data-testid={`die-${i}`} className="flex h-7 w-7 items-center justify-center rounded border bg-background font-semibold tabular-nums">
                  {die}
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
            <Button variant="outline" data-testid="cantstop-stop" disabled={busy || !canStop} onClick={() => doAct({ type: 'STOP' })}>
              Stop &amp; bank
            </Button>
          </div>
        )}
      </div>

      {/* A compact activity feed — the whole log is public in Can't Stop. */}
      {game.log.length > 0 && (
        <ul data-testid="cantstop-log" className="space-y-0.5 text-xs text-muted-foreground">
          {[...game.log]
            .slice(-6)
            .reverse()
            .map((entry) => (
              <li key={entry.seq}>
                {game.players.find((p) => p.id === entry.playerId)?.name ?? entry.playerId}: {entry.type.toLowerCase()}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
