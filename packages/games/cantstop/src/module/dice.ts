import { DICE_COUNT, DIE_FACES } from '../engine';

/**
 * Roll the four Can't Stop dice from an injected generator. The **one** place server-side dice are
 * produced — used by both the `/roll` route (a human's roll) and the bot runner (a bot's), so the two
 * draw randomness identically and a bot cannot roll any differently than a person.
 */
export function rollFourDice(rng: () => number): [number, number, number, number] {
  const die = () => Math.floor(rng() * DIE_FACES) + 1;
  return Array.from({ length: DICE_COUNT }, die) as [number, number, number, number];
}
