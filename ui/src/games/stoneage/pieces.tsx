import { RESOURCES } from '@game-hub/engine/stoneage';
import type { BuildingCost } from '@game-hub/engine/stoneage';
import { ResourceIcon } from './art';

/** A row of dashed "any resource" pips (a card's slot cost, an open building cost). */
export function AnyPips({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="grid h-3.5 w-3.5 place-items-center rounded-full border border-dashed border-current text-[8px] font-bold opacity-70">
          ?
        </span>
      ))}
    </span>
  );
}

/**
 * A building's cost as scannable icon pips instead of a text string (visual upgrade, 2026-07):
 * fixed → one `ResourceIcon` per unit; choice → two dashed kind-groups; any → dashed pips + range.
 * Callers keep a text fallback in `title`/`sr-only` — the pips are `aria-hidden`.
 */
export function CostPips({ cost }: { cost: BuildingCost }) {
  if (cost.kind === 'fixed') {
    return (
      <span className="inline-flex flex-wrap items-center gap-0.5" aria-hidden>
        {RESOURCES.flatMap((r) =>
          Array.from({ length: cost.resources[r] ?? 0 }, (_, i) => <ResourceIcon key={`${r}-${i}`} resource={r} className="h-4 w-4" />),
        )}
      </span>
    );
  }
  if (cost.kind === 'choice') {
    const perKind = Math.floor(cost.count / cost.kinds);
    return (
      <span className="inline-flex items-center gap-1" aria-hidden>
        {Array.from({ length: cost.kinds }, (_, k) => (
          <span key={k} className="inline-flex gap-0.5 rounded border border-dashed border-current px-0.5 py-px opacity-90">
            <AnyPips count={perKind} />
          </span>
        ))}
        <span className="text-[10px]">
          {cost.count} from {cost.kinds} kinds
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      <AnyPips count={Math.min(cost.max, 3)} />
      <span className="text-[10px]">
        {cost.min}–{cost.max} any
      </span>
    </span>
  );
}
