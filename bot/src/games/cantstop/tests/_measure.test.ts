import { describe, expect, it } from 'vitest';
import type { Action, CantStopView } from '@game-hub/engine/cantstop';
import { assertBotTurn } from '../../../kernel';
import type { DecideFn, DecideOptions } from '../types';
import { decide } from '../decide';
import { benchmark } from '../bench';
import { DIFFICULTIES, pickPairing, shouldRoll, type DifficultyParams } from '../policy';

// A decide that runs the raw policy under arbitrary params — for sweeping hard's urgency knobs.
const custom =
  (params: DifficultyParams): DecideFn =>
  (view: CantStopView, playerId: string, options: DecideOptions = {}): Action => {
    assertBotTurn(view, playerId);
    if (view.phase === 'selecting') return { type: 'SELECT', columns: pickPairing(view, params) };
    if (shouldRoll(view, params)) {
      if (!options.rollDice) throw new Error('no dice');
      return { type: 'ROLL', dice: options.rollDice() };
    }
    return { type: 'STOP' };
  };

const normal = custom(DIFFICULTIES.normal);

describe('measure', () => {
  it('sweeps hard urgency vs normal', () => {
    const games = 200;
    for (const boost of [0.7, 1.2, 2.0, 3.0]) {
      const params: DifficultyParams = { expectedAdvance: 1.75, claimBonus: 4, urgencyBoost: boost };
      const r = benchmark({ games, seats: 2, candidate: custom(params), baseline: normal });
      // eslint-disable-next-line no-console
      console.log(`boost=${boost}: win=${r.winRate.toFixed(3)} ci=[${r.ci95[0].toFixed(3)},${r.ci95[1].toFixed(3)}]`);
    }
    expect(true).toBe(true);
  }, 300000);
});
