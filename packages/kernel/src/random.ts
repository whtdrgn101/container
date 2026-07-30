/**
 * Seeded randomness — the two helpers every game's *setup* needs, on the framework-free `.` barrel
 * (kernel 1.2.0, D2c finding §13).
 *
 * The platform's hard rule is that **an engine is pure and its randomness is injected** (CLAUDE.md,
 * design-patterns §1): a game deals with `createGame({ rng })` and never reaches for `Math.random`.
 * That rule needs two things to be practical, and until now neither lived where an engine could get
 * at it:
 *
 * - **A seeded generator**, so a rules test can deal a reproducible board. `mulberry32` existed, but
 *   only on `@game-hub/kernel/bot` — so an engine test either pulled the *bot* subpath into a rules
 *   test (wrong layer) or reimplemented it in `tests/helpers.ts`, which is what every hub game and the
 *   out-of-repo pilot each did.
 * - **A shuffle**, because "deal a deck" is what setup randomness is *for*. Four in-repo engines had
 *   written the same Fisher–Yates, twice inline — well past the extract-on-the-third-example line.
 *
 * Both are pure functions of their inputs (no `Math.random`, no `Date`, no mutation of the caller's
 * array), which is what lets them sit below a 100% coverage gate and inside a replayable engine.
 * `mulberry32` is still exported from `./bot` as well — nothing moved off that subpath.
 */

/**
 * A small deterministic PRNG (mulberry32) — the seed source a bench threads into its setup shuffle and
 * per-turn dice, and the one a rules test uses to deal a reproducible board. The same seed always
 * yields the same stream, so a whole game (or a whole bench run) reproduces from one number.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle over an injected `rng`, returning a **new** array (the input is `readonly` and
 * never mutated — an engine's state must stay immutable).
 *
 * `rng` is optional and **omitting it keeps the given order**, which is not laziness: a game's setup
 * takes `rng?` precisely so a rules test can deal a *known* deck and assert against fixed positions,
 * while the host always passes the injected generator. Same convention as Saint Petersburg's and
 * Stone Age's dealers, which is where this was extracted from.
 */
export function shuffle<T>(items: readonly T[], rng?: () => number): T[] {
  const out = [...items];
  if (!rng) return out;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = out[i]!;
    out[i] = out[j]!;
    out[j] = swap;
  }
  return out;
}
