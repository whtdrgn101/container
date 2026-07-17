import {
  PLACE_CAPACITY,
  PLACE_RESOURCE,
  PLACES,
  RESOURCE_THRESHOLD,
  RESOURCES,
} from '@game-hub/engine/stoneage';
import type { PlaceId, Resource, StoneAgeView } from '@game-hub/engine/stoneage';
import { cn } from '@/lib/utils';
import type { BoardProps } from '../types';

/** Human labels for the board places. */
const PLACE_LABEL: Record<PlaceId, string> = {
  toolMaker: 'Tool maker',
  hut: 'Hut',
  field: 'Field',
  hunt: 'Hunt',
  forest: 'Forest',
  clayPit: 'Clay pit',
  quarry: 'Quarry',
  river: 'River',
};

const RESOURCE_LABEL: Record<Resource, string> = { wood: 'Wood', brick: 'Brick', stone: 'Stone', gold: 'Gold' };
const RESOURCE_DOT: Record<Resource, string> = {
  wood: 'bg-amber-700',
  brick: 'bg-orange-500',
  stone: 'bg-slate-400',
  gold: 'bg-yellow-400',
};

const occupancy = (place: Readonly<Record<string, number>>): number =>
  Object.values(place).reduce((sum, n) => sum + n, 0);

/**
 * Stone Age's board — the **bootstrap scaffold** (roadmap SA0). Read-only: it renders the starting
 * setup (the board's placement spots and each player's holdings) so the game is real and demoable while
 * the mechanics land one action per stage. No controls yet — each stage wires up its own.
 */
export default function StoneAgeBoard({ game }: BoardProps<StoneAgeView>) {
  const capacityLabel = (place: PlaceId): string => {
    const cap = PLACE_CAPACITY[place];
    return cap === null ? '∞' : String(cap);
  };

  return (
    <div data-testid="board" className="space-y-4">
      <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        🛠️ Stone Age is being built one action at a time — this board is read-only for now. See the game's
        roadmap for the plan.
      </p>

      {/* The board places people can be assigned to (pg. 4). */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Board</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLACES.map((place) => {
            const used = occupancy(game.placements[place]);
            const resource = place in PLACE_RESOURCE ? PLACE_RESOURCE[place as keyof typeof PLACE_RESOURCE] : null;
            return (
              <div key={place} data-testid={`place-${place}`} className="rounded-md border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{PLACE_LABEL[place]}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {used}/{capacityLabel(place)}
                  </span>
                </div>
                {resource && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', RESOURCE_DOT[resource])} aria-hidden />
                    {RESOURCE_LABEL[resource]} · per full {RESOURCE_THRESHOLD[resource]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Each player's board (pg. 2). */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Players</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {game.players.map((player, seat) => (
            <div
              key={player.id}
              data-testid={`player-${player.id}`}
              className={cn('rounded-lg border bg-card p-3', seat === game.activePlayerIndex && 'ring-1 ring-primary')}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{player.name}</span>
                <span className="text-xs text-muted-foreground" data-testid={`score-${player.id}`}>
                  {player.score} pts
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span>👤 People: <span className="font-medium tabular-nums">{player.people}</span></span>
                <span>🍖 Food: <span className="font-medium tabular-nums">{player.food}</span></span>
                <span>🌾 Food track: <span className="font-medium tabular-nums">{player.foodTrack}</span></span>
                <span>🔨 Tools: <span className="font-medium tabular-nums">{player.tools.join(', ') || '—'}</span></span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {RESOURCES.map((resource) => (
                  <span key={resource} className="flex items-center gap-1">
                    <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', RESOURCE_DOT[resource])} aria-hidden />
                    <span className="tabular-nums">{player.resources[resource]}</span>
                  </span>
                ))}
                <span className="text-muted-foreground">· 🃏 {player.civCards.length} · 🏠 {player.buildings}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
