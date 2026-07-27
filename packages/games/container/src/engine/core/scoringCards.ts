import type { ScoringCard } from './types';

/**
 * The five final scoring cards (rulebook: "5 Final Scoring Cards"). Each assigns the five colors to
 * the value slots $10 / two-value / $6 / $4 / $2 (the two-value color's base is $5, and it becomes
 * $10 at game end if you collected at least one of every color).
 *
 * `sc1` matches the rulebook's Final Scoring Example (pg. 19). The remaining four keep the same value
 * structure with rotated color assignments.
 * TODO(verify): confirm the exact color→slot layout of all five cards against the physical components.
 */
export const SCORING_CARDS: readonly ScoringCard[] = [
  { id: 'sc1', twoValueColor: 'green', values: { white: 10, green: 5, red: 6, blue: 4, yellow: 2 } },
  { id: 'sc2', twoValueColor: 'red', values: { green: 10, red: 5, blue: 6, yellow: 4, white: 2 } },
  { id: 'sc3', twoValueColor: 'blue', values: { red: 10, blue: 5, yellow: 6, white: 4, green: 2 } },
  { id: 'sc4', twoValueColor: 'yellow', values: { blue: 10, yellow: 5, white: 6, green: 4, red: 2 } },
  { id: 'sc5', twoValueColor: 'white', values: { yellow: 10, white: 5, green: 6, red: 4, blue: 2 } },
];
