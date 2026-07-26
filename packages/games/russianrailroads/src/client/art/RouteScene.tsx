/**
 * Russian Railroads — "The Permanent Way" route landscapes (RR9, comps artifact rev 2, owner-approved
 * 2026-07-26). Each of the three routes gets an authored horizontal band with the railway running
 * through it: a painted-scenery ground the track line hangs over, plus the iron-chrome workshop wall the
 * industry column sits on.
 *
 * Colors are hardcoded on purpose — this is diegetic "physical board" art (a printed player board) and
 * does NOT re-theme in dark mode (same rule as Stone Age's Scene and Container's board). The interactive
 * chrome the integrator (RR9 package ②) lays over it uses semantic tokens. Every band is authored as
 * layered gradients + simple shapes so `preserveAspectRatio="none"` stretch stays safe from a desktop-wide
 * row down to a mobile-tall one (the Morning Valley discipline). The scenery is deliberately MUTED — the
 * comp's trade-off note: it must never fight the rules objects placed on top of it. All decorative.
 */
import type { RouteId } from '../../engine';

/** The snow-line taiga the Trans-Siberian climbs through — pale ice sky, muted conifers, a snowfield. */
function TransSiberian() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="rr-ts-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dfe6ec" />
          <stop offset="1" stopColor="#c9d4dc" />
        </linearGradient>
        <linearGradient id="rr-ts-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef3f6" />
          <stop offset="1" stopColor="#dbe3e9" />
        </linearGradient>
      </defs>
      {/* ice-blue sky */}
      <rect width="100" height="40" fill="url(#rr-ts-sky)" />
      {/* distant taiga treeline — a muted band of conifer tips along the horizon */}
      <path
        d="M0 26 l4 -6 4 6 3 -8 4 8 4 -5 4 5 5 -9 4 9 4 -6 4 6 4 -8 4 8 5 -5 4 5 4 -9 4 9 4 -6 4 6 4 -7 4 7 4 -5 4 5 L100 40 L0 40 Z"
        fill="#9fb3a6"
      />
      {/* nearer, darker conifers for depth */}
      <g fill="#87a091" opacity="0.9">
        <path d="M14 30 l3 -7 3 7 z" />
        <path d="M40 31 l3.4 -8 3.4 8 z" />
        <path d="M72 30 l3 -7 3 7 z" />
      </g>
      {/* the snowfield the rails cross */}
      <path d="M0 30 Q26 27 52 30 Q76 33 100 29 L100 40 L0 40 Z" fill="url(#rr-ts-snow)" />
      <path d="M8 34 Q30 32 54 34" fill="none" stroke="#ffffff" strokeWidth="0.6" opacity="0.6" />
    </svg>
  );
}

/** The granite capital — warm pale sky over generic Petrine silhouettes (a dome, a spire, rooflines). */
function StPetersburg() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="rr-sp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8e2d4" />
          <stop offset="1" stopColor="#d4cbb8" />
        </linearGradient>
      </defs>
      {/* warm pale sky */}
      <rect width="100" height="40" fill="url(#rr-sp-sky)" />
      {/* the granite skyline — generic Petrine shapes, all one muted stone tone */}
      <g fill="#b9a98f">
        {/* left rooflines */}
        <rect x="4" y="22" width="12" height="10" />
        <path d="M4 22 l6 -4 6 4 z" />
        <rect x="18" y="24" width="9" height="8" />
        {/* the central dome + drum + finial */}
        <rect x="44" y="22" width="12" height="10" />
        <path d="M44 22 Q50 10 56 22 z" />
        <rect x="49" y="9" width="2" height="4" />
        <circle cx="50" cy="8" r="1.2" />
        {/* the spire */}
        <rect x="70" y="18" width="4" height="14" />
        <path d="M70 18 l2 -12 2 12 z" />
        <circle cx="72" cy="5.4" r="0.9" />
        {/* right rooflines */}
        <rect x="80" y="25" width="10" height="7" />
        <path d="M80 25 l5 -3 5 3 z" />
        <rect x="92" y="27" width="6" height="5" />
      </g>
      {/* window rows, kept faint */}
      <g fill="#a2937b" opacity="0.7">
        <rect x="6" y="25" width="1.4" height="2" />
        <rect x="10" y="25" width="1.4" height="2" />
        <rect x="46" y="26" width="1.4" height="2" />
        <rect x="52" y="26" width="1.4" height="2" />
      </g>
      {/* the granite embankment the rails run along */}
      <rect x="0" y="32" width="100" height="8" fill="#c3b7a0" />
      <path d="M0 33 h100" stroke="#a89a80" strokeWidth="0.5" opacity="0.7" />
    </svg>
  );
}

