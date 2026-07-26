/**
 * Russian Railroads — the glyph set ("The Permanent Way", RR9, comps rev 2). The small marks the panels
 * and card faces hang off: keys, the industry wrench, doubler clocks, bonus stars, the reached-special
 * signal lamp, idea bulbs, and coins. All sit on the repo's 24×24 icon grid.
 *
 * Colors are hardcoded — diegetic component art, no dark-mode re-theme (same rule as Stone Age's Scene
 * and Saint Petersburg's icons). Iron chrome throughout. A glyph that merely decorates text is
 * `aria-hidden`; one that carries state or a value on its own (the signal lamp, a numbered coin) is
 * `role="img"` with a label.
 */

/** The three states of a reached-special signal (the comp's "specials as station lamps"). */
export type SignalState = 'lit' | 'red' | 'unlit';

/** A key (pg. 19) — a ringed bow with a toothed bit. `fill` defaults to the iron family. Decorative. */
export function KeyIcon({ fill = '#5b5e66', className }: { fill?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <circle cx="7" cy="12" r="4.4" fill="none" stroke={fill} strokeWidth="2.4" />
      <rect x="10.5" y="10.8" width="10.5" height="2.4" fill={fill} />
      <rect x="18" y="13.2" width="1.8" height="2.8" fill={fill} />
      <rect x="20.4" y="13.2" width="1.6" height="3.6" fill={fill} />
    </svg>
  );
}

/** The industry wrench (pg. 13) — an original spanner silhouette. `fill` defaults to iron. Decorative. */
export function WrenchIcon({ fill = '#5b5e66', className }: { fill?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"
        fill={fill}
      />
    </svg>
  );
}

/**
 * A doubler (pg. 14) drawn as a station clock — a pale face in an iron ring bearing a ×2. Carries the ×2
 * on its own, so it is labelled.
 */
export function DoublerClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Doubler (×2)" focusable="false">
      <circle cx="12" cy="12" r="10" fill="#e8e2d4" stroke="#4a4d53" strokeWidth="2" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#4a4d53" strokeWidth="0.6" opacity="0.5" />
      <text
        x="12"
        y="12.6"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="9"
        fontWeight="bold"
        fill="#3a3d32"
      >
        ×2
      </text>
    </svg>
  );
}

/** A bonus star (pg. 22) — a gold five-pointer. `fill` defaults to gold. Decorative. */
export function BonusStar({ fill = '#e8b93c', className }: { fill?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M12 2.2 l2.75 6.05 6.6 .7 -4.9 4.45 1.35 6.5 -5.8 -3.3 -5.8 3.3 1.35 -6.5 -4.9 -4.45 6.6 -.7 z"
        fill={fill}
        stroke="#b8912f"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Lens fill + glow per signal state. */
const SIGNAL_LENS: Record<SignalState, { lens: string; glow: string }> = {
  lit: { lens: '#e8b93c', glow: '#f4d67e' },
  red: { lens: '#c0442f', glow: '#e07a66' },
  unlit: { lens: '#3a3d43', glow: '#3a3d43' },
};

/**
 * A railway signal lamp for a reached (or blocked / unreached) special — the comp's "specials as station
 * lamps": gold when lit, red when blocked, dark when unreached. Carries state on its own, so it is
 * labelled.
 */
export function SignalLamp({ state, className }: { state: SignalState; className?: string }) {
  const { lens, glow } = SIGNAL_LENS[state];
  const lit = state !== 'unlit';
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={`Signal ${state}`} focusable="false">
      {/* post + base */}
      <rect x="11" y="12" width="2" height="9" fill="#4a4d53" />
      <rect x="8" y="20.5" width="8" height="2" rx="0.6" fill="#4a4d53" />
      {/* lamp housing */}
      <rect x="6.5" y="2.5" width="11" height="11" rx="3" fill="#2b2d32" />
      {lit && <circle cx="12" cy="8" r="5.4" fill={glow} opacity="0.35" />}
      <circle cx="12" cy="8" r="3.4" fill={lens} stroke="#17181c" strokeWidth="0.8" />
    </svg>
  );
}

/** An idea bulb (pp. 18–19, 46) — a warm glass bulb on an iron base. Decorative. */
export function IdeaBulb({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M12 2.5 a7 7 0 0 0 -4 12.7 V17 h8 V15.2 A7 7 0 0 0 12 2.5 z"
        fill="#f2d27a"
        stroke="#b8912f"
        strokeWidth="0.8"
      />
      <path
        d="M10 8 l2 3 2 -3"
        fill="none"
        stroke="#b8912f"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="8.5" y="17.5" width="7" height="2" rx="0.6" fill="#8a6a1d" />
      <rect x="9.5" y="20" width="5" height="1.8" rx="0.6" fill="#8a6a1d" />
    </svg>
  );
}

/**
 * A struck gold coin (pg. 7) — the established gold-coin look. With a `value` it bears the numeral and is
 * labelled; without, it is a decorative coin. `size` sets the rendered edge.
 */
export function CoinIcon({ value, size = 24, className }: { value?: number; size?: number; className?: string }) {
  const labelled = value !== undefined;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      {...(labelled ? { role: 'img', 'aria-label': `${value} coins` } : { 'aria-hidden': true })}
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" fill="#e8b93c" stroke="#8a6a1d" strokeWidth="2" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#8a6a1d" strokeWidth="0.6" opacity="0.55" />
      {labelled ? (
        <text
          x="12"
          y="12.6"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="11"
          fontWeight="bold"
          fill="#5c4512"
        >
          {value}
        </text>
      ) : null}
    </svg>
  );
}
