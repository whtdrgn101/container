/**
 * Russian Railroads — the rules objects ("The Permanent Way", RR9, comps rev 2). The pieces a player
 * actually manipulates: the five track materials, the locomotive, the factory tile, and the worker
 * meeple. Shapes here are the owner-approved comps — TrackChip and the SteamLoco silhouette are approved
 * verbatim / by structure; refine proportions only, keep the read.
 *
 * Colors are hardcoded — diegetic component art, no dark-mode re-theme (same rule as Stone Age's Scene).
 * A piece that carries data (a track material, a loco/factory number) is `role="img"` with a label; the
 * meeple, whose only meaning is its tinted fill, is decorative (`aria-hidden`) and takes meaning from the
 * text the integrator places beside it.
 */
import type { TrackColor } from '../../engine';

/** The visible name of each track material, for the chip's accessible label. */
const TRACK_LABEL: Record<TrackColor, string> = {
  wood: 'Wood',
  green: 'Green',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

/**
 * A track tile in one of the five materials (pg. 8–9), approved verbatim from the comps: a 22×24 rounded
 * chip with a material-specific detail (grain / boards / rivets / seam / bands). Authored to still read at
 * 16px. `size` sets the rendered width; height follows the 22:24 ratio.
 */
export function TrackChip({ color, size = 22, label }: { color: TrackColor; size?: number; label?: string }) {
  const height = (size * 24) / 22;
  return (
    <svg
      viewBox="0 0 22 24"
      width={size}
      height={height}
      role="img"
      aria-label={label ?? `${TRACK_LABEL[color]} track`}
      focusable="false"
    >
      {color === 'wood' && (
        <>
          <rect x="0.5" y="0.5" width="21" height="23" rx="3" fill="#b08e5c" />
          <g stroke="#8a6a40" strokeWidth="1" opacity="0.85">
            <path d="M3 6 h16 M3 12 h16 M3 18 h16" />
          </g>
        </>
      )}
      {color === 'green' && (
        <>
          <rect x="0.5" y="0.5" width="21" height="23" rx="3" fill="#5e8a52" />
          <g stroke="#486c3e" strokeWidth="1.1" opacity="0.9">
            <path d="M7.7 2 v20 M14.3 2 v20" />
          </g>
        </>
      )}
      {color === 'bronze' && (
        <>
          <rect x="0.5" y="0.5" width="21" height="23" rx="3" fill="#a5713c" />
          <g fill="#6d4a24">
            <circle cx="6" cy="6.5" r="1.5" />
            <circle cx="16" cy="6.5" r="1.5" />
            <circle cx="6" cy="17.5" r="1.5" />
            <circle cx="16" cy="17.5" r="1.5" />
          </g>
        </>
      )}
      {color === 'silver' && (
        <>
          <rect x="0.5" y="0.5" width="21" height="23" rx="3" fill="#c9ced6" />
          <path d="M11 1.5 v21" stroke="#9aa0a8" strokeWidth="1.4" />
          <g fill="#9aa0a8">
            <circle cx="6" cy="6.5" r="1.3" />
            <circle cx="16" cy="6.5" r="1.3" />
            <circle cx="6" cy="17.5" r="1.3" />
            <circle cx="16" cy="17.5" r="1.3" />
          </g>
        </>
      )}
      {color === 'gold' && (
        <>
          <rect x="0.5" y="0.5" width="21" height="23" rx="3" fill="#e8b93c" />
          <g stroke="#b8912f" strokeWidth="2" opacity="0.9">
            <path d="M2 8 h18 M2 16 h18" />
          </g>
        </>
      )}
    </svg>
  );
}

/**
 * The steam locomotive (pg. 10–11), the rev-2 owner-approved silhouette: a cab with a light-blue window,
 * a boiler with a rounded front, a flared smokestack, a steam dome, a cowcatcher wedge, and two large +
 * one small driving wheels joined by a connecting rod — iron on near-black wheels, a gold number on the
 * cab. Facing right. `number` is the loco's value; `size` sets the rendered width (aspect 40:28).
 */
export function SteamLoco({ number, size = 40, label }: { number: number; size?: number; label?: string }) {
  const height = (size * 28) / 40;
  return (
    <svg
      viewBox="0 0 40 28"
      width={size}
      height={height}
      role="img"
      aria-label={label ?? `Locomotive ${number}`}
      focusable="false"
    >
      {/* footplate / chassis */}
      <rect x="5" y="17.5" width="29" height="2" rx="0.6" fill="#2b2d32" />
      {/* boiler — a cylinder with a rounded front */}
      <path d="M13 8.5 H30 A5 5 0 0 1 30 18.5 H13 Z" fill="#2b2d32" />
      {/* cab */}
      <rect x="3" y="4.5" width="11" height="14" rx="1.2" fill="#2b2d32" />
      <rect x="5" y="6.5" width="7" height="5" rx="0.8" fill="#8fa3b5" />
      {/* steam dome */}
      <ellipse cx="20" cy="8" rx="2.3" ry="1.7" fill="#2b2d32" />
      {/* smokestack with a flared cap */}
      <rect x="25.4" y="3.4" width="3" height="5.4" fill="#2b2d32" />
      <path d="M24 2.2 H29.8 L28.4 3.6 H25.4 Z" fill="#2b2d32" />
      {/* cowcatcher wedge at the front */}
      <polygon points="30,13 37,18.6 30,18.6" fill="#2b2d32" />
      {/* driving wheels — iron rim on a near-black hub — with the connecting rod */}
      <line x1="17" y1="20.5" x2="25" y2="20.5" stroke="#4a4d53" strokeWidth="1.3" />
      <g>
        <circle cx="9" cy="20.5" r="2.4" fill="#17181c" stroke="#4a4d53" strokeWidth="1" />
        <circle cx="17" cy="20.5" r="3.6" fill="#17181c" stroke="#4a4d53" strokeWidth="1.2" />
        <circle cx="25" cy="20.5" r="3.6" fill="#17181c" stroke="#4a4d53" strokeWidth="1.2" />
        <circle cx="17" cy="20.5" r="0.9" fill="#6a6f78" />
        <circle cx="25" cy="20.5" r="0.9" fill="#6a6f78" />
      </g>
      {/* gold number plate on the cab */}
      <text
        x="8.5"
        y="15.2"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="6"
        fontWeight="bold"
        fill="#e8b93c"
      >
        {number}
      </text>
    </svg>
  );
}

/**
 * A factory tile (pg. 12) — the violet flip that fills an industry gap. `number` is the factory's value.
 * A simple rounded tile; `size` sets the rendered edge.
 */
export function FactoryTile({ number, size = 24, label }: { number: number; size?: number; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `Factory ${number}`}
      focusable="false"
    >
      <rect x="1.5" y="1.5" width="21" height="21" rx="3" fill="#8f7cc0" stroke="#6f5ca0" strokeWidth="1.4" />
      <text
        x="12"
        y="12.6"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="12"
        fontWeight="bold"
        fill="#2b2540"
      >
        {number}
      </text>
    </svg>
  );
}

