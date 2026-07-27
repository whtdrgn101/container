import { GameError, handLimit } from '../core';
import type { Card, StPetersburgState } from '../core';
import {
  nextSeatIndex,
  placeInPlayArea,
  record,
  seatOf,
  unusedObservatories,
  validateDisplacement,
  withPlayer,
} from '../internal';
import { displacementCost, handCost } from './buy';

/**
 * Use the **Observatory** (pg. 8, SP5): once per round, during the building phase, **instead of a normal
 * action**, its owner may draw the top card of a chosen stack and must immediately deal with it. The draw
 * is the first half; it locks the seat's turn with a `pendingDraw`, and `OBSERVATORY_RESOLVE` completes it.
 *
 * Constraints (pg. 8):
 *  - Only in the **building phase** ("during the blue actions") and only if the seat owns an **unflipped**
 *    Observatory — else `OBSERVATORY_UNAVAILABLE`.
 *  - The chosen `stack` "may not be the last card in the stack" — it needs **≥2 cards** to draw one (else
 *    `STACK_TOO_SMALL`).
 *
 * **Visibility ruling (documented):** the drawn card is popped from a stack — otherwise a secret (pg. 2) —
 * but the Observatory draw happens openly at the table, exactly like an SP3 hand *take*. So the card is
 * **public the moment it's drawn**: it rides in `pendingDraw` (revealed by `viewFor`, never redacted) and
 * the log names it. Whichever way it resolves — bought, discarded (both plainly public), or taken to hand
 * — everyone saw *which* card it was; a to-hand card then merges into the secret hand set afterward exactly
 * as an SP3 take does (opponents keep only the count going forward). Nothing hidden is leaked.
 *
 * Turn handling: the draw does **not** advance the turn (the seat is locked); `OBSERVATORY_RESOLVE` resets
 * the pass counter and passes the turn — the draw+resolve together are one action. It does **not** set
 * `tookCardThisPhase`: the card came from a *stack*, not the board rows, so the pg. 8 board-refill gate
 * (about cards taken from the board) is untouched.
 */
export function observatoryDraw(state: StPetersburgState, playerId: string, stack: Card['kind']): StPetersburgState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (state.phase !== 'building') {
    throw new GameError('OBSERVATORY_UNAVAILABLE', 'The Observatory may only be used in the building phase (pg. 8)');
  }
  const available = unusedObservatories(player, state.observatoryUsed);
  const observatory = available[0];
  if (!observatory) {
    throw new GameError('OBSERVATORY_UNAVAILABLE', 'You own no unflipped Observatory to use this round (pg. 8)');
  }
  const drawStack = state.board.stacks[stack];
  if (drawStack.length < 2) {
    throw new GameError('STACK_TOO_SMALL', `The ${stack} stack has no card to draw but its last (pg. 8)`);
  }

  const [card, ...rest] = drawStack;
  const after: StPetersburgState = {
    ...state,
    board: { ...state.board, stacks: { ...state.board.stacks, [stack]: rest } },
    pendingDraw: { seat, stack, card: card!, observatoryId: observatory.id },
  };
  // The seat stays on the clock (turn locked); no counter changes until the draw resolves.
  return record(after, 'OBSERVATORY_DRAW', playerId, {}, { stack, cardName: card!.name });
}

/**
 * Resolve a pending **Observatory** draw (pg. 8): the owner must immediately **buy and place** the card
 * (paying — with the usual reductions but no lower-row discount, since it came from no row; a trading card
 * needs a `displace` target), **add it to his hand** (free, hand limit applies), or **discard** it. In
 * every case the Observatory flips (scores 0 this round, `observatoryUsed`), the turn's pass counter resets
 * and the turn passes on — the draw+resolve was this seat's whole action.
 */
export function observatoryResolve(
  state: StPetersburgState,
  playerId: string,
  choice: 'buy' | 'hand' | 'discard',
  displace?: string,
): StPetersburgState {
  const pending = state.pendingDraw;
  if (!pending) {
    throw new GameError('NO_DRAW_PENDING', 'No Observatory draw is awaiting a decision');
  }
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const card = pending.card;

  // The Observatory flips regardless of the choice ("in each case, he turns the observatory card over").
  const observatoryUsed = [...state.observatoryUsed, pending.observatoryId];
  const base = {
    consecutivePasses: 0,
    activePlayerIndex: nextSeatIndex(state),
    observatoryUsed,
    pendingDraw: undefined,
  } satisfies Partial<StPetersburgState>;

  if (choice === 'discard') {
    const after: StPetersburgState = { ...state, board: { ...state.board, discard: state.board.discard + 1 } };
    return record(after, 'OBSERVATORY_RESOLVE', playerId, base, { choice, cardName: card.name });
  }

  if (choice === 'hand') {
    if (player.hand.length >= handLimit(player)) {
      throw new GameError('HAND_FULL', `Your hand is full (limit ${handLimit(player)} cards)`);
    }
    const updated = { ...player, hand: [...player.hand, card] };
    const after: StPetersburgState = { ...state, players: withPlayer(state, seat, updated) };
    return record(after, 'OBSERVATORY_RESOLVE', playerId, base, { choice, cardName: card.name });
  }

  if (choice === 'buy') {
    let displaced: Card | undefined;
    let cost: number;
    if (card.kind === 'trading') {
      if (displace === undefined) {
        throw new GameError(
          'DISPLACE_REQUIRED',
          `${card.name} is a trading card — name a card of yours to displace (pg. 7)`,
        );
      }
      displaced = validateDisplacement(player, card, displace, state.observatoryUsed);
      cost = displacementCost(player, card, displaced, undefined);
    } else {
      if (displace !== undefined) {
        throw new GameError(
          'DISPLACE_NOT_ALLOWED',
          `${card.name} is not a trading card — it displaces nothing (pg. 7)`,
        );
      }
      cost = handCost(player, card); // drawn from no row → base reductions only, min 1 (Potjomkin pays 2)
    }
    if (player.rubles < cost) {
      throw new GameError('INSUFFICIENT_RUBLES', `${card.name} costs ${cost} ruble(s); you have ${player.rubles}`);
    }
    const { playArea, discarded } = placeInPlayArea(player.playArea, card, displaced);
    const updated = { ...player, rubles: player.rubles - cost, playArea };
    const after: StPetersburgState = {
      ...state,
      players: withPlayer(state, seat, updated),
      board: discarded ? { ...state.board, discard: state.board.discard + discarded } : state.board,
    };
    return record(after, 'OBSERVATORY_RESOLVE', playerId, base, {
      choice,
      cardName: card.name,
      cost,
      ...(displaced ? { displacedName: displaced.name } : {}),
    });
  }

  throw new GameError('INVALID_RESOLVE_CHOICE', `Unknown Observatory choice "${String(choice)}"`);
}
