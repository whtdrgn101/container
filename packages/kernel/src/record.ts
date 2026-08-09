import type { MoveRecord } from './moveRecord.js';

/**
 * The minimal state shape `record()` maintains: a version counter and an append-only move log.
 *
 * `T` is the game's own record-type union, forwarded to {@link MoveRecord} and defaulting to `string`
 * (kernel 1.4.0). A state that names one — `log: readonly MoveRecord<'BID' | 'PLAY'>[]` — still
 * satisfies the bare `VersionedState`, because a readonly array is covariant and `MoveRecord<'BID'>` is
 * a `MoveRecord<string>`. That is what keeps this additive.
 */
export interface VersionedState<T extends string = string> {
  readonly version: number;
  readonly log: readonly MoveRecord<T>[];
}

/**
 * The record types a given state's own log admits — the union it was declared with, or `string` for a
 * log left untyped.
 *
 * This is what lets `record()` check its `type` argument **without a second type parameter to pass**: a
 * game types its state's `log` once, and every call site is checked from there. A game that has not
 * typed its log infers `string` and behaves exactly as it did before.
 */
export type RecordTypeOf<S> = S extends { readonly log: readonly MoveRecord<infer T>[] } ? T : string;

/**
 * Produce the next state after a mechanic: apply the top-level `changes`, bump `version`, and append
 * one entry to the `log`. The single place — across *every* game — that touches `version`/`log`, so
 * they can never drift out of step.
 *
 * Generic over the game's own state `S`; each game re-exports this directly (Container wraps it to keep
 * its `players`-first ergonomics). `changes` is `Partial<S>` — a mechanic hands in only the fields it
 * touched — and must never include `version`/`log`, which are always overwritten here.
 *
 * ⚠️ **`type` is checked against the state's own log** (kernel 1.4.0): it is `RecordTypeOf<S>`, so a game
 * whose state declares `log: readonly MoveRecord<'BID' | 'PLAY'>[]` cannot log a `'BDI'` here. A game
 * that has not typed its log gets `string` and is unaffected — which is why this needed no new type
 * parameter at any call site and no game had to change to keep compiling.
 *
 * (This was three byte-identical copies until a third game made the shape genuinely common — see the
 * kernel note in CLAUDE.md and REVIEW.md §3.2.)
 */
export function record<S extends VersionedState>(
  state: S,
  type: RecordTypeOf<S>,
  playerId: string,
  changes: Partial<S> = {},
  payload?: Record<string, unknown>,
): S {
  const version = state.version + 1;
  const entry: MoveRecord<RecordTypeOf<S>> = payload
    ? { seq: version, type, playerId, payload }
    : { seq: version, type, playerId };
  // Cast bridges TypeScript's inability to prove a generic spread reconstructs exactly `S`; the runtime
  // shape is `S` with `version`/`log` overwritten, which is precisely the intent.
  return { ...state, ...changes, version, log: [...state.log, entry] } as S;
}
