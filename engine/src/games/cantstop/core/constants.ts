// Rulebook-sourced constants for Can't Stop (reference_materials/CantStopRules.pdf). Kept in one
// place so the rules read off named values, not magic numbers.

/** The eleven columns, numbered by the sum of two dice (2–12). */
export const COLUMNS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * How many steps each column takes to reach the top (its winnable height). The middle columns are
 * tallest because 7 is the likeliest sum and 2/12 the rarest — the board's core risk/reward shape.
 * A player claims a column by moving a colored square onto its top space (height = won).
 */
export const COLUMN_HEIGHTS: Readonly<Record<number, number>> = {
  2: 3,
  3: 5,
  4: 7,
  5: 9,
  6: 11,
  7: 13,
  8: 11,
  9: 9,
  10: 7,
  11: 5,
  12: 3,
};

/** Win by claiming this many columns (rulebook "Winning": first to win any three columns). */
export const WIN_COLUMNS = 3;

/** Three temporary markers (the neutral "runners") per turn — at most three columns in play at once. */
export const MAX_RUNNERS = 3;

/** Four dice, rolled together and split into two pairs (rulebook "Playing" step 1). */
export const DICE_COUNT = 4;

/** A standard six-sided die. */
export const DIE_FACES = 6;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
