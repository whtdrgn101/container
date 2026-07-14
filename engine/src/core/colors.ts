/**
 * The five container colors in Container (10th Anniversary Edition).
 * Confirmed from the rulebook scoring cards: white, red, green, blue, yellow.
 * (Orange / purple etc. are player colors, not container colors.)
 */
export const COLORS = ['white', 'red', 'green', 'blue', 'yellow'] as const;

export type Color = (typeof COLORS)[number];
