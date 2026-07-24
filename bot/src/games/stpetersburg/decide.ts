import type { Action, StPetersburgView } from '@game-hub/engine/stpetersburg';
import { assertBotTurn } from '../../kernel';
import { pickAction } from './policy';

/**
 * Choose this bot's next Saint Petersburg action.
 *
 * `view` is `viewFor(state, playerId)` — the platform's first **genuinely redacted** bot view: opponents'
 * rubles are `null` and their hands are counts, and the four draw stacks are counts (their order is a real
 * secret). The bot reads none of that — `pickAction` ranks only what `legalActions(view)` offers, which
 * itself reads own-seat knowledge only, so cheating is structurally impossible (there is no field to peek).
 *
 * The returned action is always legal for `applyAction` and always a member of `legalActions(view,
 * playerId)`: the policy is an argmax **over that list**, so it can only ever return an offered move. No
 * randomness is needed — Saint Petersburg has no dice, and a greedy baseline never gambles on a blind
 * Observatory draw (which `legalActions` doesn't offer off a redacted view anyway).
 */
export function decide(view: StPetersburgView, playerId: string): Action {
  assertBotTurn(view, playerId);
  return pickAction(view, playerId);
}
