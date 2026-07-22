import { applyAction, DIE_FACES, viewFor } from '@game-hub/engine/stoneage';
import type { StoneAgeState } from '@game-hub/engine/stoneage';
import { makeProgressGuard } from '../../kernel';
import { decide } from './decide';
import type { DecideFn } from './types';

export interface SelfPlayOptions {
  /**
   * The dice source. **Required** — Stone Age's per-turn randomness is the gather roll, so self-play only
   * becomes deterministic once you inject a seeded generator (like Can't Stop; unlike Container, whose
   * only randomness is the setup shuffle).
   */
  readonly rng: () => number;
  /** Abandon after this many rounds — a backstop against a policy that somehow never ends the game. */
  readonly maxRounds?: number;
  /**
   * Per-seat policy override (seat id → decide function); seats not in the map use the live `decide`.
   * This is how the strength benchmark pits the current policy against a frozen legacy one.
   */
  readonly policies?: ReadonlyMap<string, DecideFn>;
}

export interface SelfPlayResult {
  readonly state: StoneAgeState;
  readonly rounds: number;
  readonly actions: number;
  /** False when `maxRounds` cut the game short rather than a real game-end trigger firing. */
  readonly completed: boolean;
}

const DEFAULT_MAX_ROUNDS = 200;
/**
 * Per-round runaway cap. A real Stone Age round is well under a hundred actions (placements + resolves +
 * feeds across the table), so this is generous headroom while still catching a cycling policy in ~one
 * round — unlike the old flat 100,000-action cap, which let a cycle burn 100k actions before failing.
 */
const MAX_ACTIONS_PER_ROUND = 500;

/**
 * Play a Stone Age game out with every seat driven by the bot. Deterministic given `(initial, rng)`: the
 * only randomness is the gather roll, drawn from the injected generator, so a failing game reproduces from
 * its seed. Every seat decides from its own `viewFor` projection (near-identity here) — the same contract
 * the backend runner honours, and the real test that every decision the bot makes is legal.
 */
export function playSelfPlay(initial: StoneAgeState, options: SelfPlayOptions): SelfPlayResult {
  const { rng, maxRounds = DEFAULT_MAX_ROUNDS, policies } = options;
  const rollDice = (count: number): number[] => Array.from({ length: count }, () => Math.floor(rng() * DIE_FACES) + 1);

  let state = initial;
  let actions = 0;
  const guard = makeProgressGuard({ maxPerMarker: MAX_ACTIONS_PER_ROUND, marker: 'round', initial: state.round });
  while (state.status === 'active' && state.round <= maxRounds) {
    const active = state.players[state.activePlayerIndex]!;
    const decideFn = policies?.get(active.id) ?? decide;
    state = applyAction(state, active.id, decideFn(viewFor(state, active.id), active.id, { rollDice }));
    actions += 1;
    guard.record(state.round, active.id);
  }

  return { state, rounds: state.round, actions, completed: state.status === 'ended' };
}
