/**
 * One entry in a game's append-only move log, for replay/audit and the backend's move feed.
 *
 * Game-agnostic on purpose: every game records moves the same shape, and the backend's `GameModule`
 * contract now shares this type directly (rather than restating it) — see `contracts/module.ts`.
 * Anything a game logs is on the wire — a game with a genuine secret must not record it (Container
 * never records a losing bid).
 *
 * ## `T` — the game's own record-type union (kernel 1.4.0)
 *
 * `type` used to be a bare `string`, which meant a game could log `'TRIKC'` and nothing anywhere would
 * notice: not the compiler, not the tests that assert against `'TRICK'` (they simply never match), not
 * the feed (it renders whatever it is handed). The entry is on the wire and in the replay, so a typo is
 * a permanently wrong audit record.
 *
 * So a game may name its own union — `MoveRecord<'BID' | 'PLAY' | 'TRICK' | 'HAND' | 'DEAL'>` — and get
 * that checked at every `record()` call and every `switch` that reads one back.
 *
 * ⚠️ **It is the union of what a game _logs_, which is not its `ActionType`.** Those overlap but are
 * different sets: closing Argute's third trick appends `TRICK`, `HAND` and `DEAL` entries that no client
 * ever sends, and a game may have an action it deliberately does not log. Type this against the log, not
 * against the action union, or the entries a *cascade* produces will not fit.
 *
 * `T` defaults to `string`, so every `MoveRecord` written before this parameter existed means exactly
 * what it did — this is an additive change and the contract version does not move (see `contract.ts`).
 */
export interface MoveRecord<T extends string = string> {
  readonly seq: number;
  readonly type: T;
  readonly playerId: string;
  readonly payload?: Record<string, unknown>;
}
