import { applyAction, viewFor } from '../engine';
import type { Color, GameState } from '../engine';
import { makeProgressGuard } from '@game-hub/kernel/bot';
import { bidFor, runoffBidFor } from './bid';
import { decide } from './decide';
import type { SeatPolicy } from './types';

/**
 * The built-in policy — the live `decide` plus its live bid functions. This is the baseline the
 * strength benchmark freezes against: to tune, copy the policy files, build a `SeatPolicy` from the
 * frozen copies, and bench the live one against it.
 */
export const defaultPolicy: SeatPolicy = { decide, bidFor, runoffBidFor };

export interface SelfPlayOptions {
  /** Abandon the game after this many turns. Guards against a policy that never ends the game. */
  readonly maxTurns?: number;
  /**
   * Per-seat policy override (seat id → policy); seats not in the map use the built-in `defaultPolicy`.
   * A Container policy is a *bundle* (decide + bids), not a bare `decide`, because a seat's sealed bids
   * are decided from that seat's own view — so pitting two policies must route each seat's bids through
   * its own. This is how the strength benchmark seats a candidate against a frozen baseline.
   */
  readonly policies?: ReadonlyMap<string, SeatPolicy>;
}

export interface SelfPlayResult {
  readonly state: GameState;
  /** Turns played. */
  readonly turns: number;
  /** Total actions applied. */
  readonly actions: number;
  /** False when `maxTurns` cut the game short rather than the supply running out. */
  readonly completed: boolean;
}

const DEFAULT_MAX_TURNS = 400;
/**
 * A single turn is 2 actions plus free ones (loans, Bank pickups). Well past that and a policy is
 * cycling — throw rather than hang, because a hang in CI tells you nothing about which policy broke.
 */
const MAX_ACTIONS_PER_TURN = 40;

/**
 * Play a game out with every seat driven by the bot. Pure and deterministic: same starting state in,
 * same result out — `createGame` already took the randomness, so a failing game is always reproducible
 * from its seed.
 *
 * Each seat decides from **its own** `viewFor` projection, so the bots are held to exactly the hidden
 * information a human has. That's what makes self-play a real test of the policies and not of the
 * engine's internals.
 */
export function playSelfPlay(initial: GameState, options: SelfPlayOptions = {}): SelfPlayResult {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const policyOf = (id: string): SeatPolicy => options.policies?.get(id) ?? defaultPolicy;
  let state = initial;
  let actions = 0;
  const guard = makeProgressGuard({ maxPerMarker: MAX_ACTIONS_PER_TURN, marker: 'turn', initial: state.turn });

  while (state.status === 'active' && state.turn < maxTurns) {
    const active = state.players[state.activePlayerIndex]!;

    // Every opponent bids from their own view *and its own policy* — nobody sees another's card, and
    // each seat's sealed bid is decided by that seat's own bid function, exactly as at a table.
    let opening: Record<string, number> = {};
    const collectBids = (_cargo: readonly Color[]): Record<string, number> => {
      const bids: Record<string, number> = {};
      for (const opponent of state.players) {
        if (opponent.id !== active.id) {
          bids[opponent.id] = policyOf(opponent.id).bidFor(viewFor(state, opponent.id), opponent.id);
        }
      }
      opening = bids;
      return bids;
    };

    // On a tie the tied players add cash on top of what they already bid (pg. 16) — again each from
    // their own view and their own policy, so nobody's runoff bid is informed by anything they shouldn't know.
    const collectRunoffBids = (_cargo: readonly Color[], tied: readonly string[]): Record<string, number> => {
      const extra: Record<string, number> = {};
      for (const id of tied) {
        extra[id] = policyOf(id).runoffBidFor(viewFor(state, id), id, opening[id] ?? 0);
      }
      return extra;
    };

    const action = policyOf(active.id).decide(viewFor(state, active.id), active.id, { collectBids, collectRunoffBids });
    state = applyAction(state, active.id, action);
    actions += 1;
    guard.record(state.turn, active.id);
  }

  return {
    state,
    turns: state.turn,
    actions,
    completed: state.status === 'ended',
  };
}
