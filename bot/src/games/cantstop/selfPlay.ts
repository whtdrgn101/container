import { DICE_COUNT, DIE_FACES, applyAction, viewFor } from '@game-hub/engine/cantstop';
import type { CantStopState } from '@game-hub/engine/cantstop';
import { BotError } from '../../kernel';
import { decide } from './decide';

export interface SelfPlayOptions {
  /**
   * The dice source. **Required** — unlike Container, Can't Stop's randomness is per-turn (the roll),
   * not consumed at setup, so self-play only becomes deterministic once you inject a seeded generator.
   */
  readonly rng: () => number;
  /** Abandon the game after this many turns. Guards against a policy that never stops. */
  readonly maxTurns?: number;
}

export interface SelfPlayResult {
  readonly state: CantStopState;
  readonly turns: number;
  readonly actions: number;
  /** False when `maxTurns` cut the game short rather than someone claiming three columns. */
  readonly completed: boolean;
}

const DEFAULT_MAX_TURNS = 2000;
/** A turn is roll → (bust | select) repeated. Far past that and a policy is cycling — throw, don't hang. */
const MAX_ACTIONS_PER_TURN = 500;

/**
 * Play a game out with every seat driven by the bot. Deterministic given `(initial, rng)`: the only
 * randomness is the roll, and it comes from the injected generator, so a failing game reproduces from
 * its seed. Every seat decides from its own `viewFor` projection (a no-op here — Can't Stop hides
 * nothing), keeping the runner honest and mirroring Container's self-play exactly.
 *
 * The one wrinkle: the bot cannot roll itself, so self-play supplies `rollDice` from `rng` — the same
 * injection point the backend runner fills with `ctx.rng`.
 */
export function playSelfPlay(initial: CantStopState, options: SelfPlayOptions): SelfPlayResult {
  const { rng, maxTurns = DEFAULT_MAX_TURNS } = options;
  const rollDice = (): [number, number, number, number] => {
    const die = () => Math.floor(rng() * DIE_FACES) + 1;
    return Array.from({ length: DICE_COUNT }, die) as [number, number, number, number];
  };

  let state = initial;
  let actions = 0;
  let actionsThisTurn = 0;
  let turn = state.turn;

  while (state.status === 'active' && state.turn < maxTurns) {
    const active = state.players[state.activePlayerIndex]!;
    const action = decide(viewFor(state, active.id), active.id, { rollDice });
    state = applyAction(state, active.id, action);
    actions += 1;

    if (state.turn === turn) {
      actionsThisTurn += 1;
      if (actionsThisTurn > MAX_ACTIONS_PER_TURN) {
        throw new BotError(
          `Bot seat "${active.id}" took ${actionsThisTurn} actions in turn ${turn} without ending it — a policy is cycling`,
        );
      }
    } else {
      turn = state.turn;
      actionsThisTurn = 0;
    }
  }

  return { state, turns: state.turn, actions, completed: state.status === 'ended' };
}
