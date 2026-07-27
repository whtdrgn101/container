import { COLUMNS, COLUMN_HEIGHTS, DIE_FACES, WIN_COLUMNS, legalSelections } from '../engine';
import type { CantStopState } from '../engine';

/**
 * The Can't Stop bot's opinions — a pure risk model. Can't Stop has no hidden information, so unlike
 * Container there is nothing to estimate about opponents: every decision is a straight expected-value
 * bet on the dice. The weights below are heuristic and tunable (that's why the bot's coverage gate is
 * 90%, not 100%); what must hold is that every decision is legal and self-play always terminates.
 *
 * ## Difficulty tiers (CS4)
 *
 * The owner's ask — "scale difficulty on probability levels, don't replace the model" — so a tier is a
 * **parameter set over this same exact-probability machinery** (`DifficultyParams`), never a different
 * algorithm:
 * - **normal** — the frozen baseline (`NORMAL`). Every `shouldRoll`/`pickPairing`/`scorePairing` call
 *   with no params defaults to it, so self-play and the strength baselines stay **byte-identical**.
 * - **easy** — risk-shy: a hard `stopThreshold` banks as soon as bust probability crosses it *even when
 *   EV says roll on*, and a lower `expectedAdvance` values pushing less. It visibly banks early.
 * - **hard** — the full EV rule plus endgame urgency: `urgencyBoost` scales both the roll-on incentive
 *   and the claim bonus when a public-state read says an opponent is racing to their third column.
 */

/** Which parameter set a Can't Stop bot plays by. `decide` defaults to `'normal'`. */
export type CantStopDifficulty = 'easy' | 'normal' | 'hard';

/** The knobs a difficulty tier turns — all over the same bust-probability EV model, never replacing it. */
export interface DifficultyParams {
  /** Expected columns a *successful* roll advances (≈1–2). Lower = more risk-shy (values progress less). */
  readonly expectedAdvance: number;
  /** Value of topping a column (a claim) relative to a raw step toward one. */
  readonly claimBonus: number;
  /** Force a stop as soon as bust probability exceeds this, even when EV says roll on. Omit = never. */
  readonly stopThreshold?: number;
  /**
   * Per-threat-level multiplier applied to `expectedAdvance` (the roll-on incentive) and `claimBonus`
   * (the pairing preference) when an opponent is racing to a third column. Omit = ignore the race — the
   * bot never reads opponent pressure at all, which is what keeps `normal` byte-identical to the
   * pre-CS4 policy. See `opponentThreat` for the 0/1/2 levels.
   */
  readonly urgencyBoost?: number;
}

/** The frozen pre-CS4 policy. `EXPECTED_ADVANCE = 1.75`, `CLAIM_BONUS = 4` — do not retune. */
const NORMAL: DifficultyParams = { expectedAdvance: 1.75, claimBonus: 4 };
/** Risk-shy and human-beatable: banks early (`stopThreshold`) and values pushing less (`expectedAdvance`). */
const EASY: DifficultyParams = { expectedAdvance: 1.15, claimBonus: 4, stopThreshold: 0.28 };
/** The EV rule, plus endgame urgency: tolerate more bust risk and chase claims once an opponent is racing. */
const HARD: DifficultyParams = { expectedAdvance: 1.75, claimBonus: 4, urgencyBoost: 0.7 };

/** The tier lookup `decide` maps a `CantStopDifficulty` through. */
export const DIFFICULTIES: Readonly<Record<CantStopDifficulty, DifficultyParams>> = {
  easy: EASY,
  normal: NORMAL,
  hard: HARD,
};

const activeProgress = (state: CantStopState): Readonly<Record<number, number>> =>
  state.players[state.activePlayerIndex]!.progress;

const runnerColumns = (state: CantStopState): number[] => Object.keys(state.runners).map(Number);

/** How many columns a given seat has already claimed. */
function claimsBy(state: CantStopState, playerId: string): number {
  return Object.values(state.claimed).filter((id) => id === playerId).length;
}

/** How many columns the active seat has already claimed. */
function claimedByActive(state: CantStopState): number {
  return claimsBy(state, state.players[state.activePlayerIndex]!.id);
}

/** Columns a runner sits atop right now — the claims the active seat would lock in by stopping. */
function claimsIfStopped(state: CantStopState): number {
  return runnerColumns(state).filter((col) => state.runners[col] === COLUMN_HEIGHTS[col]!).length;
}

/**
 * How urgent the endgame is, read from public state (0 = no pressure). Fires for **any** seat one
 * claim from winning — the opponent the `hard` bot must race, *and* the bot itself when it's the one
 * about to close the game out (push to top a runner rather than bank two claims and stall):
 * - **1** — some seat is one claim from winning (already holds `WIN_COLUMNS − 1`).
 * - **2** — that seat is also within two banked steps of a third column's top, so a single good turn
 *   could end the game — the point at which racing pays for the extra bust risk.
 *
 * Only ever consulted for a tier with an `urgencyBoost` (i.e. `hard`); `normal`/`easy` never read the
 * race at all, which is what keeps them byte-identical to the pre-CS4 policy.
 */
