/**
 * Saint Petersburg's glyph set — the "Malachite & Gilt" visual overhaul (SP8, approved on the comps
 * artifact rev 2). Five ware glyphs (they gate displacement legality, pg. 7, so they must read crisply
 * down to ~20px), plus the income/points/any-ware marks the card faces and panels hang off of.
 *
 * Colors are hardcoded on purpose — these are diegetic "physical component" art (ware tokens, coins,
 * shield tokens) and do NOT re-theme in dark mode (same rule as Container's Chart and Stone Age's
 * Scene). Interactive chrome above them uses semantic tokens, which is a different package's concern.
 *
 * All glyphs sit on the repo's 24×24 icon viewBox. Every component here is decorative (`aria-hidden`);
 * meaning is carried by adjacent text the integrator supplies.
 */
import type { CardKind, Ware } from '@game-hub/engine/stpetersburg';

/** The five green ware symbols (pg. 7), each an original silhouette on the 24×24 grid. */
export function WareIcon({ ware, className }: { ware: Ware; className?: string }) {
  switch (ware) {
    case 'lumber':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
          <rect x="1" y="7" width="19" height="7" rx="3.5" fill="#8a6a44" />
          <circle cx="4.5" cy="10.5" r="3.4" fill="#c9a877" />
          <circle cx="4.5" cy="10.5" r="1.5" fill="#a5854f" />
          <rect x="3" y="14" width="19" height="7" rx="3.5" fill="#755837" />
          <circle cx="6.5" cy="17.5" r="3.4" fill="#c9a877" />
          <circle cx="6.5" cy="17.5" r="1.5" fill="#a5854f" />
        </svg>
      );
    case 'gold':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
          <polygon points="5,9 19,9 22,15 2,15" fill="#d9b45a" />
          <polygon points="5,9 19,9 20,11 4,11" fill="#eccf85" />
          <polygon points="7,16 17,16 19,21 5,21" fill="#b8912f" />
        </svg>
      );
    case 'wool':
      // rev 2 — a rough ball of yarn: base ball, cross-wound strands, a loose trailing strand and a
      // few stray fibres for the "rough" read.
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
          <circle cx="12" cy="12" r="8.5" fill="#e8e2d4" />
          <path
            d="M4.4 9.2 Q12 4.6 19.6 9.2 M4.4 14.8 Q12 19.4 19.6 14.8 M9.2 4.4 Q4.8 12 9.2 19.6 M14.8 4.4 Q19.2 12 14.8 19.6"
            stroke="#b9ad94"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M18.6 16.4 q3.4 0.8 3 4.4" stroke="#cfc6ae" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M5.4 6.4 l-1.2 -1.2 M18.8 5.8 l1.2 -1.1 M4.4 17.2 l-1.3 0.9" stroke="#cfc6ae" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case 'fur':
      // rev 2 — a splayed skinned-pelt silhouette: head top-center, four leg stubs, waisted body.
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
          <path
            d="M12 1.6 c-1.5 0 -2.4 1 -2.5 2.3 l-4.3 1.6 c-1.6 0.6 -1.3 2.7 0.4 2.9 l3.4 0.3 c-0.7 2.5 -0.7 4.3 0 6.8 l-3.3 2.3 c-1.4 1 -0.4 3 1.3 2.6 l4 -1 c0.7 0.4 2.3 0.4 3 0 l4 1 c1.7 0.4 2.7 -1.6 1.3 -2.6 l-3.3 -2.3 c0.7 -2.5 0.7 -4.3 0 -6.8 l3.4 -0.3 c1.7 -0.2 2 -2.3 0.4 -2.9 l-4.3 -1.6 C14.4 2.6 13.5 1.6 12 1.6 z"
            fill="#9c7248"
          />
          <path d="M12 6 v12" stroke="#7a5533" strokeWidth="1.3" fill="none" />
          <path d="M9.6 9 q2.4 1.4 4.8 0 M9.6 14.6 q2.4 1.4 4.8 0" stroke="#b08a5c" strokeWidth="1" fill="none" />
          <circle cx="10.6" cy="3.9" r="0.8" fill="#5c3f22" />
          <circle cx="13.4" cy="3.9" r="0.8" fill="#5c3f22" />
        </svg>
      );
    default: // ship
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
          <path d="M2 15 q10 8 20 0 l-2.6 6 H4.6 z" fill="#6d4a2f" />
          <rect x="11" y="2" width="2" height="13" fill="#4a3420" />
          <path d="M13 3 l7 5 -7 2.6 z" fill="#e8dfc8" />
        </svg>
      );
  }
}

/** Dark shield fill per card group — the token colour of a building/aristocrat/worker/trading mark. */
const SHIELD_FILL: Record<CardKind, string> = {
  worker: '#5f8a5f',
  building: '#3f6a92',
  aristocrat: '#c08137',
  trading: '#8f5a86',
};

/**
 * The income mark — a struck gold coin bearing a ruble figure (worker cards pay rubles, pg. 3). Its own
 * 24×24 viewBox; scale with `size`.
 */
export function CoinMark({ value, size = 24, className }: { value: number; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="10" fill="#d9b45a" stroke="#8a6a1d" strokeWidth="2" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#8a6a1d" strokeWidth="0.6" opacity="0.55" />
      <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, 'Times New Roman', serif" fontSize="11" fontWeight="bold" fill="#5c4512">
        {value}
      </text>
    </svg>
  );
}

/**
 * The victory-points mark — a laurel shield bearing a figure, tinted to the card group (buildings and
 * aristocrats score points, pg. 3). Its own 24×24 viewBox (path authored around a centred origin, then
 * translated); scale with `size`.
 */
export function ShieldMark({ value, kind, size = 24, className }: { value: number; kind: CardKind; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden focusable="false">
      <g transform="translate(12 13)">
        <path d="M0 -13 l11 4 v9 q0 9 -11 13 q-11 -4 -11 -13 v-9 z" fill={SHIELD_FILL[kind]} stroke="#2b2b2b" strokeWidth="1.4" />
        {/* laurel sprigs framing the figure */}
        <path d="M-8 -3 q-2 4 0 8 M8 -3 q2 4 0 8" stroke="#ffffff" strokeWidth="0.9" fill="none" opacity="0.5" />
        <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, 'Times New Roman', serif" fontSize="11" fontWeight="bold" fill="#ffffff">
          {value}
        </text>
      </g>
    </svg>
  );
}

/**
 * The Czar's "any green ware may displace" rosette (pg. 7 — Czar the Carpenter upgrades any green
 * worker). Five green ware-dots ringed around a dark hub. Decorative.
 */
export function AnyWareRosette({ className }: { className?: string }) {
  const dots = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return { cx: 12 + Math.cos(a) * 9, cy: 12 + Math.sin(a) * 9 };
  });
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r="3" fill="#5f8a5f" />
      ))}
      <circle cx="12" cy="12" r="3" fill="#2c3e2c" />
    </svg>
  );
}
