import { useState } from 'react';
import {
  availableToPlace,
  isGatherPlace,
  isUsePlace,
  legalActions,
  PLACE_CAPACITY,
  PLACES,
} from '@game-hub/engine/stoneage';
import type { FixedPlaceId, StoneAgeView } from '@game-hub/engine/stoneage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Meeple, PLACE_ICON } from './art';

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

/** Where each place sits on the landscape (percent of the board). Resource sites up top, camp below. */
const PLACE_POS: Record<FixedPlaceId, { left: number; top: number }> = {
  forest: { left: 15, top: 24 },
  clayPit: { left: 38, top: 17 },
  quarry: { left: 62, top: 18 },
  river: { left: 86, top: 33 },
  hunt: { left: 47, top: 48 },
  toolMaker: { left: 16, top: 76 },
  hut: { left: 44, top: 80 },
  field: { left: 74, top: 76 },
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
  const countFor = (place: FixedPlaceId, min: number, max: number) => Math.max(min, Math.min(max, counts[place] ?? max));
  const bump = (place: FixedPlaceId, by: number, min: number, max: number) =>
    setCounts((c) => ({ ...c, [place]: Math.max(min, Math.min(max, (c[place] ?? max) + by)) }));

  const meeplesFor = (byPlayer: Readonly<Record<string, number>>) =>
    Object.entries(byPlayer).map(([id, n]) => (
      <span key={id} className="flex items-center" title={`${playerName(id)} ×${n}`}>
        {Array.from({ length: Math.min(n, 6) }, (_, k) => <Meeple key={k} className={cn('h-3.5 w-3.5 drop-shadow-sm', seatColorOf(id).text)} />)}
        {n > 6 && <span className={cn('text-[9px] font-bold', seatColorOf(id).text)}>+{n - 6}</span>}
        <span className="sr-only">{playerName(id)} ×{n}</span>
      </span>
    ));

  return (
    <div
      data-testid="board-map"
      role="img"
      aria-label="Stone Age board: resource sites, the hunting ground, and the camp"
      className="relative h-full w-full select-none overflow-hidden"
    >
      {/* The landscape — sky, mountains, forest, a river, grassland, and the camp ground. */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="sa-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bcd3e0" />
            <stop offset="1" stopColor="#cfe0d2" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#sa-sky)" />
        {/* distant mountains */}
        <path d="M40 34 L58 8 L76 34 Z" fill="#9aa1a8" />
        <path d="M56 34 L72 14 L88 34 Z" fill="#b3b8bd" />
        <path d="M58 14 L64 22 L52 22 Z" fill="#eef2f5" />
        {/* grass + camp ground */}
        <path d="M0 40 Q50 33 100 42 L100 100 L0 100 Z" fill="#a9c07e" />
        <path d="M0 66 Q50 60 100 68 L100 100 L0 100 Z" fill="#c8b184" />
        {/* forest patch */}
        <g fill="#5b7c3a">
          <circle cx="12" cy="28" r="7" />
          <circle cx="20" cy="26" r="6" />
          <circle cx="8" cy="34" r="5" />
        </g>
        {/* river down the right */}
        <path d="M92 20 Q84 45 90 70 Q96 88 88 100 L100 100 L100 20 Z" fill="#7fb4d6" opacity="0.85" />
      </svg>

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
        const Icon = PLACE_ICON[place];
        return (
          <div
            key={place}
            data-testid={`place-${place}`}
            className={cn(
              'absolute w-24 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card/90 p-1.5 text-center shadow-md backdrop-blur-sm transition-transform sm:w-28',
              opt && 'cursor-pointer ring-2 ring-primary/50 hover:ring-primary motion-safe:hover:scale-105',
            )}
            style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
            role={opt ? 'button' : undefined}
            tabIndex={opt ? 0 : undefined}
            aria-label={opt ? `Place ${count} on ${PLACE_LABEL[place]}` : PLACE_LABEL[place]}
            onClick={opt ? () => onPlace(place, count) : undefined}
          >
            <div className="flex items-center justify-center gap-1">
              <Icon className="h-4 w-4" />
              <span className="text-xs font-semibold">{PLACE_LABEL[place]}</span>
            </div>
            <div className="text-[10px] tabular-nums text-muted-foreground">{used}/{cap === null ? '∞' : cap}</div>
            {used > 0 && <div className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">{meeplesFor(here)}</div>}

            {opt && (
              <div className="mt-1 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                {opt.min !== opt.max && (
                  <>
                    <Button size="icon" variant="outline" className="h-5 w-5" aria-label="Fewer" data-testid={`place-${place}-dec`} disabled={busy} onClick={() => bump(place, -1, opt.min, opt.max)}>−</Button>
                    <span className="w-4 text-center text-[10px] tabular-nums" data-testid={`place-${place}-count`}>{count}</span>
                    <Button size="icon" variant="outline" className="h-5 w-5" aria-label="More" data-testid={`place-${place}-inc`} disabled={busy} onClick={() => bump(place, 1, opt.min, opt.max)}>+</Button>
                  </>
                )}
                <Button size="sm" className="h-6 px-2 text-[11px]" data-testid={`place-${place}-go`} disabled={busy} onClick={(e) => { e.stopPropagation(); onPlace(place, count); }}>
                  Place {count}
                </Button>
              </div>
            )}
            {canGather && (
              <Button size="sm" className="mt-1 h-6 px-2 text-[11px]" data-testid={`gather-${place}`} disabled={busy} onClick={() => onGather(place)}>Gather</Button>
            )}
            {canUse && (
              <Button size="sm" className="mt-1 h-6 px-2 text-[11px]" data-testid={`use-${place}`} disabled={busy} onClick={() => onUse(place)}>{USE_LABEL[place]}</Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