function endgameUrgency(state: CantStopState): number {
  const active = state.players[state.activePlayerIndex]!.id;
  let level = 0;
  for (const player of state.players) {
    if (claimsBy(state, player.id) < WIN_COLUMNS - 1) continue;
    level = Math.max(level, 1);
    const nearThird = COLUMNS.some((col) => {
      if (state.claimed[col] !== undefined) return false;
      const banked = player.progress[col] ?? 0;
      // The active seat's live runners count too: a marker near a would-be third column's top means
      // "push to finish it this turn", not "bank two claims and stall a step short".
      const at = player.id === active ? Math.max(banked, state.runners[col] ?? 0) : banked;
      return at > 0 && COLUMN_HEIGHTS[col]! - at <= 2;
    });
    if (nearThird) level = Math.max(level, 2);
  }
  return level;
}

/**
 * The multiplier a racing tier applies to its incentives. `1` for any tier without an `urgencyBoost`
 * (so `normal`/`easy` are unaffected and stay byte-identical to the pre-tier policy).
 */
function raceUrgency(state: CantStopState, params: DifficultyParams): number {
  if (params.urgencyBoost === undefined) return 1;
  return 1 + params.urgencyBoost * endgameUrgency(state);
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
 * Whether the active bot should roll again (vs. stop and bank) under a difficulty's `params`. Returns
 * `true` in the rolling phase when the expected value of another roll is positive:
 * - With no runners out you *must* roll (stopping is illegal) — so `true`.
 * - If stopping now would claim your third column, take the win — `false`.
 * - `p = 0` (a free roll) always rolls.
 * - An `easy` tier banks the moment bust probability crosses `stopThreshold`, even when EV says roll.
 * - Otherwise roll while `(1−p)·advance > p·(steps at risk)`, where `advance` is `expectedAdvance`
 *   scaled by `raceUrgency` (>1 only for a racing `hard` bot): push while the likely gain beats the
 *   chance-weighted loss of the whole turn's progress.
 *
 * Defaults to the frozen `NORMAL` params, so every pre-CS4 call site is unchanged.
 */
export function shouldRoll(state: CantStopState, params: DifficultyParams = NORMAL): boolean {
  if (runnerColumns(state).length === 0) return true;
  if (claimedByActive(state) + claimsIfStopped(state) >= WIN_COLUMNS) return false;

  const p = bustProbability(state);
  if (p === 0) return true;
  if (params.stopThreshold !== undefined && p > params.stopThreshold) return false;
  const advance = params.expectedAdvance * raceUrgency(state, params);
  return (1 - p) * advance > p * turnProgress(state);
}

/** How central a column is (7 is likeliest); a small bonus for advancing columns that come up often. */
const centrality = (col: number): number => (DIE_FACES - Math.abs(7 - col)) * 0.1;

/**
 * Heuristic value of advancing `columns` (one SELECT option) under a difficulty's `params`. Each step
 * is worth more the closer it brings a column to its top; completing a column earns the claim bonus
 * (scaled up by `raceUrgency`, so a racing `hard` bot prefers pairings that complete columns); central
 * columns get a nudge because they're safer to hold and likelier to be advanceable next roll. Doubles
 * naturally outscore singles by advancing twice. Defaults to `NORMAL`, so pre-CS4 calls are unchanged.
 */
export function scorePairing(
  state: CantStopState,
  columns: readonly number[],
  params: DifficultyParams = NORMAL,
): number {
  const progress = activeProgress(state);
  const claimBonus = params.claimBonus * raceUrgency(state, params);
  // Track heights within this option so a double ([x, x]) scores its two steps independently.
  const heights: Record<number, number> = {};
  let score = 0;
  for (const col of columns) {
    const height = COLUMN_HEIGHTS[col]!;
    const base = heights[col] ?? state.runners[col] ?? progress[col] ?? 0;
    const next = base + 1;
    heights[col] = next;
    score += 1 + next / height + centrality(col);
    if (next === height) score += claimBonus;
  }
  return score;
}

/**
 * The highest-scoring legal pairing for the dice on the table, under a difficulty's `params`. Assumes
 * the selecting phase (non-empty). Defaults to `NORMAL`, so pre-CS4 calls are unchanged.
 */
export function pickPairing(state: CantStopState, params: DifficultyParams = NORMAL): number[] {
  const options = legalSelections(state);
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const option of options) {
    const score = scorePairing(state, option, params);
    // Strictly greater keeps the first-listed option on ties, so decisions stay deterministic.
    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}
