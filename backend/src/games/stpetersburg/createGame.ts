import { createGame } from '@game-hub/engine/stpetersburg';
import type { StPetersburgState } from '@game-hub/engine/stpetersburg';

/**
 * Deal a fresh Saint Petersburg game. The injected `rng` shuffles the four card stacks and deals the
 * starting-player markers (pg. 2); the engine stays pure by taking it as an argument (the same discipline
 * as the other three games' setup shuffles).
 */
export function newStPetersburgGame(opts: {
  readonly id: string;
  readonly players: readonly { readonly name: string }[];
  readonly rng: () => number;
}): StPetersburgState {
  return createGame({ id: opts.id, players: opts.players.map((player) => ({ name: player.name })), rng: opts.rng });
}
