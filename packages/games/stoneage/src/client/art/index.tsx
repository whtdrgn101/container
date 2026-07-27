/**
 * Original Stone-Age-flavoured SVG art (roadmap SA13). Simple, earthy, hand-drawn shapes — a prehistoric
 * palette of wood/clay/slate/gold and tribal silhouettes. **Deliberately original**, not a reproduction
 * of any published game's artwork; just the same *mood* (rock, bone, hide, campfire).
 */
import type { FixedPlaceId, Resource } from '../../engine';
import type { ReactNode } from 'react';

/** Earthy fills shared across the art. */
export const RESOURCE_FILL: Record<Resource, string> = {
  wood: '#8a5a2b',
  brick: '#c1502e',
  stone: '#8b8f96',
  gold: '#e0b64a',
};

/** A worker figure — a simple tribal silhouette, tinted to the player's colour. */
export function Meeple({ fill = 'currentColor', className }: { fill?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill={fill}>
      <circle cx="12" cy="5.5" r="3.6" />
      <path d="M12 9.5c-3.6 0-6.2 2.8-6.6 7.2-.15 1.7.2 3.3.9 5.3h3.1l.6-5.1.6 5.1h3.8l.6-5.1.6 5.1h3.1c.7-2 1.05-3.6.9-5.3-.4-4.4-3-7.2-6.6-7.2Z" />
    </svg>
  );
}

/** A resource nugget — wood log / clay brick / slate stone / gold, each a distinct little icon. */
export function ResourceIcon({ resource, className }: { resource: Resource; className?: string }) {
  const fill = RESOURCE_FILL[resource];
  switch (resource) {
    case 'wood':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect x="3" y="8" width="18" height="8" rx="4" fill={fill} />
          <ellipse cx="6" cy="12" rx="2.2" ry="3.6" fill="#6e451f" />
          <ellipse cx="6" cy="12" rx="1" ry="1.8" fill="#a9743f" />
        </svg>
      );
    case 'brick':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path d="M3 9l9-3 9 3-9 3z" fill="#d9693f" />
          <path d="M3 9v7l9 3v-7z" fill={fill} />
          <path d="M21 9v7l-9 3v-7z" fill="#a23e20" />
        </svg>
      );
    case 'stone':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path d="M5 15l3-7 6-2 5 4-1 7-8 2z" fill={fill} />
          <path d="M8 8l6-2-2 5-4 3z" fill="#a7abb2" />
        </svg>
      );
    default: // gold
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path d="M12 3l7 6-7 12L5 9z" fill={fill} />
          <path d="M12 3l7 6-7 3-7-3z" fill="#f2d27a" />
        </svg>
      );
  }
}

/** A thatched hut — the settlement icon (hut place, buildings). */
export function Hut({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 3L2 11h20z" fill="#a9743f" />
      <path d="M4 11h16v10H4z" fill="#c9a06a" />
      <path d="M10 14h4v7h-4z" fill="#6e451f" />
    </svg>
  );
}

/** A stack of spears / a chipped tool — the tool-maker + tool icon. */
export function ToolIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="10.5" y="4" width="3" height="16" rx="1.2" transform="rotate(-20 12 12)" fill="#8a5a2b" />
      <path d="M9 4l5 2-2 4-4-2z" transform="rotate(-20 12 12)" fill="#8b8f96" />
    </svg>
  );
}

/** Sheaves of grain — the field / farmer icon. */
export function FieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 21V8" stroke="#8a5a2b" strokeWidth="1.6" fill="none" />
      <path
        d="M12 8c-2-2-4-2-5-1 1 2 3 3 5 2Zm0 0c2-2 4-2 5-1-1 2-3 3-5 2Zm0 4c-2-2-4-2-5-1 1 2 3 3 5 2Zm0 0c2-2 4-2 5-1-1 2-3 3-5 2Z"
        fill="#d9a441"
      />
    </svg>
  );
}

/** A leaping deer — the hunting ground. */
export function HuntIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="#6e451f">
      <path d="M6 20l1-6-2-3 3 1 2-3 4 1 3-3 1 3-2 3 1 7h-2l-1-5-3 1-1 4H9l1-5-2 1-1 4z" />
      <path d="M17 5l1-3 1 3-1 1zM15 5l-1-3-1 3 1 1z" />
    </svg>
  );
}

