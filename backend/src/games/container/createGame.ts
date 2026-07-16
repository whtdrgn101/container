import { createGame, SCORING_CARDS } from '@container/engine';
import type { GameState } from '@container/engine';

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
  const cardIds = SCORING_CARDS.map((card) => card.id);
  for (let i = cardIds.length - 1; i > 0; i -= 1) {
    const j = Math.floor(opts.rng() * (i + 1));
    const swap = cardIds[i]!;
    cardIds[i] = cardIds[j]!;
    cardIds[j] = swap;
  }
  const players = opts.players.map((player, seat) => ({ name: player.name, scoringCardId: cardIds[seat]! }));
  return createGame({ id: opts.id, players });
}
