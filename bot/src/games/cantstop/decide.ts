import type { Action, CantStopView } from '@game-hub/engine/cantstop';
import { BotError } from '../../kernel';
import { pickPairing, shouldRoll } from './policy';
import type { DecideOptions } from './types';

/**
 * Choose this bot's next action in Can't Stop.
 *
 * `view` is `viewFor(state, playerId)` — but Can't Stop hides nothing, so the view *is* the whole
 * state (the redaction is a no-op). The returned action is always legal for `applyAction`:
 * - **selecting** → the highest-scoring legal pairing (`SELECT`).
 * - **rolling** → roll again or `STOP`, per the risk model. Rolling needs dice the bot can't invent, so
 *   it calls `options.rollDice` (the caller's injected randomness) and throws a `BotError` without it —
 *   the same contract Container's `decide` has for `collectBids`.
 */
export function decide(view: CantStopView, playerId: string, options: DecideOptions = {}): Action {
  if (view.status === 'ended') {
    throw new BotError(`Game "${view.id}" has ended — there is nothing to decide`);
  }
  const active = view.players[view.activePlayerIndex];
  if (!active || active.id !== playerId) {
    throw new BotError(`It is not bot seat "${playerId}"'s turn (active seat is "${active?.id ?? 'none'}")`);
  }

  if (view.phase === 'selecting') {
    return { type: 'SELECT', columns: pickPairing(view) };
  }

  if (shouldRoll(view)) {
    if (!options.rollDice) {
      throw new BotError(
        `Bot seat "${playerId}" chose to roll, but no rollDice was supplied. Dice are randomness the ` +
          'bot cannot invent — the caller must inject them (self-play seeds an rng; the runner uses ctx.rng).',
      );
    }
    return { type: 'ROLL', dice: options.rollDice() };
  }
  return { type: 'STOP' };
}
