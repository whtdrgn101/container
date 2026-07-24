import { describe, expect, it } from 'vitest';
import type { MoveRecord, StPetersburgState } from '@game-hub/engine/stpetersburg';
import { decide } from '../decide';
import { playSelfPlay } from '../selfPlay';
import { newGame, seededRng } from './helpers';

/** The behavioural paths a sensible policy must collectively exercise across the seeded games. */
interface Behaviours {
  upperBuy: boolean;
  lowerBuy: boolean;
  addToHand: boolean;
  playFromHand: boolean;
  displacement: boolean;
}

function scanLog(log: readonly MoveRecord[], into: Behaviours): void {
  for (const entry of log) {
    if (entry.type === 'BUY' && entry.payload?.row === 'upper') into.upperBuy = true;
    if (entry.type === 'BUY' && entry.payload?.row === 'lower') into.lowerBuy = true;
    if (entry.type === 'ADD_TO_HAND') into.addToHand = true;
    if (entry.type === 'PLAY_FROM_HAND') into.playFromHand = true;
    if ((entry.type === 'BUY' || entry.type === 'PLAY_FROM_HAND') && entry.payload?.displacedKey !== undefined) into.displacement = true;
  }
}

/** Cards left in hand at game end, summed across seats (each is −5, pg. 6). Read off revealed final state. */
function handCardsLeft(state: StPetersburgState): number {
  return state.players.reduce((sum, p) => sum + p.hand.length, 0);
}

describe('Saint Petersburg bot — self-play', () => {
  const seeds = [
    { players: 2, seed: 777 },
    { players: 3, seed: 7 },
    { players: 4, seed: 20260722 },
  ];

  const behaviours: Behaviours = { upperBuy: false, lowerBuy: false, addToHand: false, playFromHand: false, displacement: false };
  let totalHandCards = 0;
  let totalSeats = 0;

  for (const { players, seed } of seeds) {
    it(`plays a complete ${players}-player game to a real end (seed ${seed})`, () => {
      const result = playSelfPlay(newGame(players, seededRng(seed)));
      expect(result.completed).toBe(true);
      expect(result.state.status).toBe('ended');
      if (result.state.status !== 'ended') throw new Error('unreachable');
      expect(result.state.results.length).toBe(players);
      expect(result.state.winnerIds.length).toBeGreaterThanOrEqual(1);
      // The total is exactly the breakdown (a coherence check on the whole game the bot drove).
      for (const r of result.state.results) {
        expect(r.total).toBe(r.base + r.aristocrats + r.money - r.handPenalty);
      }

      scanLog(result.state.log, behaviours);
      totalHandCards += handCardsLeft(result.state);
      totalSeats += players;
    });
  }

  it('collectively exercises every sensible path and ends with tidy hands', () => {
    // "Plays sensibly" is tested, not hoped: a myopic hoarder that never buys engines or upgrades, or that
    // stuffs its hand, would fail these — fix the policy, not the assertion (the greedy-trap guard).
    expect(behaviours.upperBuy).toBe(true);
    expect(behaviours.lowerBuy).toBe(true);
    expect(behaviours.addToHand).toBe(true);
    expect(behaviours.playFromHand).toBe(true);
    expect(behaviours.displacement).toBe(true);
    // Hand penalty stays low — it sheds in the final round (≤1 card/seat on average, pg. 6's −5 tail).
    expect(totalHandCards / totalSeats).toBeLessThanOrEqual(1);
  });

  it('honours the maxRounds backstop and a per-seat policy override', () => {
    // A per-seat policies map (here mapping p1 to the live decide) is how a later benchmark pits policies;
    // maxRounds: 1 exercises the runaway backstop — the game is cut short, not ended.
    const policies = new Map([['p1', decide]]);
    const cut = playSelfPlay(newGame(2, seededRng(777)), { maxRounds: 1, policies });
    expect(cut.completed).toBe(false);
    expect(cut.state.status).toBe('active');
  });
});
