import { GAP_LANE_INDICES, INDUSTRY_LANE } from '../engine';
import type { PlayerView } from '../engine';
import { cn } from '@/lib/utils';
import { FactoryTile, IronPanel, WrenchIcon } from './art';

/**
 * A player's industry track as **the workshop wall** (RR9, pg. 13): the lane of printed-point spaces and
 * gaps rides on an `IronPanel`, `FactoryTile`s fill the gaps the player has built, and the `WrenchIcon`
 * marks the wrench's position (a second wrench too, pg. 47). All hardcoded diegetic art. `INDUSTRY_LANE`
 * is the shared layout; the player's own state is the wrench index + the filled gaps.
 */
export function IndustryStrip({ player }: { player: PlayerView }) {
  const { wrench, factories, secondWrench } = player.industry;
  return (
    <div className="mt-2" data-testid={`rr-industry-${player.id}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <WrenchIcon className="h-4 w-4" />
        <span data-testid={`rr-wrench-${player.id}`}>Industry — wrench on space {wrench}</span>
      </div>
      <div className="relative overflow-hidden rounded-md p-1">
        <IronPanel className="absolute inset-0 h-full w-full" />
        <div className="relative flex flex-wrap gap-0.5">
          {INDUSTRY_LANE.map((entry, i) => {
            const here = i === wrench || i === secondWrench;
            const factory = entry.kind === 'gap' ? factories[GAP_LANE_INDICES.indexOf(i)] : null;
            const filled = factory != null;
            return (
              <span
                key={i}
                title={
                  entry.kind === 'gap'
                    ? filled
                      ? `factory #${factory}`
                      : 'gap — needs a factory'
                    : entry.points != null
                      ? `${entry.points} points`
                      : 'idea space'
                }
                className={cn(
                  'relative inline-flex h-6 min-w-6 items-center justify-center rounded-sm text-[9px] font-medium leading-none',
                  here && 'ring-2 ring-amber-400',
                )}
              >
                {entry.kind === 'gap' ? (
                  filled ? (
                    <FactoryTile number={factory} size={22} />
                  ) : (
                    <span
                      aria-hidden
                      className="inline-block h-5 w-5 rounded-sm border border-dashed"
                      style={{ borderColor: '#6a6f78' }}
                    />
                  )
                ) : (
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-0.5 tabular-nums"
                    style={{ background: '#e8e2d4', color: '#17181c' }}
                  >
                    {entry.points ?? '💡'}
                  </span>
                )}
                {here ? (
                  <WrenchIcon className="absolute -top-1.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2" fill="#e8b93c" />
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
