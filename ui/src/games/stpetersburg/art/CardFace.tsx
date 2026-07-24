/**
 * A Saint Petersburg card face — the "Malachite & Gilt" overhaul (SP8, comps rev 2). Renders one card as
 * a single self-contained SVG: a kind-tinted header band carrying the name, an effective-cost badge
 * (with the printed cost struck through when a reduction applies — pg. 6/7 math the engine hands us via
 * `effectiveCost`), the green ware glyph (or the Czar's any-ware rosette), an abstract original vignette,
 * and the income/points marks a card scores with.
 *
 * Colors are hardcoded on purpose — a card is diegetic printed component art and does NOT re-theme in
 * dark mode (same rule as Container's Chart / Stone Age's Scene). The face carries a `<title>` for hover
 * and screen readers; it deliberately carries NO `data-testid` — the integrating Board owns testids.
 */
import type { Card, CardKind } from '@game-hub/engine/stpetersburg';
import { AnyWareRosette, CoinMark, ShieldMark, WareIcon } from './icons';

/** Authored geometry. The face scales by `width`, holding this 132:184 ratio. */
const W = 132;
const H = 184;

interface KindStyle {
  /** Card ground fill. */
  readonly ground: string;
  /** Card border stroke. */
  readonly border: string;
  /** Solid header-band fill (trading overrides with a tri-band). */
  readonly band: string;
  /** Dark cost-badge disc. */
  readonly badge: string;
}

const KIND: Record<CardKind, KindStyle> = {
  worker: { ground: '#f2f4ec', border: '#4e7a4e', band: '#5f8a5f', badge: '#2c3e2c' },
  building: { ground: '#f0f4f8', border: '#3f6a92', band: '#4a729c', badge: '#243a4e' },
  aristocrat: { ground: '#faf3e8', border: '#b4762e', band: '#c08137', badge: '#5e3d14' },
  trading: { ground: '#f4f0f4', border: '#8f5a86', band: '#8f5a86', badge: '#4b2f45' },
};

/**
 * The trading header's tri-band (green / blue / orange — the groups a trading card can upgrade), as
 * three STACKED horizontal strips per the approved comp (rev 2) — not side-by-side columns.
 */
const TRI = ['#5f8a5f', '#4a729c', '#c08137'] as const;

/** Rounded-top header outline (square bottom corners so it sits flush on the card ground). */
const HEADER_PATH = `M2 30 V11 Q2 2 11 2 H${W - 11} Q${W - 2} 2 ${W - 2} 11 V30 Z`;

