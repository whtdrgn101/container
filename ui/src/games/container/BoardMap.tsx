import type { Action, GameView, PlayerView, ShipLocation } from '@game-hub/engine/container';
import { ShipSvg } from './art/Ship';
import { Chart, CompassRose } from './art/Chart';
import { seatColorOf, SEAT_COLORS } from './seatColors';
import { cn } from '@/lib/utils';

type SailAction = Extract<Action, { type: 'SAIL' }>;

/** Stable key for a ship location, used to match ships and sail targets to board nodes. */
function locKey(loc: ShipLocation): string {
  switch (loc.kind) {
    case 'ocean':
      return 'ocean';
    case 'island':
      return 'island';
    case 'bank':
      return 'bank';
    case 'harbor':
      return `harbor:${loc.playerId}`;
  }
}

type Node = { key: string; left: number; top: number; label: string; testid: string };

/** Percentage-positioned board nodes: the fixed locations plus one harbor per player. */
function boardNodes(players: readonly PlayerView[]): Node[] {
  const n = players.length;
  const harbors = players.map((p, i) => ({
    key: `harbor:${p.id}`,
    left: n === 1 ? 50 : 12 + (76 * i) / (n - 1),
    top: 84,
    label: `${p.name}'s harbor`,
    testid: `board-sail-harbor-${p.id}`,
  }));
  return [
    { key: 'island', left: 50, top: 25, label: 'Container Island', testid: 'board-sail-island' },
    { key: 'bank', left: 86, top: 22, label: 'Off-Shore Bank', testid: 'board-sail-bank' },
    { key: 'ocean', left: 50, top: 57, label: 'Open ocean', testid: 'board-sail-ocean' },
    ...harbors,
  ];
}

/**
 * The board as a mariner's chart (visual overhaul, 2026-07): the parchment `Chart` paints the sea,
 * island (with docks), bank building and seat-tinted quays; the nodes here are the *interactive*
 * layer — hit areas with parchment label plaques, ringed when they're legal sail targets — and the
 * ships carry their actual cargo. Testids, titles and the motion-safe glide/pulse are unchanged.
 */
export function BoardMap({
  game,
  sailActions,
  onSail,
  busy,
}: {
  game: GameView;
  sailActions: readonly SailAction[];
  onSail: (action: SailAction) => void;
  busy: boolean;
}) {
  const nodes = boardNodes(game.players);
  const activeId = game.players[game.activePlayerIndex]?.id;
  const harbors = nodes
    .filter((n) => n.key.startsWith('harbor:'))
    .map((n, i) => ({ left: n.left, tint: SEAT_COLORS[i % SEAT_COLORS.length]!.hull }));

  // Group ships by the node they occupy so several ships at one place fan out instead of overlapping.
  const shipsByNode = new Map<string, PlayerView[]>();
  for (const p of game.players) {
    const key = locKey(p.ship.location);
    const list = shipsByNode.get(key) ?? [];
    list.push(p);
    shipsByNode.set(key, list);
  }

  const sailFor = (nodeKey: string) => (busy ? undefined : sailActions.find((a) => locKey(a.to) === nodeKey));

  return (
    <div
      data-testid="board-map"
      role="img"
      aria-label="Game board showing each player's ship and the sea lanes between harbors, the Container Island, and the Off-Shore Bank"
      className="relative mb-4 aspect-[3/2] w-full overflow-hidden rounded-xl border border-amber-900/25 shadow-sm sm:aspect-[5/2]"
    >
      <Chart harbors={harbors} />
      <CompassRose className="absolute left-[12%] top-[44%] h-12 w-12 -translate-x-1/2 -translate-y-1/2 opacity-90 sm:h-14 sm:w-14" />

      {/* Location nodes: hit areas + parchment plaques over the chart's painted vignettes. */}
      {nodes.map((node) => {
        const sail = sailFor(node.key);
        const clickable = !!sail;
        const isOcean = node.key === 'ocean';
        return (
          <button
            key={node.key}
            type="button"
            data-testid={node.testid}
            title={clickable ? `Sail to ${node.label}` : node.label}
            aria-label={clickable ? `Sail to ${node.label}` : node.label}
            disabled={!clickable}
            onClick={() => sail && onSail(sail)}
            className={cn(
              'group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1',
              clickable ? 'cursor-pointer' : 'cursor-default',
            )}
            style={{ left: `${node.left}%`, top: `${node.top}%` }}
          >
            <span
              className={cn(
                'block transition-transform',
                isOcean ? 'h-8 w-16 rounded-full sm:w-24' : 'h-9 w-14 rounded-lg sm:h-11 sm:w-16',
                clickable && 'ring-2 ring-[#a05a24]/80 motion-safe:group-hover:scale-110',
              )}
            />
            <span
              className={cn(
                'whitespace-nowrap rounded-full border px-1.5 text-[9px] font-medium italic leading-tight sm:text-[10px]',
                'border-[#6b4f2a]/40 bg-[#e8d9b8]/90 font-serif text-[#5b4426]',
                clickable && 'border-[#a05a24] font-semibold',
              )}
            >
              {node.label}
            </span>
          </button>
        );
      })}

      {/* Ships — each carrying its actual cargo colors on deck. */}
      {nodes.map((node) => {
        const ships = shipsByNode.get(node.key) ?? [];
        return ships.map((p, i) => {
          const isActive = p.id === activeId;
          // Fan ships out horizontally when several share a node.
          const spread = (i - (ships.length - 1) / 2) * 34;
          return (
            <div
              key={p.id}
              data-testid={`board-ship-${p.id}`}
              title={`${p.name} — ${p.ship.cargo.length} cargo`}
              className="pointer-events-none absolute flex flex-col items-center motion-safe:transition-[left,top] motion-safe:duration-700 motion-safe:ease-in-out"
              style={{
                left: `calc(${node.left}% + ${spread}px)`,
                top: `calc(${node.top}% - 20px)`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className={cn('block h-7 w-12 drop-shadow sm:h-8 sm:w-14', isActive && 'motion-safe:animate-pulse')}>
                <ShipSvg tint={seatColorOf(game.players, p.id).hull} cargo={p.ship.cargo} />
              </span>
              <span
                className={cn(
                  'mt-0.5 rounded px-1 text-[8px] font-semibold leading-none sm:text-[9px]',
                  isActive ? 'bg-[#a05a24] text-[#f6ecd8]' : 'bg-[#5b4426]/70 text-[#f6ecd8]',
                )}
              >
                {p.name}
                {p.ship.cargo.length > 0 ? ` ·${p.ship.cargo.length}` : ''}
              </span>
            </div>
          );
        });
      })}
    </div>
  );
}
