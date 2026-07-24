// The engineer catalog (rulebook pg. 5, 15–16). Read the cited page before touching a value.
//
// Russian Railroads ships **14 engineers numbered 2–15**. At setup they are sorted into two lettered
// stacks (A and B) plus **one engineer with no letter**, which goes onto its idea card with a coin
// (pg. 5). The lettered stacks are each shuffled; the strip is then dealt from them (see `internal/setup`).
//
// RR1 needs the **counts and deal structure**, not the engineers' real powers — those land in RR7. So
// each engineer carries only a stable id, its printed number (the RR8 engineer-majority tiebreak reads
// it), the stack it belongs to, and a **placeholder** action id. The A/B split below is a documented
// adaptation: the real per-engineer letters are a component read deferred to RR7, but the *totals* (one
// letterless, the rest split so ≥4 B and ≥3 A can be dealt at 4 players) are correct and asserted in the
// setup tests.

/**
 * A placeholder for an engineer's private reusable action (pg. 15–16). RR7 replaces this with the real
 * per-engineer action enum; RR1 only needs the strip populated, so every engineer carries the stub.
 */
export type EngineerAction = 'placeholder';

/** Which shuffled stack an engineer belongs to. `idea` is the single letterless engineer (pg. 5). */
export type EngineerStack = 'A' | 'B' | 'idea';

/** One engineer **definition** — the printed data. Instances on the strip are these plus nothing else (RR1). */
export interface Engineer {
  /** Stable id, e.g. `eng-7`. */
  readonly id: string;
  /** Printed number 2–15 (the engineer-majority tiebreak reads the highest, pg. 22). */
  readonly number: number;
  /** The stack this engineer is sorted into at setup (pg. 5). */
  readonly stack: EngineerStack;
  /** The engineer's private action — a stub until RR7. */
  readonly action: EngineerAction;
}

/**
 * The 14 engineers, numbered 2–15 (pg. 5). One is letterless (`idea`); the remaining 13 split into the
 * A and B stacks. ADAPTED split (see the file header): 7 into B, 6 into A, so a 4-player deal (top 4 of
 * B + top 3 of A) and a 2/3-player deal (3 of each) both have enough in each stack.
 */
export const ENGINEERS: readonly Engineer[] = [
  { id: 'eng-2', number: 2, stack: 'idea', action: 'placeholder' }, // the letterless engineer → idea card (pg. 5)
  { id: 'eng-3', number: 3, stack: 'B', action: 'placeholder' },
  { id: 'eng-4', number: 4, stack: 'A', action: 'placeholder' },
  { id: 'eng-5', number: 5, stack: 'B', action: 'placeholder' },
  { id: 'eng-6', number: 6, stack: 'A', action: 'placeholder' },
  { id: 'eng-7', number: 7, stack: 'B', action: 'placeholder' },
  { id: 'eng-8', number: 8, stack: 'A', action: 'placeholder' },
  { id: 'eng-9', number: 9, stack: 'B', action: 'placeholder' },
  { id: 'eng-10', number: 10, stack: 'A', action: 'placeholder' },
  { id: 'eng-11', number: 11, stack: 'B', action: 'placeholder' },
  { id: 'eng-12', number: 12, stack: 'A', action: 'placeholder' },
  { id: 'eng-13', number: 13, stack: 'B', action: 'placeholder' },
  { id: 'eng-14', number: 14, stack: 'A', action: 'placeholder' },
  { id: 'eng-15', number: 15, stack: 'B', action: 'placeholder' },
];