/** An abstract, original vignette per kind (≤8 elements, tinted, low-opacity — varies by kind, not per card). */
function Vignette({ kind }: { kind: CardKind }) {
  switch (kind) {
    case 'worker': // a stand of pines — the lumber/field labour
      return (
        <g fill="#5f8a5f" opacity="0.16">
          <rect x="40" y="118" width="4" height="10" />
          <path d="M42 78 l14 40 h-28 z" />
          <rect x="86" y="120" width="4" height="10" />
          <path d="M88 88 l11 32 h-22 z" />
          <path d="M66 100 l9 26 h-18 z" opacity="0.7" />
        </g>
      );
    case 'building': // a rooftop skyline — the growing city
      return (
        <g fill="#3f6a92" opacity="0.16">
          <rect x="34" y="98" width="26" height="34" />
          <path d="M34 98 l13 -14 13 14 z" />
          <rect x="66" y="86" width="30" height="46" />
          <path d="M66 86 l15 -16 15 16 z" />
          <rect x="74" y="104" width="8" height="12" opacity="0.6" />
        </g>
      );
    case 'aristocrat': // a crown over a poised figure — the nobility
      return (
        <g fill="#c08137" opacity="0.18">
          <circle cx="66" cy="92" r="13" />
          <path d="M52 116 q14 -12 28 0 l0 18 h-28 z" />
          <path d="M50 72 l6 12 10 -16 10 16 6 -12 -3 20 h-26 z" />
        </g>
      );
    default: // trading — an upgrade arrow between two cards
      return (
        <g opacity="0.16">
          <rect x="30" y="92" width="26" height="36" rx="3" fill="#8f5a86" />
          <rect x="78" y="92" width="26" height="36" rx="3" fill="#8f5a86" />
          <path
            d="M58 110 h14 m0 0 l-5 -5 m5 5 l-5 5"
            stroke="#4b2f45"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
  }
}

export function CardFace({ card, effectiveCost, width = W }: { card: Card; effectiveCost?: number; width?: number }) {
  const style = KIND[card.kind];
  const shown = effectiveCost ?? card.cost;
  const reduced = effectiveCost !== undefined && effectiveCost !== card.cost;
  const height = (width * H) / W;
  const clipId = `spb-hdr-${card.id}`;
  const nameSize = card.name.length > 16 ? 10 : card.name.length > 12 ? 11.5 : 13;
  const title = `${card.name} — costs ${shown}${reduced ? ` (was ${card.cost})` : ''}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={width} height={height} role="img" aria-label={title} focusable="false">
      <title>{title}</title>

      {/* card ground + border */}
      <rect
        x="1.25"
        y="1.25"
        width={W - 2.5}
        height={H - 2.5}
        rx="9"
        fill={style.ground}
        stroke={style.border}
        strokeWidth="2.5"
      />

      {/* header band — solid, or a tri-band clipped to the rounded top for trading cards */}
      {card.kind === 'trading' ? (
        <>
          <clipPath id={clipId}>
            <path d={HEADER_PATH} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            {TRI.map((c, i) => (
              // A hair of overlap between strips avoids anti-aliased seams.
              <rect key={i} x="2" y={2 + (i * 28) / 3} width={W - 4} height={28 / 3 + 0.5} fill={c} />
            ))}
          </g>
        </>
      ) : (
        <path d={HEADER_PATH} fill={style.band} />
      )}

      {/* card name on the band — white with a thin dark stroke (paint-order) for tri-band legibility */}
      <text
        x={W / 2}
        y="20"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize={nameSize}
        fontWeight="bold"
        fill="#ffffff"
        stroke="#2b2b2b"
        strokeWidth="0.6"
        paintOrder="stroke"
      >
        {card.name}
      </text>

      {/* effective-cost badge, top-left */}
      <circle cx="22" cy="52" r="15" fill={style.badge} />
      <text
        x="22"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="16"
        fontWeight="bold"
        fill="#f4eeda"
      >
        {shown}
      </text>
      {reduced && (
        <g>
          <text
            x="44"
            y="52"
            dominantBaseline="central"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="12"
            fill={style.badge}
            opacity="0.85"
          >
            {card.cost}
          </text>
          <line
            x1="43"
            y1="52"
            x2={card.cost >= 10 ? 58 : 51}
            y2="52"
            stroke={style.badge}
            strokeWidth="1.4"
            opacity="0.85"
          />
        </g>
      )}

      {/* top-right: Czar rosette, else the green ware glyph */}
      {card.key === 'czarCarpenter' ? (
        <svg x={W - 40} y="38" width="28" height="28" overflow="visible">
          <AnyWareRosette className="h-full w-full" />
        </svg>
      ) : card.ware ? (
        <svg x={W - 40} y="38" width="28" height="28" overflow="visible">
          <WareIcon ware={card.ware} className="h-full w-full" />
        </svg>
      ) : null}

      {/* center vignette */}
      <Vignette kind={card.kind} />

      {/* bottom-right: income coin and/or points shield */}
      {card.income > 0 && (
        <g transform={`translate(${card.points > 0 ? W - 62 : W - 34} ${H - 34})`}>
          <CoinMark value={card.income} size={24} />
        </g>
      )}
      {card.points > 0 && (
        <g transform={`translate(${W - 34} ${H - 34})`}>
          <ShieldMark value={card.points} kind={card.kind} size={24} />
        </g>
      )}
    </svg>
  );
}
