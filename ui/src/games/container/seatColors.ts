import type { PlayerView } from '@game-hub/engine/container';

/**
 * One seat-color source for the whole Container plugin (the Stone Age pattern): the board map's ship
 * hulls, the harbor quay tints on the chart, and the player mats' ribbons/rings all read from here so
 * they can never drift apart. `hull` is a hex (SVG fills + inline ribbon borders); the rest are
 * Tailwind classes and must stay literal strings so the build sees them.
 */
export const SEAT_COLORS = [
  { id: 'indigo', hull: '#4f46e5', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-500' },
  { id: 'teal', hull: '#0d9488', text: 'text-teal-600 dark:text-teal-400', ring: 'ring-teal-500' },
  { id: 'rose', hull: '#e11d48', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500' },
  { id: 'amber', hull: '#d97706', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500' },
  { id: 'violet', hull: '#7c3aed', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500' },
] as const;

export type SeatColor = (typeof SEAT_COLORS)[number];

const BY_ID = new Map<string, SeatColor>(SEAT_COLORS.map((color) => [color.id, color]));

/**
 * The tint for a seat: the colour the player *picked* (`colors[id]` → the matching palette entry), or
 * the seat-index colour when no pick is present. The fallback reproduces the old per-seat colouring, so
 * a default game looks exactly as it did before players could choose (matching the module's palette
 * order — `['indigo','teal','rose','amber','violet']`).
 */
export function seatColorOf(
  players: readonly PlayerView[],
  id: string,
  colors?: Readonly<Record<string, string>>,
): SeatColor {
  const picked = colors?.[id];
  if (picked !== undefined && BY_ID.has(picked)) return BY_ID.get(picked)!;
  const seat = players.findIndex((p) => p.id === id);
  return SEAT_COLORS[(seat < 0 ? 0 : seat) % SEAT_COLORS.length]!;
}
