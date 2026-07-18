/**
 * Original Stone-Age-flavoured SVG art (roadmap SA13). Simple, earthy, hand-drawn shapes — a prehistoric
 * palette of wood/clay/slate/gold and tribal silhouettes. **Deliberately original**, not a reproduction
 * of any published game's artwork; just the same *mood* (rock, bone, hide, campfire).
 */
import type { FixedPlaceId, Resource } from '@game-hub/engine/stoneage';
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
      <path d="M12 8c-2-2-4-2-5-1 1 2 3 3 5 2Zm0 0c2-2 4-2 5-1-1 2-3 3-5 2Zm0 4c-2-2-4-2-5-1 1 2 3 3 5 2Zm0 0c2-2 4-2 5-1-1 2-3 3-5 2Z" fill="#d9a441" />
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
