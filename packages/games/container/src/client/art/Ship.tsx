import type { Color } from '../../engine';
import { cn } from '@game-hub/ui-kit';
import { COLOR_HEX } from '../chips';

/**
 * The container ship (visual overhaul, 2026-07 — original art, approved on the comps artifact):
 * side-profile freighter with a **squared-off bow** (right), wheelhouse aft, and the ship's *actual*
 * cargo on deck — the deck plan is three containers across with two stacked on top (`SHIP_CAPACITY`
 * is 5). Pass `cargo` to show the load (the board map does); pass none for an empty deck (the player
 * mat does — it overlays live `ContainerChip`s instead, keeping the e2e span-count contract).
 * `tint` colors the hull (seat color). Fills its box; size via `className`.
 */
const DECK_SLOTS = [
  { x: 24, y: 18.4 },
  { x: 34, y: 18.4 },
  { x: 44, y: 18.4 },
  { x: 29, y: 13.4 },
  { x: 39, y: 13.4 },
] as const;

export function ShipSvg({
  tint = '#334155',
  cargo = [],
  className,
}: {
  tint?: string;
  cargo?: readonly Color[];
  className?: string;
}) {
  return (
    <svg viewBox="0 0 72 40" className={cn('block h-full w-full', className)} aria-hidden focusable="false">
      {/* hull: rounded stern (left), squared vertical bow face (right) */}
      <path
        d="M8 24 L66 24 L66.5 25 L66.5 32.5 L64 34.5 Q34 37 12 34.5 Q7 32 7 27 Q7 25 8 24 Z"
        fill={tint}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.6"
      />
      <path d="M8 24 L66 24 L66.5 25 L66.5 27.5 L8.5 27.5 Q7.4 26 8 24 Z" fill="#ffffff" opacity="0.15" />
      <path d="M9 31.5 L65.5 31.5" stroke="rgba(0,0,0,0.22)" strokeWidth="0.8" />
      <path d="M12 34.5 Q34 37 64 34.5 L66.5 31.5 L66.5 32.5 L64 34.5 Q34 37 12 34.5 Z" fill="rgba(0,0,0,0.25)" />
      {/* wheelhouse aft, mast + house flag */}
      <rect
        x="10"
        y="11.5"
        width="10.5"
        height="12.5"
        rx="1"
        fill="#e8e4da"
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.5"
      />
      <rect x="12" y="13.6" width="6.6" height="2.4" rx="0.5" fill="#35507a" opacity="0.85" />
      <rect x="12" y="17.6" width="6.6" height="1.6" rx="0.4" fill="#35507a" opacity="0.5" />
      <rect x="14.6" y="6" width="1.6" height="5.5" fill="#c8beac" />
      <path d="M16.2 6.6 l4.4 1.25 -4.4 1.25 Z" fill={tint} opacity="0.9" />
      {/* deck rail + bow bulwark */}
      <rect x="22" y="22" width="33" height="2" rx="0.7" fill="rgba(0,0,0,0.18)" />
      <path d="M57 22 L66 22 L66 24 L57 24 Z" fill="rgba(0,0,0,0.12)" />
      {/* cargo: three across the deck, two stacked on top */}
      {cargo.slice(0, DECK_SLOTS.length).map((color, i) => {
        const slot = DECK_SLOTS[i]!;
        return (
          <g key={i}>
            <rect
              x={slot.x}
              y={slot.y}
              width="9.2"
              height="4.8"
              rx="0.6"
              fill={COLOR_HEX[color]}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="0.4"
            />
            <path
              d={`M${slot.x + 2.3} ${slot.y} v4.8 M${slot.x + 4.6} ${slot.y} v4.8 M${slot.x + 6.9} ${slot.y} v4.8`}
              stroke="rgba(0,0,0,0.15)"
              strokeWidth="0.35"
            />
          </g>
        );
      })}
      {/* bow wave + wake */}
      <path d="M3 30 q4 -1.6 8 0 M62 33.5 q4 -1.6 8 0" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" fill="none" />
    </svg>
  );
}
