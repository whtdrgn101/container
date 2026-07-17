import type { Viewer } from '../../kernel';
import type { CantStopState } from './core';

// `Viewer` is a kernel primitive; re-export it so Can't Stop's consumers import it from this surface.
export type { Viewer } from '../../kernel';

/**
 * A Can't Stop game projected for a viewer. Can't Stop has **no hidden information** — every square,
 * runner and die is on the board for all to see — so a view is just the state plus a note of who it
 * was built for, kept for parity with the platform's `viewFor` contract (and games that do redact).
 */
export interface CantStopView extends CantStopState {
  readonly viewerId: Viewer;
}

/** Project `state` for `viewer`. A no-op redaction: nothing here is secret. */
export function viewFor(state: CantStopState, viewer: Viewer): CantStopView {
  return { ...state, viewerId: viewer };
}
