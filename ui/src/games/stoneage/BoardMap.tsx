import { useState } from 'react';
import { isGatherPlace, isUsePlace, legalActions, PLACE_CAPACITY, PLACES } from '@game-hub/engine/stoneage';
import type { FixedPlaceId, StoneAgeView } from '@game-hub/engine/stoneage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Meeple, PLACE_ICON } from './art';
import { Scene } from './art/Scene';

const PLACE_LABEL: Record<FixedPlaceId, string> = {
  toolMaker: 'Tool maker',
  hut: 'Hut',
  field: 'Field',
  hunt: 'Hunt',
  forest: 'Forest',
  clayPit: 'Clay pit',
  quarry: 'Quarry',
  river: 'River',
};
const USE_LABEL: Record<string, string> = { toolMaker: 'Take tool', hut: 'Grow +1', field: 'Field +1' };

/**
 * Where each place plaque sits (percent of the board), following the classic board's geography:
 * hunting meadow top-left, forest top-center, clay pit beside it, quarry in the mountains (right),
 * river below the falls, and the village — field / hut / tool maker — center-left. Each plaque is
 * offset to sit *beside* its painted vignette in `Scene`, never over it.
 */
const PLACE_POS: Record<FixedPlaceId, { left: number; top: number }> = {
  hunt: { left: 13, top: 38 },
  forest: { left: 42, top: 36 },
  clayPit: { left: 64, top: 31 },
  quarry: { left: 85, top: 25 },
  river: { left: 86, top: 64 },
  field: { left: 26, top: 63 },
  hut: { left: 58, top: 74 },
  toolMaker: { left: 13, top: 84 },
};

export interface BoardMapProps {
  readonly game: StoneAgeView;
  readonly canDrive: boolean;
  readonly busy: boolean;
  readonly onPlace: (place: FixedPlaceId, count: number) => void;
  readonly onGather: (place: FixedPlaceId) => void;
  readonly onUse: (place: FixedPlaceId) => void;
  readonly seatColorOf: (id: string) => { readonly dot: string; readonly text: string; readonly ring: string };
  readonly playerName: (id: string) => string;
}

/**
 * The Stone Age board as an illustrated **landscape** (SA13): resource sites (forest, clay pit, quarry,
 * river) across the top, the hunting ground in the middle, the camp (tool maker, hut, field) below. Each
 * place is a node you place workers on / act from; workers show as meeples. Meant to live inside `PanZoom`
 * so it can be zoomed and panned on small screens. Keeps the same testids the e2e uses.
 */
