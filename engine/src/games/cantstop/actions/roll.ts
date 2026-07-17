import { DICE_COUNT, DIE_FACES, GameError } from '../core';
import type { CantStopState } from '../core';
import { legalSelections, record } from '../internal';

/** Validate the injected dice: exactly four whole faces of 1–6. Defensive — the route builds these. */
function assertValidDice(dice: readonly number[]): asserts dice is [number, number, number, number] {
  const valid =
    dice.length === DICE_COUNT &&
    dice.every((die) => Number.isInteger(die) && die >= 1 && die <= DIE_FACES);
  if (!valid) {
    throw new GameError('INVALID_ROLL', `A roll is ${DICE_COUNT} dice of 1–${DIE_FACES}, got [${dice.join(', ')}]`);
  }
}

/**
 * Roll the four dice (rules "Playing" step 1). The dice are injected — the engine stays pure — and
 * this only decides what the roll *means*: if no split of the dice can advance a runner, the player
 * has **blown it** (rules "Blowing It") and the turn ends with every runner discarded; otherwise the
 * roll waits for the player to pick a pairing (`phase: 'selecting'`).
 */
export function roll(
  state: CantStopState,
  playerId: string,
  dice: readonly [number, number, number, number],
): CantStopState {
  if (state.phase !== 'rolling') {
    throw new GameError('WRONG_PHASE', 'You must choose a pairing for your current dice before rolling again');
  }
  assertValidDice(dice);

  const rolled: CantStopState = { ...state, dice };
  if (legalSelections(rolled).length > 0) {
    return record(state, 'ROLL', playerId, { phase: 'selecting', dice }, { dice });
  }

  // Blown it: discard the turn's runners and pass to the next seat.
  const players = state.players.length;
  return record(
    state,
    'BUST',
    playerId,
    {
      runners: {},
      dice: null,
      phase: 'rolling',
      activePlayerIndex: (state.activePlayerIndex + 1) % players,
      turn: state.turn + 1,
    },
    { dice },
  );
}
