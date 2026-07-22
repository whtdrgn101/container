import type { StPetersburgState } from '../core';
import { handLimit } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { effectiveCost, handCost } from './buy';

/**
 * The actions a seat may legally take right now (roadmap SP1–SP3): `PASS` (always, on your turn); a `BUY`
 * for every non-trading row card the seat can afford; an `ADD_TO_HAND` for **every** row card while the
 * hand isn't full (free, so no affordability check — and trading cards *are* addable, see `addToHand`);
 * and a `PLAY_FROM_HAND` for every affordable non-trading card in the seat's **own hand**. Trading cards
 * are omitted from buys/plays — those need displacement (pg. 7), which lands in SP4. Drives the UI's
 * affordances and — later — the bot.
 *
 * **It reads only own-seat knowledge**, so it never leaks hidden info: affordability uses the seat's own
 * rubles (its own secret), its play area (public), and its **own hand** (the only hand it may read).
 * Saint Petersburg has no off-turn moves, so a query for a non-active seat answers empty. Called
 * server-side with the active seat's own state, and by the UI from the viewer's own view — in both, the
 * active seat's rubles and hand are visible.
 */
export function legalActions(state: StPetersburgState, playerId?: string): Action[] {
  if (state.status === 'ended') return [];

  const seat = playerId === undefined ? state.activePlayerIndex : seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) return [];
  const player = state.players[seat]!;

  const actions: Action[] = [{ type: 'PASS' }];
  const canAdd = player.hand.length < handLimit(player);
  for (const row of ['upper', 'lower'] as const) {
    state.board[row].forEach((card, index) => {
      if (card.kind !== 'trading' && player.rubles >= effectiveCost(player, card, row)) {
        actions.push({ type: 'BUY', row, index }); // not buyable if trading (SP4)
      }
      if (canAdd) actions.push({ type: 'ADD_TO_HAND', row, index }); // free; any card, trading included
    });
  }
  // PLAY_FROM_HAND — own hand only. Trading cards can't be played until displacement exists (SP4).
  player.hand.forEach((card, index) => {
    if (card.kind !== 'trading' && player.rubles >= handCost(player, card)) {
      actions.push({ type: 'PLAY_FROM_HAND', index });
    }
  });
  return actions;
}
