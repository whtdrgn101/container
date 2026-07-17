// Per-player state projection (Track B / B1). The engine and DB hold the full, authoritative
// GameState; `viewFor` produces the redacted slice a single viewer is allowed to see, so hidden
// information (each player's secret scoring card) is never handed to the wrong client.
//
// This is a pure function of (state, viewerId) — no I/O, no mutation — matching the rest of the
// engine. The backend applies it at every response boundary; an AI bot (Track A) can use the same
// projection as its "view" of the game.

import type { Viewer } from '../../kernel';
import type { GameState, PlayerState, ScoringCard } from './core';

// `Viewer` is a kernel primitive (every game projects against the same notion of a viewer); re-export
// it so Container's consumers keep importing it from the engine's Container surface.
export type { Viewer } from '../../kernel';

/** A player as seen by a particular viewer: their scoring card is hidden (`null`) unless revealed. */
export interface PlayerView extends Omit<PlayerState, 'scoringCard'> {
  /** The player's secret scoring card, or `null` when hidden from this viewer. */
  readonly scoringCard: ScoringCard | null;
}

/** A full game state projected for a viewer. Structurally a GameState with redacted players. */
export interface GameView extends Omit<GameState, 'players'> {
  readonly players: readonly PlayerView[];
  /** Who this projection was built for (`null`/`[]` for a spectator with no seat). */
  readonly viewerId: Viewer;
}

/**
 * Project `state` for `viewer`, hiding every non-viewer player's scoring card. A card is revealed
 * only to a seat that viewer holds — except once the game has ended, when all cards become public
 * for final scoring. `viewer` may be one seat id, a list of seat ids (a client holding several
 * seats sees all of its own cards and no others), or `null`/`[]` for a spectator (no cards).
 */
export function viewFor(state: GameState, viewer: Viewer): GameView {
  const revealAll = state.status === 'ended';
  const seats = viewer == null ? [] : typeof viewer === 'string' ? [viewer] : viewer;
  const players = state.players.map((player) => ({
    ...player,
    scoringCard: revealAll || seats.includes(player.id) ? player.scoringCard : null,
  }));
  return { ...state, players, viewerId: viewer };
}
