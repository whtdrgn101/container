import { createGame } from '@game-hub/engine/stoneage';
import type { StoneAgeState } from '@game-hub/engine/stoneage';

/**
 * Deal a fresh Stone Age game. The scaffold needs no setup randomness (the card/building decks arrive
 * with their stages), so `rng` is accepted to satisfy the module contract but deliberately unused for
 * now — the deck shuffle will draw on it once those stages land.
 */
export function newStoneAgeGame(opts: {
  readonly id: string;
  readonly players: readonly { readonly name: string }[];
  readonly rng: () => number;
}): StoneAgeState {
  return createGame({ id: opts.id, players: opts.players.map((player) => ({ name: player.name })) });
}