/**
 * A worker meeple (pg. 7) — the rev-2 traditional silhouette. `fill` tints it: a seat colour for a normal
 * worker, turquoise for a temporary worker, a neutral for the supply. Decorative — its meaning is the
 * count/context the integrator renders beside it.
 */
export function Meeple({ fill = 'currentColor', className }: { fill?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill} aria-hidden focusable="false">
      <path d="M12 2.6 c-2.3 0 -3.7 1.6 -3.7 3.4 c0 1 .4 1.9 1 2.5 c-1.8 .8 -3.9 2.2 -5.6 3.4 c-1.3 1 -.6 3 1 3 h2.6 c-.6 2.2 -2 4.2 -3.4 5.8 c-.9 1.1 -.2 2.7 1.2 2.7 h4.4 c.9 0 1.6 -.6 1.9 -1.4 l.6 -1.7 .6 1.7 c.3 .8 1 1.4 1.9 1.4 h4.4 c1.4 0 2.1 -1.6 1.2 -2.7 c-1.4 -1.6 -2.8 -3.6 -3.4 -5.8 h2.6 c1.6 0 2.3 -2 1 -3 c-1.7 -1.2 -3.8 -2.6 -5.6 -3.4 c.6 -.6 1 -1.5 1 -2.5 c0 -1.8 -1.4 -3.4 -3.7 -3.4 z" />
    </svg>
  );
}
