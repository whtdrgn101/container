import { describe, expect, it } from 'vitest';
import {
  FACTORY_ACTIONS,
  factoryAction,
  GAP_LANE_INDICES,
  INDUSTRY_END,
  INDUSTRY_GAPS,
  INDUSTRY_LANE,
  industryPointsAt,
} from '../core';
import type { Industry } from '../core';
import {
  advanceWrench,
  allGapsFilled,
  firstUnfilledGap,
  gapOrdinal,
  industryScore,
  placeFactoryInGap,
  replaceFactoryInSlot,
  scoreIndustry,
  triggerEffect,
} from '../internal';
import { newGame } from './helpers';

/** An industry track with a given wrench index and gap fills (short-hand: `-` = unfilled). */
function industry(wrench: number, factories: (number | null)[] = [null, null, null, null, null]): Industry {
  return { wrench, factories };
}

describe('industry track layout (pg. 6 art, pg. 13)', () => {
  it('has 5 gaps at the read lane indices, START at 0 and END past the last gap', () => {
    expect(INDUSTRY_GAPS).toBe(5);
    expect(GAP_LANE_INDICES).toEqual([5, 7, 9, 11, 13]);
    expect(INDUSTRY_LANE[0]).toEqual({ kind: 'space', points: 0 }); // START
    expect(INDUSTRY_END).toBe(INDUSTRY_LANE.length - 1);
    // The first 4 spaces after START read 1 / 2 / 3 / 5 (pg. 13 "after the first 4 spaces … a gap").
    expect(INDUSTRY_LANE.slice(1, 5)).toEqual([
      { kind: 'space', points: 1 },
      { kind: 'space', points: 2 },
      { kind: 'space', points: 3 },
      { kind: 'space', points: 5 },
    ]);
    // idx 10 is the numberless landing space; the end space is 50.
    expect(INDUSTRY_LANE[10]).toEqual({ kind: 'space', points: null });
    expect(INDUSTRY_LANE[INDUSTRY_END]).toEqual({ kind: 'space', points: 50 });
  });

  it('scores the wrench space, or the previous numbered space on a factory/numberless space (pg. 21)', () => {
    expect(industryPointsAt(0)).toBe(0); // START
    expect(industryPointsAt(4)).toBe(5); // the "5" space
    expect(industryPointsAt(6)).toBe(10);
    // pg. 21 example VERBATIM: the wrench is on a factory (the first gap, lane 5) — no points there, so it
    // scores the previous space, which is 5 points.
    expect(industryPointsAt(5)).toBe(5);
    // The numberless space (lane 10) scores its previous number, 15.
    expect(industryPointsAt(10)).toBe(15);
    expect(industryPointsAt(INDUSTRY_END)).toBe(50);
    expect(industryPointsAt(-1)).toBe(0); // defensive: a wrench before START scores nothing
  });

  it('gapOrdinal maps a gap lane index to its slot (else −1)', () => {
    expect(gapOrdinal(5)).toBe(0);
    expect(gapOrdinal(13)).toBe(4);
    expect(gapOrdinal(4)).toBe(-1); // a numbered space, not a gap
  });
});

describe('factory actions (pg. 13, 48 — the art ruling)', () => {
  it('reads #2/#3 as track moves, #6 as a coin, and the rest as inert', () => {
    expect(FACTORY_ACTIONS[2]).toEqual({ kind: 'moveTrack', count: 1 });
    expect(FACTORY_ACTIONS[6]).toEqual({ kind: 'coins', count: 1 });
    expect(FACTORY_ACTIONS[4]!.kind).toBe('inert');
    // A number outside the table is inert too (never gates a build).
    expect(factoryAction(11).kind).toBe('inert');
    expect(factoryAction(3)).toEqual({ kind: 'moveTrack', count: 1 });
  });

  it('triggerEffect: coins are choiceless, track moves become credits, inert yields nothing', () => {
    expect(triggerEffect(6)).toEqual({ coins: 1, move: null });
    expect(triggerEffect(2)).toEqual({ coins: 0, move: { count: 1, colors: ['wood', 'green', 'bronze', 'silver', 'gold'] } });
    expect(triggerEffect(4)).toEqual({ coins: 0, move: null });
  });
});

describe('wrench movement (pg. 13–14)', () => {
  it('advances the wrench across numbered spaces', () => {
    expect(advanceWrench(industry(0), 1)).toEqual({ wrench: 1, triggered: [] }); // pg. 13 "advance 1 space"
    expect(advanceWrench(industry(0), 2).wrench).toBe(2);
    // Advance the whole first run up to the 5-space (lane 4).
    expect(advanceWrench(industry(0), 4).wrench).toBe(4);
  });

  it('cannot move onto or skip an unfilled gap (pg. 13) — a blocked advance moves 0', () => {
    // Wrench on the 5-space (lane 4); the next lane entry is the (unfilled) first gap.
    expect(advanceWrench(industry(4), 2)).toEqual({ wrench: 4, triggered: [] });
  });

  it('moves onto a factory once its gap is filled and triggers it (pg. 13 example verbatim)', () => {
    // "You move 2 spaces. The first move lands on a factory. You resolve the action on that factory. You
    // then continue to the next space." — a #2 factory fills the first gap.
    const withFactory = industry(4, [2, null, null, null, null]);
    expect(advanceWrench(withFactory, 2)).toEqual({ wrench: 6, triggered: [2] });
  });

  it('never advances past the end space', () => {
    expect(advanceWrench(industry(INDUSTRY_END, [2, 2, 2, 2, 2]), 3).wrench).toBe(INDUSTRY_END);
  });
});

describe('gap fills (pg. 12)', () => {
  it('firstUnfilledGap / allGapsFilled track the left-to-right fill', () => {
    expect(firstUnfilledGap(industry(0))).toBe(0);
    expect(firstUnfilledGap(industry(0, [2, 3, null, null, null]))).toBe(2);
    expect(allGapsFilled(industry(0))).toBe(false);
    expect(firstUnfilledGap(industry(0, [2, 3, 4, 5, 6]))).toBe(-1);
    expect(allGapsFilled(industry(0, [2, 3, 4, 5, 6]))).toBe(true);
  });

  it('placeFactoryInGap fills the leftmost gap; replaceFactoryInSlot swaps and reports the replaced', () => {
    expect(placeFactoryInGap(industry(0, [2, null, null, null, null]), 3).factories).toEqual([2, 3, null, null, null]);
    const { industry: after, replaced } = replaceFactoryInSlot(industry(0, [2, 3, 4, 5, 6]), 1, 9);
    expect(replaced).toBe(3);
    expect(after.factories).toEqual([2, 9, 4, 5, 6]);
  });
});

describe('industry scoring (pg. 21)', () => {
  it('industryScore / scoreIndustry read the wrench position', () => {
    expect(industryScore(industry(0))).toBe(0); // never industrialized → START → 0
    expect(industryScore(industry(6))).toBe(10);
    const player = { ...newGame(2).players[0]!, industry: industry(5, [2, null, null, null, null]) };
    expect(scoreIndustry(player)).toBe(5); // on the first-gap factory → previous space (pg. 21)
  });
});
