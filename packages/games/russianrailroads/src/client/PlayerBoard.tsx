import { frontierIndex, locosOnRoute, TRACK_COLORS, UNLOCK_SPACE } from '../engine';
import type { PlayerView, RouteId, TrackColor } from '../engine';
import { cn } from '@game-hub/ui-kit';
import { BonusStar, CoinIcon, KeyIcon, Meeple, TrackChip } from './art';
import { RouteRow } from './RouteRow';
import { IndustryStrip } from './IndustryStrip';
import { TEMP_WORKER_HEX } from './seat';

/**
 * A player's board on "The Permanent Way" (RR9). Following the standing SP8 ruling, ALL players are always
 * listed: the viewer's own seat(s) get the **full** board (the iron-chrome resource header, the three route
 * bands, the workshop-wall industry strip); every opponent collapses to a compact one-line row that expands
 * read-only on click (`rr-expand-<id>`). The active seat's board carries the track-extension build
 * affordances during a lock.
 *
 * The route bands + industry strip are diegetic hardcoded art; the card frame and resource chrome keep
 * semantic tokens (only the header bar is a hardcoded iron plate, part of the board's identity). Every
 * per-player testid is preserved from the pre-art board.
 */

/** The colours a player has unlocked (pg. 8–9): wood always, higher colours once the wood frontier reaches. */
function unlockedColors(player: PlayerView): readonly TrackColor[] {
  const ts = player.routes.find((r) => r.id === 'transsiberian');
  const front = ts ? frontierIndex(ts) : -1; // 0-based furthest reached space
  return TRACK_COLORS.filter(
    (c) => c === 'wood' || front + 1 >= (UNLOCK_SPACE[c as Exclude<TrackColor, 'wood'>] ?? 99),
  );
}

