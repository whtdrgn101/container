import type { PlayerView } from '../engine';

/**
 * Seat colours for the worker **meeples** and turn-order **pawns** on Russian Railroads' diegetic board art
 * ("The Permanent Way", RR9). These are hardcoded hex values on purpose: the meeples sit *on* the printed
 * board and must not re-theme in dark mode (the same rule as the art primitives). The chrome around the
 * board keeps semantic Tailwind tokens.
 *
 * A seat's colour is the one it picked (the cross-game `colors` prop, playerId → palette id), falling back
 * to a seat-index default so an un-picked game still shows four distinct workers — the same fallback the
 * other games use.
 */

/** Palette id → meeple hex. Covers the shell's seat palettes; unknown ids fall through to the seat default. */
const PALETTE_HEX: Readonly<Record<string, string>> = {
  red: '#c0442f',
  blue: '#3b7cc4',
  green: '#4f9d5a',
  yellow: '#d9a72e',
  rose: '#c0446e',
  sky: '#3b9cc4',
  amber: '#d98a2e',
  emerald: '#3fa06a',
};

/** Seat-index fallback order (when no colour was picked) — four distinct, board-legible tints. */
const SEAT_ORDER: readonly string[] = ['#c0442f', '#3b7cc4', '#4f9d5a', '#d9a72e'];

/** The turquoise of a temporary worker (pg. 15) — one shared tint, not a seat colour. */
export const TEMP_WORKER_HEX = '#2bb3a3';

/** Build a `playerId → meeple hex` resolver from the seat list and the picked-colours map. */
export function makeSeatHex(
  players: readonly PlayerView[],
  colors: Readonly<Record<string, string>>,
): (playerId: string) => string {
  return (playerId: string): string => {
    const picked = colors[playerId];
    if (picked !== undefined && PALETTE_HEX[picked]) return PALETTE_HEX[picked]!;
    const seat = players.findIndex((p) => p.id === playerId);
    return SEAT_ORDER[(seat < 0 ? 0 : seat) % SEAT_ORDER.length]!;
  };
}
