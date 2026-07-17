import type { Action } from '@game-hub/engine/stoneage';
import type { ParseResult } from '../module';

/**
 * Validate opaque JSON into a typed Stone Age `Action`.
 *
 * **The scaffold accepts nothing** — no action is playable until its roadmap stage lands, so every
 * payload is refused here with a clear message. Each stage that adds an action extends this to parse it.
 */
export function parseStoneAgeAction(_raw: unknown): ParseResult<Action> {
  return { ok: false, message: 'Stone Age has no playable actions yet — the mechanics land one stage at a time' };
}
