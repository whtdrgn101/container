import { applyAction, DIE_FACES, viewFor } from '@game-hub/engine/stoneage';
import type { StoneAgeState } from '@game-hub/engine/stoneage';
import { BotError } from '../../kernel';
import { decide } from './decide';

export interface SelfPlayOptions {
  /**
   * The dice source. **Required** — Stone Age's per-turn randomness is the gather roll, so self-play only
   * becomes deterministic once you inject a seeded generator (like Can't Stop; unlike Container, whose
   * only randomness is the setup shuffle).
   */
  readonly rng: () => number;
  /** Abandon after this many rounds — a backstop against a policy that somehow never ends the game. */
  readonly maxRounds?: number;
}

export interface SelfPlayResult {
  readonly state: StoneAgeState;
  readonly rounds: number;
  readonly actions: number;
  /** False when `maxRounds` cut the game short rather than a real game-end trigger firing. */
  readonly completed: boolean;
}

const DEFAULT_MAX_ROUNDS = 200;
/** Far more actions than a real game needs; a runaway guard so a cycling policy throws instead of hanging. */
const MAX_ACTIONS = 100_000;

/**
 * Play a Stone Age game out with every seat driven by the bot. Deterministic given `(initial, rng)`: the
 * only randomness is the gather roll, drawn from the injected generator, so a failing game reproduces from
 * its seed. Every seat decides from its own `viewFor` projection (near-identity here) — the same contract
 * the backend runner honours, and the real test that every decision the bot makes is legal.
 */
export function playSelfPlay(initial: StoneAgeState, options: SelfPlayOptions): SelfPlayResult {
  const { rng, maxRounds = DEFAULT_MAX_ROUNDS } = options;
  const rollDice = (count: number): number[] => Array.from({ length: count }, () => Math.floor(rng() * DIE_FACES) + 1);

  let state = initial;
  let actions = 0;
  while (state.status === 'active' && state.round <= maxRounds) {
    const active = state.players[state.activePlayerIndex]!;
    state = applyAction(state, active.id, decide(viewFor(state, active.id), active.id, { rollDice }));
    actions += 1;
    if (actions > MAX_ACTIONS) {
      throw new BotError(`Self-play exceeded ${MAX_ACTIONS} actions without ending — a policy is cycling`);
    }
  }

  return { state, rounds: state.round, actions, completed: state.status === 'ended' };
}
