import type { Action, CantStopView } from '../engine';
import { BotError, assertBotTurn } from '@game-hub/kernel/bot';
import { DIFFICULTIES, pickPairing, shouldRoll } from './policy';
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
 *
 * `options.difficulty` (default `'normal'`, so every existing caller is unchanged) selects the
 * parameter set the risk model runs under (CS4) — the tiers scale probability thresholds, never swap
 * the model.
 */
export function decide(view: CantStopView, playerId: string, options: DecideOptions = {}): Action {
  assertBotTurn(view, playerId);
  const params = DIFFICULTIES[options.difficulty ?? 'normal'];

  if (view.phase === 'selecting') {
    return { type: 'SELECT', columns: pickPairing(view, params) };
  }

  if (shouldRoll(view, params)) {
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
