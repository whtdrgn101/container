import { shuffle } from '@game-hub/kernel';
import { createGame, SCORING_CARDS } from '../engine';
import type { GameState } from '../engine';

/**
 * Deal a fresh Container game: shuffle the scoring deck and give each seat a secret card.
 *
 * The shuffle lives here rather than in the engine because the engine is pure — no `Date`, no
 * `Math.random` — which is what makes the 100% coverage gate reachable and replay possible. The
 * randomness is injected by the caller (`rng`), so this stays deterministic under test too.
 */
export function newContainerGame(opts: {
  readonly id: string;
  readonly players: readonly { readonly name: string }[];
  readonly rng: () => number;
}): GameState {
  // The kernel's Fisher–Yates (1.2.0) — the same algorithm this file used to spell out inline, so the
  // deal a given `rng` produces is unchanged.
  const cardIds = shuffle(
    SCORING_CARDS.map((card) => card.id),
    opts.rng,
  );
  const players = opts.players.map((player, seat) => ({ name: player.name, scoringCardId: cardIds[seat]! }));
  return createGame({ id: opts.id, players });
}
