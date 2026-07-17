import { DIE_FACES } from '@game-hub/engine/stoneage';

/**
 * Roll `count` Stone Age dice from an injected generator — one per person on a place (pg. 6). The one
 * place server-side dice are produced, so a bot (later) and a human roll identically.
 */
export function rollDice(rng: () => number, count: number): number[] {
  const die = () => Math.floor(rng() * DIE_FACES) + 1;
  return Array.from({ length: count }, die);
}
