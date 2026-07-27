/**
 * Saint Petersburg's board furniture — the "Malachite & Gilt" salon (SP8, comps rev 2): a gilt-framed
 * malachite backdrop and the gilt fittings that sit on it (row rails, the draw-stack cabinet, the phase
 * dial). The mood is an imperial green-stone card table trimmed in gold.
 *
 * Colors are hardcoded on purpose — this is diegetic "physical board" art and does NOT re-theme in dark
 * mode (same rule as Container's Chart / Stone Age's Scene). The backdrop is authored as horizontal
 * bands under `preserveAspectRatio="none"` so it stretches safely from desktop-wide to mobile-tall, the
 * Scene.tsx pattern. Interactive chrome above it is the integrating Board's concern.
 */
import type { Phase } from '../../engine';

/** Gilt tones, shared across the fittings. */
const GILT = '#8a6a1d';
const GILT_BRIGHT = '#d9b45a';

/** Per-phase accent (dial dots, cabinet stacks). Muted for the cabinet, brighter for the dial. */
const CABINET_FILL: Record<Phase, string> = {
  worker: '#2f6b44',
  building: '#2b5a86',
  aristocrat: '#a8702c',
  trading: '#7c4b73',
};
const DIAL_FILL: Record<Phase, string> = {
  worker: '#67a06a',
  building: '#5b8cba',
  aristocrat: '#cd9145',
  trading: '#a86f9e',
};
const KIND_LETTER: Record<Phase, string> = { worker: 'W', building: 'B', aristocrat: 'A', trading: 'T' };
const PHASE_ORDER: readonly Phase[] = ['worker', 'building', 'aristocrat', 'trading'];

/**
 * The malachite backdrop — a gilt outer ground framing an inset malachite panel with wavy stone banding
 * and gilt corner flourishes. An absolute-inset stretch layer; drop it behind the board content.
 */
export function MalachiteBoard({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'absolute inset-0 h-full w-full'}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="spb-gilt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9b45a" />
          <stop offset="0.5" stopColor="#b8912f" />
          <stop offset="1" stopColor="#8a6a1d" />
        </linearGradient>
        <linearGradient id="spb-malachite" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#134b3c" />
          <stop offset="0.55" stopColor="#0d3a2e" />
          <stop offset="1" stopColor="#0a2f26" />
        </linearGradient>
      </defs>

      {/* gilt outer ground + inset malachite panel */}
      <rect width="100" height="100" fill="url(#spb-gilt)" />
      <rect x="3" y="3" width="94" height="94" rx="6" fill="url(#spb-malachite)" />

      {/* wavy malachite banding — 3 lighter veins + 2 deep veins, full-width horizontal waves */}
      <g fill="none">
        <path d="M3 22 Q28 17 53 22 T97 22" stroke="#1d6a52" strokeWidth="5" opacity="0.5" />
        <path d="M3 50 Q28 45 53 50 T97 50" stroke="#1d6a52" strokeWidth="5" opacity="0.5" />
        <path d="M3 78 Q28 73 53 78 T97 78" stroke="#1d6a52" strokeWidth="5" opacity="0.5" />
        <path d="M3 36 Q30 30 57 36 T97 36" stroke="#0f4b3a" strokeWidth="9" opacity="0.55" />
        <path d="M3 64 Q30 58 57 64 T97 64" stroke="#0f4b3a" strokeWidth="9" opacity="0.55" />
      </g>

      {/* gilt corner flourishes — quarter-arcs + dots */}
      <g fill="none" stroke={GILT_BRIGHT} strokeWidth="1.1" opacity="0.85">
        <path d="M6 14 Q6 6 14 6" />
        <path d="M94 14 Q94 6 86 6" />
        <path d="M6 86 Q6 94 14 94" />
        <path d="M94 86 Q94 94 86 94" />
      </g>
      <g fill={GILT_BRIGHT} opacity="0.85">
        <circle cx="9" cy="9" r="1" />
        <circle cx="91" cy="9" r="1" />
        <circle cx="9" cy="91" r="1" />
        <circle cx="91" cy="91" r="1" />
      </g>
    </svg>
  );
}

