import { applyAction, viewFor } from '@game-hub/engine/stpetersburg';
import type { StPetersburgState } from '@game-hub/engine/stpetersburg';
import { makeProgressGuard } from '../../kernel';
import { decide } from './decide';
import type { DecideFn } from './types';

export interface SelfPlayOptions {
  /** Abandon after this many rounds — a backstop against a policy that somehow never ends the game. */
  readonly maxRounds?: number;
  /**
   * Per-seat policy override (seat id → decide function); seats not in the map use the live `decide`. This
   * is how a later strength benchmark pits the current policy against this frozen baseline.
   */
  readonly policies?: ReadonlyMap<string, DecideFn>;
}

export interface SelfPlayResult {
  readonly state: StPetersburgState;
  readonly rounds: number;
  readonly actions: number;
  /** False when `maxRounds` cut the game short rather than a real game-end trigger firing. */
  readonly completed: boolean;
}

const DEFAULT_MAX_ROUNDS = 100;
/**
 * Per-round runaway cap. A real Saint Petersburg round is a few dozen actions (four phases of buys/adds
 * plus the passes that close each), so this is generous headroom while still catching a cycling policy in
 * about one round instead of letting it burn a flat action budget.
 */
const MAX_ACTIONS_PER_ROUND = 500;

/**
 * Play a Saint Petersburg game out with every seat driven by the bot. **Deterministic given the initial
 * state** — Saint Petersburg's only randomness is the setup shuffle, baked into `initial` by `createGame`,
 * and nothing the bot decides consumes an rng — so a failing game reproduces from its seed with no injected
 * generator (unlike Can't Stop / Stone Age, whose per-turn dice must be supplied).
 *
 * Every seat decides from its **own** `viewFor` projection — the real test that the bot only ever reads a
 * player's own view (its rubles/hand) and still produces legal moves, the same contract the backend runner
 * honours. Any illegal action throws out of `applyAction`, so self-play is the bot's exhaustive legality
 * check across thousands of live engine transitions.
 */
export function playSelfPlay(initial: StPetersburgState, options: SelfPlayOptions = {}): SelfPlayResult {
  const { maxRounds = DEFAULT_MAX_ROUNDS, policies } = options;

  let state = initial;
  let actions = 0;
  const guard = makeProgressGuard({ maxPerMarker: MAX_ACTIONS_PER_ROUND, marker: 'round', initial: state.round });

  while (state.status === 'active' && state.round <= maxRounds) {
    const active = state.players[state.activePlayerIndex]!;
    const decideFn = policies?.get(active.id) ?? decide;
    state = applyAction(state, active.id, decideFn(viewFor(state, active.id), active.id));
    actions += 1;
    guard.record(state.round, active.id);
  }

  return { state, rounds: state.round, actions, completed: state.status === 'ended' };
}
