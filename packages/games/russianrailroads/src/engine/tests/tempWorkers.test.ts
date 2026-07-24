import { describe, expect, it } from 'vitest';
import { applyAction, place } from '../actions';
import { TEMP_WORKERS } from '../core';
import type { RussianRailroadsState } from '../core';
import { activeId, newGame } from './helpers';

/** The active seat with fields overridden. */
function withActive(state: RussianRailroadsState, patch: Partial<RussianRailroadsState['players'][number]>) {
  const active = state.activePlayerIndex;
  return { ...state, players: state.players.map((p, i) => (i === active ? { ...p, ...patch } : p)) };
}

describe('temporary workers (pg. 15)', () => {
  it('takes the 2 turquoise workers into the supply and passes the turn (cannot use them immediately)', () => {
    const state = newGame(2);
    const me = activeId(state);
    const before = state.players[state.activePlayerIndex]!;
    const next = place(state, me, 'temp-workers');
    const meNext = next.players.find((p) => p.id === me)!;
    expect(meNext.tempWorkers).toBe(TEMP_WORKERS);
    // Spent 1 worker placing, gained 2 temporary ones → net +1 available.
    expect(meNext.workersAvailable).toBe(before.workersAvailable - 1 + TEMP_WORKERS);
    expect(next.actionSpaces['temp-workers']).toEqual([{ ownerId: me, workers: 1, coins: 0 }]);
    expect(next.activePlayerIndex).not.toBe(state.activePlayerIndex); // the turn passes — not usable this turn
    expect(next.log[0]).toMatchObject({ type: 'PLACE', payload: { space: 'temp-workers', tempWorkers: TEMP_WORKERS } });
  });

  it('lets a seat place with temporary workers beyond its own worker total', () => {
    // A seat with only its 2 temporary workers left (no regular workers) can still act.
    const state = withActive(newGame(2), { workersAvailable: TEMP_WORKERS, tempWorkers: TEMP_WORKERS });
    const me = activeId(state);
    const next = place(state, me, 'coins');
    expect(next.players.find((p) => p.id === me)!.workersAvailable).toBe(TEMP_WORKERS - 1);
  });

  it('returns the temporary workers at round end (they never carry over)', () => {
    let state = newGame(2);
    const me = activeId(state);
    state = applyAction(state, me, { type: 'PLACE', space: 'temp-workers' }); // p1 takes the temp workers
    // Pass everyone out to close round 1.
    for (let i = 0; i < 2; i += 1) state = applyAction(state, activeId(state), { type: 'PASS' });
    expect(state.round).toBe(2);
    const meR2 = state.players.find((p) => p.id === me)!;
    expect(meR2.tempWorkers).toBe(0); // returned to their action space
    expect(meR2.workersAvailable).toBe(meR2.workersTotal); // and the supply is back to full (no extras)
  });
});
