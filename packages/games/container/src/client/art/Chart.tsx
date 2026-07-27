/**
 * The mariner's chart — Container's board backdrop (visual overhaul, 2026-07; original art, approved
 * on the comps artifact as "aged mariner's parchment, rev 2"). A parchment sea with mottled aging,
 * sepia ink, graticule, depth contours, dotted rhumb routes radiating from the charted **ocean
 * waypoint** (every sail is one hop through open water), Container Island with working docks, the
 * Off-Shore Bank as a commercial building (window-grid block, vault wing, $ plate) on its islet, and
 * seat-tinted quays along the harbor coast.
 *
 * Colors are hardcoded on purpose — the chart is diegetic "physical board" art and does not re-theme
 * in dark mode (same rule as both games' boards); interactive chrome above it is the BoardMap's job.
 * Authored as one stretch layer (`preserveAspectRatio="none"`); the compass rose would distort with
 * it, so it's a separate fixed-aspect component the BoardMap positions.
 */
const INK = '#6b4f2a';
const SEA = '#e8d9b8';
const LAND = '#d9c496';

/** An irregular contour ring around (cx, cy) — the hand-drawn depth-line look. */
function ring(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy} Q${cx - rx * 0.9} ${cy - ry} ${cx} ${cy - ry} Q${cx + rx * 1.05} ${cy - ry * 0.9} ${cx + rx} ${cy} Q${cx + rx * 0.92} ${cy + ry} ${cx} ${cy + ry} Q${cx - rx * 1.06} ${cy + ry * 0.88} ${cx - rx} ${cy} Z`;
}

export interface ChartProps {
  /** Percent left-positions of the player harbors (from `boardNodes`), with each seat's hull tint. */
  readonly harbors: readonly { left: number; tint: string }[];
}

/** The node geometry the routes are authored against — must match `boardNodes` in BoardMap. */
const ISLAND = { x: 50, y: 25 };
const BANK = { x: 86, y: 22 };
const OCEAN = { x: 50, y: 57 };
const HARBOR_TOP = 84;

export function Chart({ harbors }: ChartProps) {
  const routeTargets = [ISLAND, BANK, ...harbors.map((h) => ({ x: h.left, y: HARBOR_TOP }))];
  const routes = routeTargets.map((t) => `M${OCEAN.x} ${OCEAN.y} L${t.x} ${t.y}`).join(' ');
  const graticule =
    [10, 30, 50, 70, 90].map((x) => `M${x} 0 V100`).join(' ') +
    ' ' +
    [12, 34, 56, 78].map((y) => `M0 ${y} H100`).join(' ');
  const hatch = Array.from({ length: 24 }, (_, i) => `M${2 + i * 4.2} 92 l1.6 2.4`).join(' ');

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <rect width="100" height="100" fill={SEA} />
      {/* parchment mottling */}
      <ellipse cx="22" cy="60" rx="26" ry="18" fill="#dcc79e" opacity="0.5" />
      <ellipse cx="76" cy="48" rx="22" ry="16" fill="#e0cda6" opacity="0.5" />
      <ellipse cx="45" cy="90" rx="30" ry="12" fill="#dcc79e" opacity="0.4" />
      <path d={graticule} stroke={INK} strokeWidth="0.18" opacity="0.16" fill="none" />

      {/* the harbor coast along the bottom, hatched shoreline, one tinted quay per seat */}
      <path d="M0 92 Q25 89 50 92 Q75 95 100 91 L100 100 L0 100 Z" fill={LAND} stroke={INK} strokeWidth="0.5" />
      <path d={hatch} stroke={INK} strokeWidth="0.25" opacity="0.6" fill="none" />
      {harbors.map((h, i) => (
        <g key={i}>
          <rect x={h.left - 4} y={89.2} width="8" height="0.9" fill={h.tint} opacity="0.9" />
          <rect x={h.left - 4} y={90.1} width="8" height="1.5" fill={INK} opacity="0.75" />
          <path
            d={`M${h.left - 3} 91.6 v1.8 M${h.left} 91.6 v1.8 M${h.left + 3} 91.6 v1.8`}
            stroke={INK}
            strokeWidth="0.4"
            opacity="0.7"
          />
        </g>
      ))}

      {/* Container Island: landmass, contours, hills — and its working docks + crane */}
      <path d={ring(50, 25, 7.5, 5.2)} fill={LAND} stroke={INK} strokeWidth="0.55" />
      <path d={ring(50, 25, 10.5, 7.6)} fill="none" stroke={INK} strokeWidth="0.3" opacity="0.45" />
      <path d={ring(50, 25, 13.5, 10)} fill="none" stroke={INK} strokeWidth="0.25" opacity="0.32" />
      <path d="M46.5 23 l2.2 -2.8 2.2 2.8 Z" fill={INK} opacity="0.5" />
      <path d="M51 24 l1.8 -2.2 1.8 2.2 Z" fill={INK} opacity="0.35" />
      <g stroke={INK} fill={INK}>
        <rect x="45.2" y="29.4" width="1.7" height="4.6" opacity="0.8" stroke="none" />
        <path d="M45.4 34.2 v1.2 M46.7 34.2 v1.2" strokeWidth="0.35" opacity="0.7" />
        <rect x="51.8" y="29.8" width="1.7" height="5.4" opacity="0.8" stroke="none" />
        <path d="M52 35.4 v1.2 M53.3 35.4 v1.2" strokeWidth="0.35" opacity="0.7" />
        <path d="M48.6 29.6 v-3.4 l2.6 -1" strokeWidth="0.5" fill="none" opacity="0.85" />
        <path d="M51.2 25.2 v1.6" strokeWidth="0.35" fill="none" opacity="0.7" />
        <rect x="50.7" y="26.8" width="1" height="0.9" opacity="0.7" stroke="none" />
      </g>

      {/* the Off-Shore Bank: islet + commercial building (window grid, vault wing, $ plate) + quay */}
      <path d={ring(86, 22, 6, 4.4)} fill={LAND} stroke={INK} strokeWidth="0.55" />
      <path d={ring(86, 22, 8.6, 6.4)} fill="none" stroke={INK} strokeWidth="0.28" opacity="0.45" />
      <g>
        <rect x="83" y="16.8" width="5" height="7.2" fill={SEA} stroke={INK} strokeWidth="0.5" />
        <path d="M84 18.4 h3 M84 20 h3 M84 21.6 h3" stroke={INK} strokeWidth="0.4" opacity="0.75" />
        <path d="M84.6 18.4 v3.2 M85.7 18.4 v3.2 M86.8 18.4 v3.2" stroke={INK} strokeWidth="0.25" opacity="0.5" />
        <rect x="88" y="19.6" width="3.4" height="4.4" fill={SEA} stroke={INK} strokeWidth="0.45" />
        <path d="M88.6 21 h2.2 M88.6 22.4 h2.2" stroke={INK} strokeWidth="0.35" opacity="0.7" />
        <rect x="84.8" y="22.6" width="1.4" height="1.4" fill={INK} opacity="0.55" />
        {/* the $ plate over the entrance */}
        <text x="85.5" y="16.2" textAnchor="middle" fontSize="2.6" fontWeight="bold" fill={INK}>
          $
        </text>
        <rect x="82.6" y="26.2" width="6.8" height="1.1" fill={INK} opacity="0.75" />
        <path d="M83.4 27.3 v1.1 M86 27.3 v1.1 M88.6 27.3 v1.1" stroke={INK} strokeWidth="0.35" opacity="0.65" />
      </g>

      {/* rhumb routes from the ocean waypoint, and the charted waypoint itself */}
      <path d={routes} stroke="#8a5a2b" strokeWidth="0.5" strokeDasharray="1.6 1.6" opacity="0.9" fill="none" />
      <circle cx={OCEAN.x} cy={OCEAN.y} r="2.6" fill="none" stroke="#8a5a2b" strokeWidth="0.5" />
      <path
        d={`M${OCEAN.x} ${OCEAN.y - 3.4} V${OCEAN.y + 3.4} M${OCEAN.x - 3.4} ${OCEAN.y} H${OCEAN.x + 3.4}`}
        stroke="#8a5a2b"
        strokeWidth="0.5"
      />
      <circle cx={OCEAN.x} cy={OCEAN.y} r="4.4" fill="none" stroke="#8a5a2b" strokeWidth="0.25" opacity="0.6" />
    </svg>
  );
}

/** The decorative compass rose — fixed aspect, positioned by the BoardMap (never stretched). */
export function CompassRose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden focusable="false">
      <circle cx="20" cy="20" r="15" fill="none" stroke={INK} strokeWidth="0.7" opacity="0.8" />
      <circle cx="20" cy="20" r="11" fill="none" stroke={INK} strokeWidth="0.4" opacity="0.5" />
      <path d="M20 3 L22.4 17.6 L20 20 L17.6 17.6 Z" fill="#a05a24" />
      <path d="M20 37 L22.4 22.4 L20 20 L17.6 22.4 Z" fill={INK} opacity="0.75" />
      <path d="M3 20 L17.6 17.6 L20 20 L17.6 22.4 Z" fill={INK} opacity="0.75" />
      <path d="M37 20 L22.4 22.4 L20 20 L22.4 17.6 Z" fill={INK} opacity="0.75" />
      <path
        d="M9.4 9.4 L16.4 13.2 L18 18 Z M30.6 9.4 L23.6 13.2 L22 18 Z M9.4 30.6 L16.4 26.8 L18 22 Z M30.6 30.6 L23.6 26.8 L22 22 Z"
        fill={INK}
        opacity="0.45"
      />
      <text x="20" y="2.8" fontSize="4" textAnchor="middle" fill={INK} fontWeight="bold">
        N
      </text>
    </svg>
  );
}