/** A meat joint + growing stalk — food in hand (replaces the 🍖 emoji). */
export function FoodIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <ellipse cx="9" cy="10" rx="6" ry="4.6" transform="rotate(-30 9 10)" fill="#b3552b" />
      <rect x="11" y="12.5" width="8" height="2.4" rx="1.2" transform="rotate(-30 15 13.7)" fill="#e9dcc0" />
      <circle cx="19.2" cy="9.4" r="1.6" fill="#e9dcc0" />
    </svg>
  );
}

/** A face-down card stack — held civilization cards (replaces the 🃏 emoji). */
export function CardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="7" y="4" width="11" height="15" rx="1.6" transform="rotate(8 12.5 11.5)" fill="#8a9a5b" />
      <rect x="5" y="5" width="11" height="15" rx="1.6" fill="#a9b878" />
      <path d="M8 9h5M8 12h5M8 15h3" stroke="#5f6f3a" strokeWidth="1.1" />
    </svg>
  );
}

/**
 * The eight green culture symbols (final scoring counts distinct symbols, squared — pg. 8). Original
 * pictographs on the 24×24 grid, `currentColor` so they tint with their context (green card face,
 * player-panel collection slots).
 */
export const SYMBOL_ICON: Record<string, (props: { className?: string }) => ReactNode> = {
  writing: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" fill="currentColor" opacity="0.3" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  ),
  pottery: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M8 4h8l-1.5 3c2.5 1.5 4 4 4 7 0 4-3.5 6-6.5 6S5.5 18 5.5 14c0-3 1.5-5.5 4-7Z" />
      <path d="M7.5 12h9" stroke="#f6efe0" strokeWidth="1.2" opacity="0.7" />
    </svg>
  ),
  art: ({ className }) => (
    // A hand stencil — the cave-wall signature.
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <ellipse cx="12" cy="15" rx="4" ry="5" />
      <rect x="8.6" y="5" width="1.9" height="6" rx="0.9" />
      <rect x="11.1" y="3.6" width="1.9" height="7" rx="0.9" />
      <rect x="13.6" y="4.2" width="1.9" height="6.4" rx="0.9" />
      <rect x="16" y="6.5" width="1.7" height="5" rx="0.85" transform="rotate(-30 17 9)" />
      <rect x="5.8" y="7.5" width="1.7" height="4.6" rx="0.85" transform="rotate(28 6.6 9.8)" />
    </svg>
  ),
  music: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="4" y="10" width="16" height="3.6" rx="1.8" transform="rotate(-24 12 12)" fill="currentColor" />
      <g fill="#f6efe0" opacity="0.8">
        <circle cx="9" cy="13.2" r="0.8" />
        <circle cx="12" cy="11.9" r="0.8" />
        <circle cx="15" cy="10.6" r="0.8" />
      </g>
    </svg>
  ),
  medicine: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 21c-4-3-6-6.5-6-10 0-3.5 2.5-7 6-8 3.5 1 6 4.5 6 8 0 3.5-2 7-6 10Z" fill="currentColor" />
      <path d="M12 5v14M8.5 10c2 1.6 5 1.6 7 0" stroke="#f6efe0" strokeWidth="1.1" opacity="0.75" fill="none" />
    </svg>
  ),
  weaving: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <g stroke="currentColor" strokeWidth="1.7">
        <path d="M5 5v14M9.7 5v14M14.4 5v14M19 5v14" />
      </g>
      <g stroke="currentColor" strokeWidth="1.4" opacity="0.6">
        <path d="M4 8.5h16M4 13h16M4 17.5h16" />
      </g>
    </svg>
  ),
  transport: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M3 13c3 3 15 3 18 0l-2.5 5.5c-4 1.6-9 1.6-13 0Z" />
      <path d="M15 5l-2 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <ellipse cx="15.6" cy="4.6" rx="1.7" ry="1" transform="rotate(28 15.6 4.6)" />
    </svg>
  ),
  timekeeping: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M19 5l-2 2M5 19l2-2M19 19l-2-2" />
      </g>
    </svg>
  ),
};

/** The prehistoric emblem for each of the eight board places. */
export const PLACE_ICON: Record<FixedPlaceId, (props: { className?: string }) => ReactNode> = {
  toolMaker: ToolIcon,
  hut: Hut,
  field: FieldIcon,
  hunt: HuntIcon,
  forest: (p) => <ResourceIcon resource="wood" {...p} />,
  clayPit: (p) => <ResourceIcon resource="brick" {...p} />,
  quarry: (p) => <ResourceIcon resource="stone" {...p} />,
  river: (p) => <ResourceIcon resource="gold" {...p} />,
};
