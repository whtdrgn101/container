import type { StPetersburgState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { effectiveCost } from './buy';

/**
 * The actions a seat may legally take right now (roadmap SP1–SP2): `PASS` (always, on your turn), plus a
 * `BUY` for every card in either row the seat can afford after cost reductions. **Trading cards are always
 * omitted** — buying one needs displacement (pg. 7), which lands in SP4 — so in the trading phase (whose
 * upper row is all trading cards) only `PASS` and any leftover non-trading cards remain. Drives the UI's
 * affordances and — later — the bot.
 *
 * **It reads only own-seat knowledge**, so it never leaks hidden info: affordability uses the seat's own
 * rubles (its own secret) and its play area (public). Saint Petersburg has no off-turn moves, so a query
 * for a non-active seat answers empty. Called server-side with the active seat's own view, and by the UI
 * from the viewer's own view — in both, the active seat's rubles are visible.
 */
export function legalActions(state: StPetersburgState, playerId?: string): Action[] {
  if (state.status === 'ended') return [];

  const seat = playerId === undefined ? state.activePlayerIndex : seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) return [];
  const player = state.players[seat]!;

  const actions: Action[] = [{ type: 'PASS' }];
  for (const row of ['upper', 'lower'] as const) {
    state.board[row].forEach((card, index) => {
      if (card.kind === 'trading') return; // not buyable yet (SP4)
      if (player.rubles >= effectiveCost(player, card, row)) actions.push({ type: 'BUY', row, index });
    });
  }
  return actions;
}
