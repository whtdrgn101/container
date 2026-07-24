import type { MoveRecord } from './moveRecord';

/** The minimal state shape `record()` maintains: a version counter and an append-only move log. */
export interface VersionedState {
  readonly version: number;
  readonly log: readonly MoveRecord[];
}

/**
 * Produce the next state after a mechanic: apply the top-level `changes`, bump `version`, and append
 * one entry to the `log`. The single place — across *every* game — that touches `version`/`log`, so
 * they can never drift out of step.
 *
 * Generic over the game's own state `S`; each game re-exports this directly (Container wraps it to keep
 * its `players`-first ergonomics). `changes` is `Partial<S>` — a mechanic hands in only the fields it
 * touched — and must never include `version`/`log`, which are always overwritten here.
 *
 * (This was three byte-identical copies until a third game made the shape genuinely common — see the
 * kernel note in CLAUDE.md and REVIEW.md §3.2.)
 */
export function record<S extends VersionedState>(
  state: S,
  type: string,
  playerId: string,
  changes: Partial<S> = {},
  payload?: Record<string, unknown>,
): S {
  const version = state.version + 1;
  const entry: MoveRecord = payload ? { seq: version, type, playerId, payload } : { seq: version, type, playerId };
  // Cast bridges TypeScript's inability to prove a generic spread reconstructs exactly `S`; the runtime
  // shape is `S` with `version`/`log` overwritten, which is precisely the intent.
  return { ...state, ...changes, version, log: [...state.log, entry] } as S;
}