/** The iron-chrome resource header: seat identity, worker meeples, coins, doublers, keys, medals, score. */
function StatHeader({
  player,
  isActive,
  isBot,
  seatColor,
  showSupply,
}: {
  player: PlayerView;
  isActive: boolean;
  isBot: boolean;
  seatColor: string;
  showSupply: boolean;
}) {
  return (
    <div className="rounded-md px-2.5 py-1.5" style={{ background: '#2b2d32', color: '#e8e2d4' }}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Meeple className="h-4 w-4 shrink-0 drop-shadow" fill={seatColor} />
          {isBot ? '🤖 ' : ''}
          {player.name}
          <span className="text-[10px] font-normal" style={{ color: '#9aa0a8' }}>
            #{player.turnOrderCard}
          </span>
          {isActive ? <span title="On the clock">←</span> : null}
          {player.passed ? (
            <span data-testid={`rr-passed-${player.id}`} className="text-[10px]" style={{ color: '#9aa0a8' }}>
              passed
            </span>
          ) : null}
        </span>
        <span
          data-testid={`rr-score-${player.id}`}
          className="text-sm font-bold tabular-nums"
          style={{ color: '#e8b93c' }}
          title="Points on the scoring track"
        >
          Score: {player.score}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: '#c9ced6' }}>
        <span
          data-testid={`rr-workers-${player.id}`}
          className="flex items-center gap-1"
          title="Workers available / total"
        >
          <Meeple className="h-3.5 w-3.5" fill={seatColor} />
          {player.workersAvailable}/{player.workersTotal}
        </span>
        {player.tempWorkers > 0 ? (
          <span data-testid={`rr-temp-${player.id}`} className="flex items-center gap-1" title="Temporary workers">
            <Meeple className="h-3.5 w-3.5" fill={TEMP_WORKER_HEX} />+{player.tempWorkers}
          </span>
        ) : null}
        <span data-testid={`rr-coins-${player.id}`} className="flex items-center gap-1">
          <CoinIcon size={14} /> {player.coins}
        </span>
        <span data-testid={`rr-doublers-${player.id}`} title="Doubler tiles placed">
          ×2: {player.doublers}
        </span>
        {player.keysReceived > 0 ? (
          <span data-testid={`rr-keys-${player.id}`} className="flex items-center gap-1">
            <KeyIcon className="h-3.5 w-3.5" fill="#c9ced6" /> {player.keysReceived}
          </span>
        ) : null}
        {player.hiredEngineers.length > 0 ? (
          <span data-testid={`rr-engineers-${player.id}`} title="Hired engineers (majority, pg. 22)">
            👷 {player.hiredEngineers.length}
          </span>
        ) : null}
        {player.medal20 ? (
          <span data-testid={`rr-medal-${player.id}`} className="flex items-center gap-0.5">
            <BonusStar className="h-3.5 w-3.5" /> +20
          </span>
        ) : null}
        {player.revalued ? (
          <span data-testid={`rr-revalued-${player.id}`} title="Valuation tile flipped">
            tile↑
          </span>
        ) : null}
      </div>

      {showSupply ? (
        <div className="mt-1 flex items-center gap-1" title="Unlocked track colours">
          {unlockedColors(player).map((c) => (
            <TrackChip key={c} color={c} size={12} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The three route bands, with build affordances only when `onMoveTrack` is supplied (the active seat). */
function Routes({
  player,
  legalByRoute,
  multiColor,
  onMoveTrack,
  busy,
}: {
  player: PlayerView;
  legalByRoute?: Map<RouteId, TrackColor[]>;
  multiColor: boolean;
  onMoveTrack?: (route: RouteId, color?: TrackColor) => void;
  busy?: boolean;
}) {
  return (
    <ul className="mt-2 space-y-2">
      {player.routes.map((route) => (
        <RouteRow
          key={route.id}
          player={player}
          route={route}
          doublers={player.doublers}
          locos={locosOnRoute(player, route.id)}
          legalColors={onMoveTrack ? (legalByRoute?.get(route.id) ?? []) : []}
          multiColor={multiColor}
          onMoveTrack={onMoveTrack}
          busy={busy}
        />
      ))}
    </ul>
  );
}

export interface PlayerBoardProps {
  readonly player: PlayerView;
  readonly isActive: boolean;
  readonly isBot: boolean;
  readonly seatColor: string;
  readonly detailed: boolean;
  readonly expanded: boolean;
  readonly onToggleExpand: () => void;
  readonly legalByRoute?: Map<RouteId, TrackColor[]>;
  readonly multiColor: boolean;
  readonly onMoveTrack?: (route: RouteId, color?: TrackColor) => void;
  readonly busy?: boolean;
}

export function PlayerBoard(props: PlayerBoardProps) {
  const { player, isActive, isBot, seatColor, detailed, expanded, onToggleExpand } = props;

  if (detailed) {
    return (
      <div
        data-testid={`player-${player.id}`}
        className={cn('rounded-lg border p-2', isActive ? 'border-primary bg-primary/5' : 'bg-card')}
      >
        <StatHeader player={player} isActive={isActive} isBot={isBot} seatColor={seatColor} showSupply />
        <Routes
          player={player}
          legalByRoute={props.legalByRoute}
          multiColor={props.multiColor}
          onMoveTrack={props.onMoveTrack}
          busy={props.busy}
        />
        <IndustryStrip player={player} />
      </div>
    );
  }

  // Compact opponent row — the iron header, click to expand its (public) board read-only.
  return (
    <div
      data-testid={`player-${player.id}`}
      className={cn('rounded-lg border', isActive ? 'border-primary bg-primary/5' : 'bg-card')}
    >
      <button
        type="button"
        data-testid={`rr-expand-${player.id}`}
        aria-expanded={expanded}
        title={expanded ? 'Hide board' : 'Show board (public)'}
        className="block w-full rounded-lg p-2 text-left transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onToggleExpand}
      >
        <StatHeader player={player} isActive={isActive} isBot={isBot} seatColor={seatColor} showSupply={false} />
      </button>
      {expanded ? (
        <div className="px-2 pb-2">
          <Routes player={player} multiColor={false} />
          <IndustryStrip player={player} />
        </div>
      ) : null}
    </div>
  );
}
