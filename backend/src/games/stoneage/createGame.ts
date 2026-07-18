import { createGame } from '@game-hub/engine/stoneage';
import type { StoneAgeState } from '@game-hub/engine/stoneage';

/**
 * Deal a fresh Stone Age game. The injected `rng` shuffles the building deck (SA9); the engine stays
 * pure by taking it as an argument (the same discipline as Container's scoring shuffle).
 */
export function newStoneAgeGame(opts: {
  readonly id: string;
  readonly players: readonly { readonly name: string }[];
  readonly rng: () => number;
}): StoneAgeState {
  return createGame({ id: opts.id, players: opts.players.map((player) => ({ name: player.name })), rng: opts.rng });
}
