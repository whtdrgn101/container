/**
 * How every game represents "is the game over?", as a discriminated union on `status`.
 *
 * A game is either `active`, or it has `ended` and *therefore* carries its winner(s) — and, for games
 * that compute one, a per-player results record `R`. Modelling it as a union (rather than a `status`
 * flag sitting beside always-present `results`/`winnerIds`) is the whole point: an active game carrying
 * stale `results`, `{ status: 'ended' }` with no winner, and `{ status: 'ended', results: [] }` used as
 * a "no result yet" sentinel all become **unconstructable**. A game's full state type intersects this
 * with its own fields, so `ended` and `results` can never disagree (REVIEW.md §3.1).
 *
 * Read sites narrow on `status`: after `state.status === 'ended'`, `results`/`winnerIds` are present and
 * typed; on the `active` arm they don't exist at all. Type-only (excluded from the coverage gate).
 */
export type GameEndState<R> =
  | { readonly status: 'active' }
  | {
      readonly status: 'ended';
      readonly results: readonly R[];
      readonly winnerIds: readonly string[];
    };

/**
 * The end-state for a game whose only end-of-game data is the winner(s), with no per-player results
 * record to tabulate (Can't Stop: claiming the third column ends a race, and there is nothing to score
 * afterwards). Manufacturing an always-empty `results: []` to reuse `GameEndState` here would be
 * *invented data* — a field that exists only to satisfy a shared shape — so this arm omits it. The
 * `status` discriminant and the `active` arm are identical to `GameEndState`, so read sites narrow the
 * same way; only the `ended` payload differs. Type-only (excluded from the coverage gate).
 */
export type WinnersEndState =
  | { readonly status: 'active' }
  | { readonly status: 'ended'; readonly winnerIds: readonly string[] };
