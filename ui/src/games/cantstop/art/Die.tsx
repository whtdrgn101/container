import { cn } from '@/lib/utils';

/** Pip layout per face, on a 3×3 grid (columns/rows 1–3). Original — a plain dotted die, not any
 * published game's art. */
const PIPS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [3, 1],
    [1, 3],
    [3, 3],
  ],
  5: [
    [1, 1],
    [3, 1],
    [2, 2],
    [1, 3],
    [3, 3],
  ],
  6: [
    [1, 1],
    [3, 1],
    [1, 2],
    [3, 2],
    [1, 3],
    [3, 3],
  ],
};

/**
 * A single die face, drawn as pips. Theme-aware: the body is the background, the pips and border are
 * `currentColor` (set text colour via `className`). Fills its box — size it with `className`.
 */
export function Die({ value, className }: { value: number; className?: string }) {
  const pips = PIPS[value] ?? [];
  return (
    <svg
      viewBox="0 0 4 4"
      className={cn('block text-foreground', className)}
      role="img"
      aria-label={`die showing ${value}`}
    >
      <rect
        x="0.28"
        y="0.28"
        width="3.44"
        height="3.44"
        rx="0.7"
        fill="var(--color-background)"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="0.14"
      />
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="0.38" fill="currentColor" />
      ))}
    </svg>
  );
}
