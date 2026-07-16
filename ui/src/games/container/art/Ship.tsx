import { cn } from '@/lib/utils';

/**
 * An original container-ship glyph: a shaded hull with a pointed bow, a bridge, a couple of stacked
 * deck containers, and a wake. Fills its box (set size via `className`). `tint` colors the hull.
 */
export function ShipSvg({ tint = '#334155', className }: { tint?: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 36" className={cn('block h-full w-full', className)} aria-hidden focusable="false">
      {/* wake */}
      <g stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" fill="none">
        <path d="M4 33 q6 -2 12 0" />
        <path d="M20 34 q8 -2 16 0" />
      </g>
      {/* hull with a pointed bow */}
      <path d="M6 20 H50 L61 23 L56 31 Q54 32.5 51 32.5 H12 Q9 32.5 8 30 Z" fill={tint} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <path d="M6 20 H50 L61 23 H6 Z" fill="#ffffff" opacity="0.12" />
      <rect x="8" y="27" width="47" height="3.4" fill="#000000" opacity="0.18" />
      {/* bridge / superstructure at the stern */}
      <rect x="8" y="11" width="12" height="9" rx="1.5" fill="#e2e8f0" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <g fill="#475569">
        <rect x="10" y="13.5" width="2.5" height="2.5" rx="0.4" />
        <rect x="14" y="13.5" width="2.5" height="2.5" rx="0.4" />
      </g>
      {/* stacked deck containers */}
      <g stroke="rgba(0,0,0,0.28)" strokeWidth="0.8">
        <rect x="23" y="14.5" width="9" height="5.5" rx="1" fill="#ef4444" />
        <rect x="33" y="14.5" width="9" height="5.5" rx="1" fill="#eab308" />
        <rect x="43" y="14.5" width="7" height="5.5" rx="1" fill="#3b82f6" />
        <rect x="27" y="9" width="9" height="5.5" rx="1" fill="#22c55e" />
        <rect x="37" y="9" width="9" height="5.5" rx="1" fill="#f8fafc" />
      </g>
    </svg>
  );
}
