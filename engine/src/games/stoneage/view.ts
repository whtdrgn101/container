import type { Viewer } from '../../kernel';
import type { StoneAgeState } from './core';

// `Viewer` is a kernel primitive; re-export it so Stone Age's consumers import it from this surface.
export type { Viewer } from '../../kernel';

/**
 * A Stone Age game projected for a viewer. Stone Age is a Euro with almost no hidden information —
 * resources, tools, people and the board are all public — so a view is the whole state plus a note of
 * who it's for. (The undrawn card/building decks are the only secret, and those aren't modelled until
 * their stages; redact them here then if it matters.)
 */
export interface StoneAgeView extends StoneAgeState {
  readonly viewerId: Viewer;
}

/** Project `state` for `viewer`. A near-identity redaction at the scaffold stage. */
export function viewFor(state: StoneAgeState, viewer: Viewer): StoneAgeView {
  return { ...state, viewerId: viewer };
}
