import { applyAction, viewFor } from '@game-hub/engine/container';
import type { Color, GameState } from '@game-hub/engine/container';
import { makeProgressGuard } from '../../kernel';
import { bidFor, runoffBidFor } from './bid';
import { decide } from './decide';

export interface SelfPlayOptions {
  /** Abandon the game after this many turns. Guards against a policy that never ends the game. */
  readonly maxTurns?: number;
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
  let state = initial;
  let actions = 0;
  const guard = makeProgressGuard({ maxPerMarker: MAX_ACTIONS_PER_TURN, marker: 'turn', initial: state.turn });

  while (state.status === 'active' && state.turn < maxTurns) {
    const active = state.players[state.activePlayerIndex]!;

    // Every opponent bids from their own view — nobody sees another's card, exactly as at a table.
    let opening: Record<string, number> = {};
    const collectBids = (_cargo: readonly Color[]): Record<string, number> => {
      const bids: Record<string, number> = {};
      for (const opponent of state.players) {
        if (opponent.id !== active.id) {
          bids[opponent.id] = bidFor(viewFor(state, opponent.id), opponent.id);
        }
      }
      opening = bids;
      return bids;
    };

    // On a tie the tied players add cash on top of what they already bid (pg. 16) — again each from
    // their own view, so nobody's runoff bid is informed by anything they shouldn't know.
    const collectRunoffBids = (_cargo: readonly Color[], tied: readonly string[]): Record<string, number> => {
      const extra: Record<string, number> = {};
      for (const id of tied) {
        extra[id] = runoffBidFor(viewFor(state, id), id, opening[id] ?? 0);
      }
      return extra;
    };

    const action = decide(viewFor(state, active.id), active.id, { collectBids, collectRunoffBids });
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
