import { createGame } from '@container/engine/cantstop';
import type { CantStopState } from '@container/engine/cantstop';

/**
 * Deal a fresh Can't Stop game. Unlike Container there is no setup randomness — the dice are rolled
 * per turn (server-side, from the injected `rng`), not dealt at the start — so `rng` is accepted to
 * satisfy the module contract but deliberately unused.
 */
export function newCantStopGame(opts: {
  readonly id: string;
  readonly players: readonly { readonly name: string }[];
  readonly rng: () => number;
}): CantStopState {
  return createGame({ id: opts.id, players: opts.players.map((player) => ({ name: player.name })) });
}
