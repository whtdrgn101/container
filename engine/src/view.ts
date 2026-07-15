// Per-player state projection (Track B / B1). The engine and DB hold the full, authoritative
// GameState; `viewFor` produces the redacted slice a single viewer is allowed to see, so hidden
// information (each player's secret scoring card) is never handed to the wrong client.
//
// This is a pure function of (state, viewerId) — no I/O, no mutation — matching the rest of the
// engine. The backend applies it at every response boundary; an AI bot (Track A) can use the same
// projection as its "view" of the game.

import type { GameState, PlayerState, ScoringCard } from './core';

/** A player as seen by a particular viewer: their scoring card is hidden (`null`) unless revealed. */
export interface PlayerView extends Omit<PlayerState, 'scoringCard'> {
  /** The player's secret scoring card, or `null` when hidden from this viewer. */
  readonly scoringCard: ScoringCard | null;
}

/** A full game state projected for one viewer. Structurally a GameState with redacted players. */
export interface GameView extends Omit<GameState, 'players'> {
  readonly players: readonly PlayerView[];
  /** Who this projection was built for (`null` for a spectator with no seat). */
  readonly viewerId: string | null;
}

/**
 * Project `state` for `viewerId`, hiding every other player's scoring card. A card is revealed only
 * to its owner — except once the game has ended, when all cards become public for final scoring.
 * Pass `null` for a spectator (sees no cards until the game ends).
 */
export function viewFor(state: GameState, viewerId: string | null): GameView {
  const revealAll = state.status === 'ended';
  const players = state.players.map((player) => ({
    ...player,
    scoringCard: revealAll || player.id === viewerId ? player.scoringCard : null,
  }));
  return { ...state, players, viewerId };
}