export function BoardMap({ game, canDrive, busy, onPlace, onGather, onUse, seatColorOf, playerName }: BoardMapProps) {
  const [counts, setCounts] = useState<Partial<Record<FixedPlaceId, number>>>({});
  const active = game.players[game.activePlayerIndex];
  const placing = game.phase === 'placement';
  const acting = game.phase === 'actions';
  const pending = !!game.pendingGather;

  // Legal placements for the active player, collapsed to {min,max} per place.
  const options = new Map<FixedPlaceId, { min: number; max: number }>();
  if (canDrive && placing) {
    for (const a of legalActions(game)) {
      if (a.type !== 'PLACE' || !(a.place in PLACE_LABEL)) continue;
      const place = a.place as FixedPlaceId;
      const cur = options.get(place);
      options.set(place, { min: Math.min(cur?.min ?? a.count, a.count), max: Math.max(cur?.max ?? a.count, a.count) });
    }
  }
  // pg. 8 village lock (2–3 players): only 2 of tool maker / hut / field may be filled each round, so a
  // still-empty third is locked once the other two are occupied. A public board fact (same for every
  // viewer), so it's derived straight from the board rather than from the active seat's legal actions.
  const occOf = (place: FixedPlaceId) => Object.values(game.placements[place] ?? {}).reduce((s, n) => s + n, 0);
  const VILLAGE: readonly FixedPlaceId[] = ['toolMaker', 'hut', 'field'];
  const isLocked = (place: FixedPlaceId) =>
    game.players.length <= 3 &&
    VILLAGE.includes(place) &&
    occOf(place) === 0 &&
    VILLAGE.filter((p) => occOf(p) > 0).length >= 2;
  const LOCK_HINT =
    'Only 2 of the tool maker, hut, and field can be used each round (2–3 players); this one is locked for the rest of the round.';

  const countFor = (place: FixedPlaceId, min: number, max: number) =>
    Math.max(min, Math.min(max, counts[place] ?? max));
  const bump = (place: FixedPlaceId, by: number, min: number, max: number) =>
    setCounts((c) => ({ ...c, [place]: Math.max(min, Math.min(max, (c[place] ?? max) + by)) }));

  const meeplesFor = (byPlayer: Readonly<Record<string, number>>) =>
    Object.entries(byPlayer).map(([id, n]) => (
      <span key={id} className="flex items-center" title={`${playerName(id)} ×${n}`}>
        {Array.from({ length: Math.min(n, 6) }, (_, k) => (
          <Meeple key={k} className={cn('h-3.5 w-3.5 drop-shadow-sm', seatColorOf(id).text)} />
        ))}
        {n > 6 && <span className={cn('text-[9px] font-bold', seatColorOf(id).text)}>+{n - 6}</span>}
        <span className="sr-only">
          {playerName(id)} ×{n}
        </span>
      </span>
    ));

  return (
    <div
      data-testid="board-map"
      role="img"
      aria-label="Stone Age board: resource sites, the hunting ground, and the camp"
      className="relative h-full w-full select-none overflow-hidden"
    >
      {/* The Morning Valley landscape (original art; classic-board arrangement — see art/Scene). */}
      <Scene />

      {/* Place nodes. */}
      {PLACES.map((place) => {
        const pos = PLACE_POS[place];
        const here = game.placements[place] ?? {};
        const used = Object.values(here).reduce((s, n) => s + n, 0);
        const cap = PLACE_CAPACITY[place];
        const opt = options.get(place);
        const mine = !!active && here[active.id] !== undefined;
        const canGather = acting && canDrive && mine && isGatherPlace(place) && !pending;
        const canUse = acting && canDrive && mine && isUsePlace(place) && !pending;
        const count = opt ? countFor(place, opt.min, opt.max) : 0;
        const locked = isLocked(place);
        const Icon = PLACE_ICON[place];
        return (
          <div
            key={place}
            data-testid={`place-${place}`}
            className={cn(
              // Parchment plaques — diegetic like the scene, so hardcoded rather than theme tokens.
              'absolute w-24 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#7a603a]/35 bg-[#f9f2e3]/[0.92] p-1.5 text-center text-[#4a3c28] shadow-md backdrop-blur-sm transition-transform sm:w-28',
              opt && 'cursor-pointer ring-2 ring-[#a05a24]/60 hover:ring-[#a05a24] motion-safe:hover:scale-105',
            )}
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
            role={opt ? 'button' : undefined}
            tabIndex={opt ? 0 : undefined}
            aria-label={
              opt
                ? `Place ${count} on ${PLACE_LABEL[place]}`
                : locked
                  ? `${PLACE_LABEL[place]} — locked this round`
                  : PLACE_LABEL[place]
            }
            title={locked ? LOCK_HINT : undefined}
            onClick={opt ? () => onPlace(place, count) : undefined}
          >
            <div className="flex items-center justify-center gap-1">
              <Icon className="h-4 w-4" />
              <span className="text-xs font-semibold">{PLACE_LABEL[place]}</span>
            </div>
            {locked ? (
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#a05a24]" title={LOCK_HINT}>
                locked
              </div>
            ) : (
              <div className="text-[10px] tabular-nums text-[#7a6a4d]">
                {used}/{cap === null ? '∞' : cap}
              </div>
            )}
            {used > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">{meeplesFor(here)}</div>
            )}

            {opt && (
              <div className="mt-1 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                {opt.min !== opt.max && (
                  <>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-5 w-5"
                      aria-label="Fewer"
                      data-testid={`place-${place}-dec`}
                      disabled={busy}
                      onClick={() => bump(place, -1, opt.min, opt.max)}
                    >
                      −
                    </Button>
                    <span className="w-4 text-center text-[10px] tabular-nums" data-testid={`place-${place}-count`}>
                      {count}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-5 w-5"
                      aria-label="More"
                      data-testid={`place-${place}-inc`}
                      disabled={busy}
                      onClick={() => bump(place, 1, opt.min, opt.max)}
                    >
                      +
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  className="h-6 bg-[#a05a24] px-2 text-[11px] text-[#f9f2e3] hover:bg-[#8a4c1e]"
                  data-testid={`place-${place}-go`}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlace(place, count);
                  }}
                >
                  Place {count}
                </Button>
              </div>
            )}
            {canGather && (
              <Button
                size="sm"
                className="mt-1 h-6 bg-[#a05a24] px-2 text-[11px] text-[#f9f2e3] hover:bg-[#8a4c1e]"
                data-testid={`gather-${place}`}
                disabled={busy}
                onClick={() => onGather(place)}
              >
                Gather
              </Button>
            )}
            {canUse && (
              <Button
                size="sm"
                className="mt-1 h-6 bg-[#a05a24] px-2 text-[11px] text-[#f9f2e3] hover:bg-[#8a4c1e]"
                data-testid={`use-${place}`}
                disabled={busy}
                onClick={() => onUse(place)}
              >
                {USE_LABEL[place]}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
