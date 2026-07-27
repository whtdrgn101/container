import { COLUMN_HEIGHTS, MAX_RUNNERS } from '../core';
import type { CantStopState } from '../core';
import { activePlayer } from './players';

type Runners = Readonly<Record<number, number>>;
type Progress = Readonly<Record<number, number>>;
type Claimed = Readonly<Record<number, string>>;

const runnerCount = (runners: Runners): number => Object.keys(runners).length;

/** The three ways to split four dice into two pairs, each summed into a column number (rules step 1). */
export function splitSums(dice: readonly [number, number, number, number]): Array<readonly [number, number]> {
  const [a, b, c, d] = dice;
  return [
    [a + b, c + d],
    [a + c, b + d],
    [a + d, b + c],
  ];
}

/**
 * Can a runner be advanced one step in `col` right now? Three ways to fail: the column is already
 * won (claimed), an existing runner is already at the top, or the column is new and all three markers
 * are already out (rules "Placing a Marker" + "Blowing It").
 */
function canAdvance(runners: Runners, claimed: Claimed, col: number): boolean {
  if (claimed[col] !== undefined) return false;
  const runner = runners[col];
  if (runner !== undefined) return runner < COLUMN_HEIGHTS[col]!;
  return runnerCount(runners) < MAX_RUNNERS;
}

/** Advance one step in `col`: bump an existing runner, or drop a new one just above the square there. */
function advanceOne(runners: Runners, progress: Progress, col: number): Runners {
  const base = runners[col] ?? progress[col] ?? 0;
  return { ...runners, [col]: base + 1 };
}

/**
 * The legal advancement outcomes for one split's two sums, as the multiset of columns to advance.
 *
 * Encodes the two rules that make placement a real decision: **if you can advance both, you must**
 * (so a two-column outcome hides the single-column ones), and you only get a choice when the marker
 * budget forces it — two new columns but one marker left. Doubles advance the one column up to twice
 * with no choice (rules example: "place the third marker two spaces up in the 7 column").
 */
function optionsForPair(runners: Runners, progress: Progress, claimed: Claimed, x: number, y: number): number[][] {
  if (x === y) {
    let working = runners;
    const advanced: number[] = [];
    for (let step = 0; step < 2; step += 1) {
      if (canAdvance(working, claimed, x)) {
        working = advanceOne(working, progress, x);
        advanced.push(x);
      }
    }
    return advanced.length > 0 ? [advanced] : [];
  }

  const canX = canAdvance(runners, claimed, x);
  const afterX = canX ? advanceOne(runners, progress, x) : runners;
  // Advancing x first is enough to test "both": for distinct columns only the marker budget can make
  // the pair infeasible, and that is symmetric in x and y.
  if (canX && canAdvance(afterX, claimed, y)) return [[x, y]];

  const options: number[][] = [];
  if (canX) options.push([x]);
  if (canAdvance(runners, claimed, y)) options.push([y]);
  return options;
}

const keyOf = (columns: readonly number[]): string => [...columns].sort((a, b) => a - b).join(',');

/**
 * Every legal SELECT for the dice currently on the table, as a sorted, de-duplicated list of
 * column-multisets. Empty ⇒ the roll is a bust (no split can advance anything). Two splits that yield
 * the same sums (e.g. a repeated die) collapse to one option.
 */
export function legalSelections(state: CantStopState): number[][] {
  if (state.dice === null) return [];
  const progress = activePlayer(state).progress;
  const seen = new Set<string>();
  const options: number[][] = [];
  for (const [x, y] of splitSums(state.dice)) {
    for (const option of optionsForPair(state.runners, progress, state.claimed, x, y)) {
      const sorted = [...option].sort((a, b) => a - b);
      const key = keyOf(sorted);
      if (!seen.has(key)) {
        seen.add(key);
        options.push(sorted);
      }
    }
  }
  return options;
}

/** Whether `columns` is one of the legal selections for the current dice (by unordered comparison). */
export function isLegalSelection(state: CantStopState, columns: readonly number[]): boolean {
  const target = keyOf(columns);
  return legalSelections(state).some((option) => keyOf(option) === target);
}

/** Apply a validated selection to the runners, advancing each listed column once (doubles appear twice). */
export function applySelection(runners: Runners, progress: Progress, columns: readonly number[]): Runners {
  let working = runners;
  for (const col of columns) {
    working = advanceOne(working, progress, col);
  }
  return working;
}
