import type { Action, StPetersburgView } from '@game-hub/engine/stpetersburg';

/**
 * The shape of a Saint Petersburg decision policy — `decide`'s signature. **No options**: unlike the other
 * three games, Saint Petersburg needs no injected randomness to decide — it has no dice, and the
 * Observatory draw the greedy baseline never takes is deterministic anyway. Self-play accepts one policy
 * per seat so a later calibration slice can pit this frozen baseline against a retuned successor.
 */
export type DecideFn = (view: StPetersburgView, playerId: string) => Action;
