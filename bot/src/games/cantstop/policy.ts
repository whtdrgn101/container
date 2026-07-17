import { COLUMN_HEIGHTS, DIE_FACES, WIN_COLUMNS, legalSelections } from '@game-hub/engine/cantstop';
import type { CantStopState } from '@game-hub/engine/cantstop';

/**
 * The Can't Stop bot's opinions — a pure risk model. Can't Stop has no hidden information, so unlike
 * Container there is nothing to estimate about opponents: every decision is a straight expected-value
 * bet on the dice. The weights below are heuristic and tunable (that's why the bot's coverage gate is
 * 90%, not 100%); what must hold is that every decision is legal and self-play always terminates.
 */

/** Expected columns a *successful* roll advances (≈1–2). Tunable — the stop/continue EV pivots on it. */
const EXPECTED_ADVANCE = 1.75;
/** A step that reaches a column's top (a claim) is worth much more than a raw step toward one. */
const CLAIM_BONUS = 4;

const activeProgress = (state: CantStopState): Readonly<Record<number, number>> =>
  state.players[state.activePlayerIndex]!.progress;

const runnerColumns = (state: CantStopState): number[] => Object.keys(state.runners).map(Number);

/** How many columns the active seat has already claimed. */
function claimedByActive(state: CantStopState): number {
  const me = state.players[state.activePlayerIndex]!.id;
  return Object.values(state.claimed).filter((id) => id === me).length;
}

/** Columns a runner sits atop right now — the claims the active seat would lock in by stopping. */
function claimsIfStopped(state: CantStopState): number {
  return runnerColumns(state).filter((col) => state.runners[col] === COLUMN_HEIGHTS[col]!).length;
}

/** Steps gained this turn (lost on a bust): each runner's height above the square already banked there. */
export function turnProgress(state: CantStopState): number {
  const progress = activeProgress(state);
  return runnerColumns(state).reduce((sum, col) => sum + state.runners[col]! - (progress[col] ?? 0), 0);
}

/**
 * The exact probability that the next roll advances nothing (a **bust**), given the current runners,
 * claims and marker budget. Computed by trying all `6^4` dice outcomes against the engine's own
 * `legalSelections` — so the bot's risk model can never disagree with the rules about what's playable.
 */
export function bustProbability(state: CantStopState): number {
  let bust = 0;
  for (let a = 1; a <= DIE_FACES; a += 1) {
    for (let b = 1; b <= DIE_FACES; b += 1) {
      for (let c = 1; c <= DIE_FACES; c += 1) {
        for (let d = 1; d <= DIE_FACES; d += 1) {
          if (legalSelections({ ...state, dice: [a, b, c, d] }).length === 0) bust += 1;
        }
      }
    }
  }
  return bust / DIE_FACES ** 4;
}

/**
 * Whether the active bot should roll again (vs. stop and bank). Returns `true` in the rolling phase
 * when the expected value of another roll is positive:
 * - With no runners out you *must* roll (stopping is illegal) — so `true`.
 * - If stopping now would claim your third column, take the win — `false`.
 * - Otherwise roll while `(1−p)·EXPECTED_ADVANCE > p·(steps at risk)`: push while the likely gain beats
 *   the chance-weighted loss of the whole turn's progress. `p = 0` (a free roll) always rolls.
 */
export function shouldRoll(state: CantStopState): boolean {
  if (runnerColumns(state).length === 0) return true;
  if (claimedByActive(state) + claimsIfStopped(state) >= WIN_COLUMNS) return false;

  const p = bustProbability(state);
  if (p === 0) return true;
  return (1 - p) * EXPECTED_ADVANCE > p * turnProgress(state);
}

/** How central a column is (7 is likeliest); a small bonus for advancing columns that come up often. */
const centrality = (col: number): number => (DIE_FACES - Math.abs(7 - col)) * 0.1;

/**
 * Heuristic value of advancing `columns` (one SELECT option). Each step is worth more the closer it
 * brings a column to its top; completing a column earns the claim bonus; central columns get a nudge
 * because they're safer to hold and likelier to be advanceable next roll. Doubles naturally outscore
 * singles by advancing twice.
 */
export function scorePairing(state: CantStopState, columns: readonly number[]): number {
  const progress = activeProgress(state);
  // Track heights within this option so a double ([x, x]) scores its two steps independently.
  const heights: Record<number, number> = {};
  let score = 0;
  for (const col of columns) {
    const height = COLUMN_HEIGHTS[col]!;
    const base = heights[col] ?? state.runners[col] ?? progress[col] ?? 0;
    const next = base + 1;
    heights[col] = next;
    score += 1 + next / height + centrality(col);
    if (next === height) score += CLAIM_BONUS;
  }
  return score;
}

/** The highest-scoring legal pairing for the dice on the table. Assumes the selecting phase (non-empty). */
export function pickPairing(state: CantStopState): number[] {
  const options = legalSelections(state);
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const option of options) {
    const score = scorePairing(state, option);
    // Strictly greater keeps the first-listed option on ties, so decisions stay deterministic.
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}