/** The open steppe toward Kyiv — golden sky over rolling wheat-gold ground. */
function Kyiv() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="rr-kv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ead9c0" />
          <stop offset="1" stopColor="#d8c4a4" />
        </linearGradient>
        <linearGradient id="rr-kv-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d0b378" />
          <stop offset="1" stopColor="#c7a86a" />
        </linearGradient>
      </defs>
      {/* golden sky */}
      <rect width="100" height="40" fill="url(#rr-kv-sky)" />
      {/* a far rolling ridge */}
      <path d="M0 24 Q30 19 58 23 Q80 26 100 22 L100 40 L0 40 Z" fill="#cdb587" opacity="0.8" />
      {/* the near wheat-gold ground */}
      <path d="M0 27 Q28 23 54 27 Q78 31 100 26 L100 40 L0 40 Z" fill="url(#rr-kv-ground)" />
      {/* wheat furrows, kept faint */}
      <g stroke="#b3945a" strokeWidth="0.5" opacity="0.55" fill="none">
        <path d="M6 32 Q30 30 54 32" />
        <path d="M12 36 Q40 34 70 36" />
      </g>
    </svg>
  );
}

/**
 * The painted landscape band for one route (`transsiberian` | `stpetersburg` | `kyiv`). Absolutely
 * positioned to fill its parent; the integrator layers a `RailLine` and the rules objects over it.
 */
export function RouteBand({ route }: { route: RouteId }) {
  switch (route) {
    case 'transsiberian':
      return <TransSiberian />;
    case 'stpetersburg':
      return <StPetersburg />;
    default:
      return <Kyiv />;
  }
}

/**
 * The workshop-wall dark ground for the industry column — iron chrome, muted so factory tiles read on
 * it. Fills its parent; `preserveAspectRatio="none"` keeps it stretch-safe as a tall column or a strip.
 */
export function IronPanel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="rr-iron" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a3d43" />
          <stop offset="1" stopColor="#2b2d32" />
        </linearGradient>
      </defs>
      <rect width="40" height="100" fill="url(#rr-iron)" />
      {/* riveted panel seams for the workshop-wall read */}
      <g stroke="#454951" strokeWidth="0.6" opacity="0.8">
        <path d="M0 33 h40 M0 66 h40" />
      </g>
      <g fill="#4a4e55" opacity="0.7">
        <circle cx="4" cy="4" r="0.9" />
        <circle cx="36" cy="4" r="0.9" />
        <circle cx="4" cy="96" r="0.9" />
        <circle cx="36" cy="96" r="0.9" />
      </g>
    </svg>
  );
}

/**
 * The railway itself — a dark rail with a bright highlight and evenly spaced station ticks (the route's
 * spaces). A reusable overlay: absolutely position it over a `RouteBand`. `stations` sets the tick count.
 * Stretch-safe (`preserveAspectRatio="none"`).
 */
export function RailLine({ stations = 8, className }: { stations?: number; className?: string }) {
  const ticks = Array.from({ length: stations }, (_, i) => ((i + 0.5) / stations) * 100);
  return (
    <svg className={className} viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden>
      {/* the rail: dark bed with a bright crown */}
      <line x1="0" y1="4" x2="100" y2="4" stroke="#4a4d53" strokeWidth="3" />
      <line x1="0" y1="4" x2="100" y2="4" stroke="#6a6f78" strokeWidth="1" />
      {/* station ticks — a cross-tie at each of the route's spaces */}
      <g stroke="#4a4d53" strokeWidth="1.4">
        {ticks.map((x, i) => (
          <line key={i} x1={x} y1="1.4" x2={x} y2="6.6" />
        ))}
      </g>
    </svg>
  );
}
