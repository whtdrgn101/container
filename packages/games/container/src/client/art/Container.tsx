import { cn } from '@game-hub/ui-kit';

/**
 * An original shipping-container glyph: corrugated body with a top highlight, bottom shadow, corner
 * castings and a door latch. Fills its box (set width/height via `className`). Colored by `color`.
 */
export function ContainerSvg({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 48 32" className={cn('block h-full w-full', className)} aria-hidden focusable="false">
      {/* body */}
      <rect x="1.5" y="4" width="45" height="24" rx="2.5" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      {/* top highlight + bottom shadow for volume */}
      <rect x="2.5" y="5" width="43" height="8" rx="2" fill="#ffffff" opacity="0.17" />
      <rect x="2.5" y="20" width="43" height="7" rx="2" fill="#000000" opacity="0.14" />
      {/* corrugation ribs */}
      <g stroke="rgba(0,0,0,0.17)" strokeWidth="1.3" strokeLinecap="round">
        <line x1="9" y1="7" x2="9" y2="25" />
        <line x1="15" y1="7" x2="15" y2="25" />
        <line x1="21" y1="7" x2="21" y2="25" />
        <line x1="27" y1="7" x2="27" y2="25" />
        <line x1="33" y1="7" x2="33" y2="25" />
      </g>
      {/* right-hand door latches */}
      <g stroke="rgba(0,0,0,0.32)" strokeWidth="1.3" strokeLinecap="round">
        <line x1="39.5" y1="7" x2="39.5" y2="25" />
        <line x1="43" y1="7" x2="43" y2="25" />
      </g>
      {/* corner castings */}
      <g fill="rgba(0,0,0,0.33)">
        <rect x="2" y="4.5" width="4" height="3.2" rx="1" />
        <rect x="42" y="4.5" width="4" height="3.2" rx="1" />
        <rect x="2" y="24.3" width="4" height="3.2" rx="1" />
        <rect x="42" y="24.3" width="4" height="3.2" rx="1" />
      </g>
    </svg>
  );
}
