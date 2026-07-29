import { SPECIALS, specialMet } from '../engine';
import type { Locomotive, PlayerView, Route, RouteId, RussianRailroadsPlayer, TrackColor } from '../engine';
import { ActionTip } from '@game-hub/ui-kit';
import { DoublerClock, RailLine, RouteBand, SignalLamp, TrackChip } from './art';
import type { SignalState } from './art';
import { specialTip } from './tips';

/**
 * One player route on "The Permanent Way" (RR9): its `RouteBand` landscape with a `RailLine` and station
 * ticks as the track, `TrackChip`s sitting ON the rail at built spaces, the route's `SteamLoco`s parked at
 * the head (rendered by the parent, beside the name), reached specials as `SignalLamp`s, and — on the
 * Trans-Siberian — `DoublerClock`s above the doubled spaces. All of it is hardcoded diegetic board art.
 *
 * During a track-extension lock the active seat's advanceable routes become clickable: a single-colour lock
 * makes the whole band the `rr-build-<route>` button; a multi-colour lock renders a colour picker
 * (`rr-build-<route>-<colour>`) — the exact affordances (and testids) of the pre-art board.
 */

const ROUTE_NAME: Record<RouteId, string> = {
  transsiberian: 'Trans-Siberian',
  stpetersburg: 'St. Petersburg',
  kyiv: 'Kyiv',
};

/** The lamp state for a route special: lit once reached (met) or consumed, dark until then (pg. 18–19). */
function signalStateFor(player: PlayerView, special: (typeof SPECIALS)[number]): SignalState {
  // specialMet / consumedSpecials read only public board fields present on the view (the same safe cast the
  // board makes for legalActions) — never a redacted secret.
  const met = specialMet(player as unknown as RussianRailroadsPlayer, special);
  const consumed = player.consumedSpecials.includes(special.id);
  return met || consumed ? 'lit' : 'unlit';
}

/** The rail band with its chips, lamps and doublers (no interactivity — the parent wraps clicks). */
function Band({ player, route, doublers }: { player: PlayerView; route: Route; doublers: number }) {
  const len = route.spaces.length;
  const specials = SPECIALS.filter((s) => s.route === route.id);
  return (
    <div className="relative h-16 w-full overflow-hidden rounded-md sm:h-20">
      <RouteBand route={route.id} />

      {/* Doubler clocks above the doubled Trans-Siberian spaces (pg. 14). */}
      {route.id === 'transsiberian' && doublers > 0
        ? route.spaces.map((_, i) =>
            i < doublers ? (
              <span
                key={`d${i}`}
                aria-hidden
                className="absolute top-0.5 -translate-x-1/2"
                style={{ left: `${((i + 0.5) / len) * 100}%` }}
              >
                <DoublerClock className="h-4 w-4" />
              </span>
            ) : null,
          )
        : null}

      {/* The rail, centred, with the track chips sitting on it. */}
      <RailLine stations={len} className="absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2" />
      <div className="absolute inset-0 flex items-center">
        {route.spaces.map((track, i) => (
          <span key={i} className="flex flex-1 items-center justify-center">
            {track ? <TrackChip color={track} size={14} /> : null}
          </span>
        ))}
      </div>

      {/* Reached specials as signal lamps at their spaces (pg. 18–19). */}
      {specials.map((s) => (
        <span
          key={s.id}
          className="absolute bottom-0 -translate-x-1/2"
          style={{ left: `${((s.space - 0.5) / len) * 100}%` }}
        >
          <ActionTip tip={specialTip(s)}>
            <span className="inline-flex">
              <SignalLamp state={signalStateFor(player, s)} className="h-4 w-4" />
            </span>
          </ActionTip>
        </span>
      ))}
    </div>
  );
}

export function RouteRow({
  player,
  route,
  doublers,
  locos,
  legalColors,
  multiColor,
  onMoveTrack,
  busy,
}: {
  player: PlayerView;
  route: Route;
  doublers: number;
  locos: readonly Locomotive[];
  legalColors: readonly TrackColor[];
  multiColor: boolean;
  onMoveTrack?: (route: RouteId, color?: TrackColor) => void;
  busy?: boolean;
}) {
  const singleBuild = onMoveTrack && legalColors.length > 0 && !multiColor;
  const multiBuild = onMoveTrack && legalColors.length > 0 && multiColor;

  const band = <Band player={player} route={route} doublers={doublers} />;

  return (
    <li className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="font-medium text-muted-foreground">{ROUTE_NAME[route.id]}</span>
        {locos.length ? (
          <span
            data-testid={`rr-locos-${player.id}-${route.id}`}
            className="text-primary"
            title="Locomotives (reach = their sum)"
          >
            {'🚂 '}
            {locos.map((l) => `#${l.number}`).join(' ')}
          </span>
        ) : null}
      </div>

      {singleBuild ? (
        <button
          type="button"
          data-testid={`rr-build-${route.id}`}
          disabled={busy}
          onClick={() => onMoveTrack!(route.id)}
          className="block w-full rounded-md ring-2 ring-primary ring-offset-1 transition hover:brightness-105 disabled:opacity-50"
          title="Build one track here"
        >
          {band}
        </button>
      ) : (
        band
      )}

      {multiBuild ? (
        <div className="flex flex-wrap gap-1">
          {legalColors.map((color) => (
            <button
              key={color}
              type="button"
              data-testid={`rr-build-${route.id}-${color}`}
              disabled={busy}
              onClick={() => onMoveTrack!(route.id, color)}
              className="rounded-sm border border-primary bg-primary/10 px-1.5 py-0.5 text-xs capitalize hover:bg-primary/20 disabled:opacity-50"
            >
              {color}
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
