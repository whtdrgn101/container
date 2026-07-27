import type { CardKind, StPetersburgState } from '../core';
import { CARD_KINDS, handLimit, PUB_MAX_POINTS, PUB_POINT_COST } from '../core';
import { legalDisplaceTargets, seatOf, unusedObservatories } from '../internal';
import type { Action } from './action';
import { displacementCost, effectiveCost, handCost } from './buy';

/**
 * The actions a seat may legally take right now (roadmap SP1–SP4): `PASS` (always, on your turn); a `BUY`
 * for every affordable row card — a plain buy for a non-trading card, or **one buy per legal displacement
 * target** for a trading card (pg. 7); an `ADD_TO_HAND` for **every** row card while the hand isn't full
 * (free, so no affordability check — and trading cards *are* addable, see `addToHand`); and a
 * `PLAY_FROM_HAND` for every affordable card in the seat's **own hand** (again, one per target for a
 * trading card). Drives the UI's affordances and — later — the bot.
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

  // ── SP5 interludes (pg. 8): while one is open the seat may only resolve it ──
  if (state.pendingPubBuy) {
    // Buy 0..(min of the 5-point cap and what the seat can afford) whole points (0 = decline). Reads the
    // seat's own rubles — the same own-seat-knowledge rule as the affordability checks below.
    const max = Math.min(PUB_MAX_POINTS, Math.floor(player.rubles / PUB_POINT_COST));
    const buys: Action[] = [];
    for (let points = 0; points <= max; points += 1) buys.push({ type: 'PUB_BUY', points });
    return buys;
  }
  if (state.pendingDraw) {
    const card = state.pendingDraw.card;
    const resolves: Action[] = [{ type: 'OBSERVATORY_RESOLVE', choice: 'discard' }];
    if (player.hand.length < handLimit(player)) resolves.push({ type: 'OBSERVATORY_RESOLVE', choice: 'hand' });
    if (card.kind === 'trading') {
      for (const target of legalDisplaceTargets(player, card, state.observatoryUsed)) {
        if (player.rubles >= displacementCost(player, card, target, undefined)) {
          resolves.push({ type: 'OBSERVATORY_RESOLVE', choice: 'buy', displace: target.id });
        }
      }
    } else if (player.rubles >= handCost(player, card)) {
      resolves.push({ type: 'OBSERVATORY_RESOLVE', choice: 'buy' });
    }
    return resolves;
  }

  const actions: Action[] = [{ type: 'PASS' }];
  const canAdd = player.hand.length < handLimit(player);
  // Observatory (pg. 8): in the building phase, an owner of an unflipped Observatory may draw the top of
  // any stack that has ≥2 cards ("not the last card"), instead of a normal action.
  if (state.phase === 'building' && unusedObservatories(player, state.observatoryUsed).length > 0) {
    for (const kind of CARD_KINDS as readonly CardKind[]) {
      if (state.board.stacks[kind].length >= 2) actions.push({ type: 'OBSERVATORY_DRAW', stack: kind });
    }
  }
  for (const row of ['upper', 'lower'] as const) {
    state.board[row].forEach((card, index) => {
      if (card.kind === 'trading') {
        // A trading card is buyable once per legal displacement target the seat can afford (pg. 7).
        for (const target of legalDisplaceTargets(player, card, state.observatoryUsed)) {
          if (player.rubles >= displacementCost(player, card, target, row)) {
            actions.push({ type: 'BUY', row, index, displace: target.id });
          }
        }
      } else if (player.rubles >= effectiveCost(player, card, row)) {
        actions.push({ type: 'BUY', row, index });
      }
      if (canAdd) actions.push({ type: 'ADD_TO_HAND', row, index }); // free; any card, trading included
    });
  }
  // PLAY_FROM_HAND — own hand only. A trading card is playable once per affordable displacement target.
  player.hand.forEach((card, index) => {
    if (card.kind === 'trading') {
      for (const target of legalDisplaceTargets(player, card, state.observatoryUsed)) {
        if (player.rubles >= displacementCost(player, card, target, undefined)) {
          actions.push({ type: 'PLAY_FROM_HAND', index, displace: target.id });
        }
      }
    } else if (player.rubles >= handCost(player, card)) {
      actions.push({ type: 'PLAY_FROM_HAND', index });
    }
  });
  return actions;
}