/** A thin gilt rule with a letter-spaced gold label — the header above a card row. */
export function GiltRail({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <span
        style={{ color: GILT_BRIGHT, fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: '0.22em' }}
        className="whitespace-nowrap text-xs font-semibold uppercase"
      >
        {label}
      </span>
      <span aria-hidden className="h-px flex-1" style={{ backgroundColor: GILT }} />
    </div>
  );
}

/** The draw-stack cabinet — a gilt case of four mini stacks (per group) plus the discard tally. */
export function StackCabinet({
  counts,
  discards,
  className,
}: {
  counts: Record<Phase, number>;
  discards: number;
  className?: string;
}) {
  const label = `Draw stacks — ${PHASE_ORDER.map((p) => `${KIND_LETTER[p]} ${counts[p]}`).join(', ')}; discards ${discards}`;
  return (
    <svg viewBox="0 0 168 92" className={className} role="img" aria-label={label} focusable="false">
      {/* gilt case + title */}
      <rect x="2" y="2" width="164" height="88" rx="8" fill="#0d3a2e" stroke={GILT} strokeWidth="2" />
      <text
        x="84"
        y="16"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="11"
        fontWeight="bold"
        letterSpacing="3"
        fill={GILT_BRIGHT}
      >
        STACKS
      </text>
      {/* four mini stacks */}
      {PHASE_ORDER.map((p, i) => {
        const x = 12 + i * 39;
        return (
          <g key={p}>
            <rect
              x={x}
              y="24"
              width="30"
              height="42"
              rx="4"
              fill={CABINET_FILL[p]}
              stroke="#e8e2d4"
              strokeWidth="1.2"
            />
            <rect
              x={x + 3}
              y="27"
              width="24"
              height="36"
              rx="3"
              fill="none"
              stroke="#e8e2d4"
              strokeWidth="0.6"
              opacity="0.5"
            />
            <text
              x={x + 15}
              y="42"
              textAnchor="middle"
              fontFamily="Georgia, 'Times New Roman', serif"
              fontSize="10"
              fontWeight="bold"
              fill="#f4eeda"
              opacity="0.85"
            >
              {KIND_LETTER[p]}
            </text>
            <text
              x={x + 15}
              y="58"
              textAnchor="middle"
              fontFamily="Georgia, 'Times New Roman', serif"
              fontSize="15"
              fontWeight="bold"
              fill="#ffffff"
            >
              {counts[p]}
            </text>
          </g>
        );
      })}
      {/* discard tally */}
      <text
        x="84"
        y="83"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="10"
        letterSpacing="1.5"
        fill="#9bb5a8"
      >
        DISCARDS · {discards}
      </text>
    </svg>
  );
}

/** The phase dial — a gilt medallion with four phase dots; the active phase enlarged and gold-ringed. */
export function PhaseMedallion({ phase, round, className }: { phase: Phase; round: number; className?: string }) {
  // Dots at N / E / S / W in phase order.
  const positions: Record<Phase, { x: number; y: number }> = {
    worker: { x: 50, y: 16 },
    building: { x: 84, y: 50 },
    aristocrat: { x: 50, y: 84 },
    trading: { x: 16, y: 50 },
  };
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`Phase: ${phase}, round ${round}`}
      focusable="false"
    >
      <circle cx="50" cy="50" r="46" fill="#0f4232" stroke={GILT} strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill="none" stroke={GILT_BRIGHT} strokeWidth="0.8" opacity="0.5" />
      {PHASE_ORDER.map((p) => {
        const pos = positions[p];
        const active = p === phase;
        return (
          <g key={p}>
            {active && <circle cx={pos.x} cy={pos.y} r="11" fill="none" stroke={GILT_BRIGHT} strokeWidth="2.2" />}
            <circle cx={pos.x} cy={pos.y} r={active ? 8.5 : 6} fill={DIAL_FILL[p]} opacity={active ? 1 : 0.45} />
          </g>
        );
      })}
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="16"
        fontWeight="bold"
        fill={GILT_BRIGHT}
      >
        R{round}
      </text>
    </svg>
  );
}
