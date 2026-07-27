import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions';
import type { Card, StPetersburgPlayer, StPetersburgState } from '../core';
import { advanceAfterScoring, aristocratScore, finalScoring, roundTransition, scorePlayer } from '../internal';
import { viewFor } from '../view';
import { card, expectError, makeState } from './helpers';

/** A distinct aristocrat instance (only its identity `key` matters for final scoring). */
function aristocrat(key: string, id = `${key}-1`): Card {
  return card({ id, key, kind: 'aristocrat', name: key, income: 0, points: 0 });
}

/** Pass as whichever seat is on the clock until the phase/round changes (or the game ends). */
function passOutPhase(g: StPetersburgState): StPetersburgState {
  const { round, phase } = g;
  while (g.status === 'active' && g.round === round && g.phase === phase) {
    g = applyAction(g, g.players[g.activePlayerIndex]!.id, { type: 'PASS' });
  }
  return g;
}

/** Pass whole phases out until the round rolls over or the game ends. */
function passOutRound(g: StPetersburgState): StPetersburgState {
  const round = g.round;
  while (g.status === 'active' && g.round === round) g = passOutPhase(g);
  return g;
}

describe('SP6 — final scoring (pg. 5–6)', () => {
  it("scorePlayer reproduces the rulebook's worked example — Red ends with 74 (pg. 6)", () => {
    // pg. 6: 6 different aristocrats → 21 points; "same aristocrats count nothing"; 17 rubles → 1 point;
    // no hand cards → no minus; 21 + 1 added to a banked 52 = 74.
    const player: StPetersburgPlayer = {
      id: 'p1',
      name: 'Red',
      rubles: 17,
      points: 52,
      playArea: {
        worker: [],
        building: [],
        aristocrat: [
          aristocrat('scribe'),
          aristocrat('administrator'),
          aristocrat('clerk'),
          aristocrat('secretary'),
          aristocrat('controller'),
          aristocrat('judge'),
          // Two duplicates ("same aristocrats count nothing") — distinct stays 6.
          aristocrat('scribe', 'scribe-2'),
          aristocrat('judge', 'judge-2'),
        ],
      },
      hand: [],
    };
    expect(scorePlayer(player)).toEqual({
      playerId: 'p1',
      base: 52,
      aristocrats: 21,
      distinctAristocrats: 6,
      money: 1,
      handPenalty: 0,
      total: 74,
    });
  });

  it('counts orange aristocrat trading cards as distinct aristocrats (pg. 5, "all different aristocrats")', () => {
    // An aristocrat trading card (e.g. the Abbot) lives in playArea.aristocrat and is a distinct identity.
    const player: StPetersburgPlayer = {
      id: 'p1',
      name: 'A',
      rubles: 0,
      points: 0,
      playArea: {
        worker: [],
        building: [],
        aristocrat: [
          aristocrat('scribe'),
          card({
            id: 'abbot-1',
            key: 'abbot',
            kind: 'trading',
            name: 'Abbot',
            tradingGroup: 'aristocrat',
            income: 1,
            points: 1,
          }),
        ],
      },
      hand: [],
    };
    const r = scorePlayer(player);
    expect(r.distinctAristocrats).toBe(2);
    expect(r.aristocrats).toBe(3); // ARISTOCRAT_SCORE[2]
  });

  it('scores money as 1 point per full 10 rubles, rounding down (pg. 6)', () => {
    const mk = (rubles: number) =>
      scorePlayer({
        id: 'p',
        name: 'p',
        rubles,
        points: 0,
        playArea: { worker: [], building: [], aristocrat: [] },
        hand: [],
      });
    expect(mk(9).money).toBe(0);
    expect(mk(29).money).toBe(2);
    expect(mk(30).money).toBe(3);
  });

  it('subtracts 5 points per hand card and does NOT clamp the total below zero (pg. 6)', () => {
    const r = scorePlayer({
      id: 'p',
      name: 'p',
      rubles: 3, // 0 money points
      points: 4, // small banked total
      playArea: { worker: [], building: [], aristocrat: [] },
      hand: [aristocrat('scribe'), aristocrat('clerk'), aristocrat('judge')], // 3 cards → −15
    });
    expect(r.handPenalty).toBe(15);
    expect(r.total).toBe(4 - 15); // −11, preserved (no invented clamp — the rulebook states none)
  });

  it('aristocratScore is the triangular table 1/3/6/10/15/21/28/36/45/55 and caps at 10 distinct', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(aristocratScore)).toEqual([0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55]);
    // The board table stops at 10; more distinct (possible only with the adapted orange trading deck) → 55.
    expect(aristocratScore(11)).toBe(55);
    expect(aristocratScore(17)).toBe(55);
  });
});

describe('SP6 — winners + tiebreak (pg. 6)', () => {
  const withPlayers = (specs: { rubles: number; points: number; aristocrats?: number }[]) =>
    makeState(
      {
        players: specs.map((s, i) => ({
          id: `p${i + 1}`,
          name: `p${i + 1}`,
          rubles: s.rubles,
          points: s.points,
          playArea: {
            worker: [],
            building: [],
            aristocrat: Array.from({ length: s.aristocrats ?? 0 }, (_, k) => aristocrat(`ar${k}`, `p${i + 1}-ar${k}`)),
          },
          hand: [],
        })),
      },
      specs.map((_, i) => `p${i + 1}`),
    );

  it('the highest total wins outright', () => {
    const end = finalScoring(
      withPlayers([
        { rubles: 0, points: 30 },
        { rubles: 0, points: 10 },
      ]),
    );
    expect(end.status).toBe('ended');
    expect(end.winnerIds).toEqual(['p1']);
    expect(end.results.map((r) => r.total)).toEqual([30, 10]);
  });

  it('a tie on total breaks by most rubles (pg. 6)', () => {
    // Both total 20, but p2 has more rubles left (rubles < 10 add no money points, so totals still tie).
    const end = finalScoring(
      withPlayers([
        { rubles: 3, points: 20 },
        { rubles: 9, points: 20 },
      ]),
    );
    expect(end.results.map((r) => r.total)).toEqual([20, 20]);
    expect(end.winnerIds).toEqual(['p2']);
  });

  it('a tie on total AND rubles is a shared win', () => {
    const end = finalScoring(
      withPlayers([
        { rubles: 5, points: 20 },
        { rubles: 5, points: 20 },
      ]),
    );
    expect(end.winnerIds).toEqual(['p1', 'p2']);
  });
});

describe('SP6 — the end trigger (pg. 5)', () => {
  it("a phase-handoff refill that places a group's last card arms finalRound (advanceAfterScoring)", () => {
    // Worker phase closing; a card was taken; the building stack holds exactly the number needed to fill the
    // board — the deal places the building group\'s LAST card → the final round is armed.
    const g = makeState({
      phase: 'worker',
      tookCardThisPhase: true,
      board: {
        upper: [card({ id: 'w', kind: 'worker' })],
        lower: [],
        stacks: {
          worker: [],
          building: [aristocrat('b', 'b1') as Card, aristocrat('b', 'b2') as Card],
          aristocrat: [],
          trading: [],
        },
        discard: 0,
      },
    });
    // need = 8 − 1 on board = 7, but the building stack has 2 → deal both, empties it → placedLast.
    const changes = advanceAfterScoring(g);
    expect(changes.finalRound).toBe(true);
    expect(changes.phase).toBe('building');
  });

  it('does NOT arm finalRound when the deal draws zero (stack already empty — dealing short, pg. 5)', () => {
    const g = makeState({
      phase: 'worker',
      tookCardThisPhase: true,
      board: {
        upper: [card({ id: 'w', kind: 'worker' })],
        lower: [],
        stacks: { worker: [], building: [], aristocrat: [], trading: [] },
        discard: 0,
      },
    });
    const changes = advanceAfterScoring(g);
    expect(changes.finalRound).toBe(false); // no card placed → not the trigger
  });

  it('does NOT arm finalRound when a deal leaves the stack non-empty', () => {
    const g = makeState({
      phase: 'worker',
      tookCardThisPhase: true,
      board: {
        upper: [],
        lower: [],
        stacks: {
          worker: [],
          building: Array.from({ length: 12 }, (_, i) => aristocrat('b', `b${i}`) as Card),
          aristocrat: [],
          trading: [],
        },
        discard: 0,
      },
    });
    const changes = advanceAfterScoring(g); // draws 8, 4 remain
    expect(changes.finalRound).toBe(false);
  });

  it('finalRound is sticky — it stays set through later phase handoffs', () => {
    const g = makeState({ phase: 'building', finalRound: true, tookCardThisPhase: false });
    expect(advanceAfterScoring(g).finalRound).toBe(true); // no refill this phase, but the flag persists
  });

  it('the between-rounds worker deal can arm finalRound — the NEW round is "this round" (pg. 5)', () => {
    // Trading closing, not yet final; the round-end worker deal empties the worker stack → the fresh round
    // that opens is the final round and will play out fully before the game ends.
    const g = makeState({
      phase: 'trading',
      finalRound: false,
      board: {
        upper: [],
        lower: [],
        stacks: {
          worker: [card({ id: 'w1', kind: 'worker' }), card({ id: 'w2', kind: 'worker' })],
          building: [],
          aristocrat: [],
          trading: [],
        },
        discard: 0,
      },
    });
    const changes = roundTransition(g);
    expect(changes.finalRound).toBe(true);
    expect(changes.round).toBe(g.round + 1); // the game rolled into the (final) new round, did not end
    expect(changes.phase).toBe('worker');
  });
});

describe('SP6 — ending the game through pass (pg. 5)', () => {
  /** A 2-player state at the final round\'s trading phase, one pass short of closing it. */
  const atFinalTradingClose = (over: Partial<StPetersburgState> = {}) =>
    makeState({
      phase: 'trading',
      finalRound: true,
      consecutivePasses: 1, // 2 players → one more consecutive pass closes the phase
      players: [
        {
          id: 'p1',
          name: 'Ann',
          rubles: 25,
          points: 40,
          playArea: {
            worker: [],
            building: [],
            aristocrat: [aristocrat('scribe', 'p1-a1'), aristocrat('clerk', 'p1-a2')],
          },
          hand: [],
        },
        {
          id: 'p2',
          name: 'Bob',
          rubles: 5,
          points: 10,
          playArea: { worker: [], building: [], aristocrat: [] },
          hand: [aristocrat('judge', 'p2-h1')],
        },
      ],
      ...over,
    });

  it('the final trading close ends the game into final scoring instead of a new round', () => {
    let g = atFinalTradingClose();
    const roundBefore = g.round;
    g = applyAction(g, g.players[g.activePlayerIndex]!.id, { type: 'PASS' });

    expect(g.status).toBe('ended');
    expect(g.round).toBe(roundBefore); // did NOT roll into a new round
    if (g.status !== 'ended') throw new Error('unreachable');
    // p1: base 40 + aristocrats(2 distinct = 3) + money(25→2) = 45. p2: base 10 + 0 + money(5→0) − hand(1×5) = 5.
    expect(g.results).toEqual([
      { playerId: 'p1', base: 40, aristocrats: 3, distinctAristocrats: 2, money: 2, handPenalty: 0, total: 45 },
      { playerId: 'p2', base: 10, aristocrats: 0, distinctAristocrats: 0, money: 0, handPenalty: 5, total: 5 },
    ]);
    expect(g.winnerIds).toEqual(['p1']);
    // A Pub interlude can never straddle the trading close — it opens and resolves inside the building phase.
    expect(g.pendingPubBuy).toBeUndefined();
    // The closing move is logged as a game-end (feed narration).
    expect(g.log.at(-1)).toMatchObject({ type: 'PASS', payload: { gameEnded: true, endedRound: roundBefore } });
  });

  it('a non-final trading close still rolls the round over (regression: only finalRound ends the game)', () => {
    let g = makeState({ phase: 'trading', finalRound: false, consecutivePasses: 1 });
    const roundBefore = g.round;
    g = applyAction(g, g.players[g.activePlayerIndex]!.id, { type: 'PASS' });
    expect(g.status).toBe('active');
    expect(g.round).toBe(roundBefore + 1);
  });

  it('refuses every action once ended (GAME_OVER) and legalActions is empty', () => {
    let g = atFinalTradingClose();
    g = applyAction(g, g.players[g.activePlayerIndex]!.id, { type: 'PASS' });
    expect(g.status).toBe('ended');
    expectError(() => applyAction(g, 'p1', { type: 'PASS' }), 'GAME_OVER');
  });

  it("viewFor reveals every seat's rubles and hand once the game has ended", () => {
    let g = atFinalTradingClose();
    // Before ending: an opponent\'s rubles + hand are redacted.
    const activeBefore = viewFor(g, 'p1');
    expect(activeBefore.players[1]!.rubles).toBeNull();
    expect(activeBefore.players[1]!.hand).toBeNull();

    g = applyAction(g, g.players[g.activePlayerIndex]!.id, { type: 'PASS' });
    expect(g.status).toBe('ended');

    // After ending: p1\'s view now sees p2\'s rubles and hand contents (final scoring is public, pg. 5).
    const after = viewFor(g, 'p1');
    expect(after.players[1]!.rubles).toBe(5);
    expect(after.players[1]!.hand).toHaveLength(1);
    if (after.status !== 'ended') throw new Error('unreachable');
    expect(after.winnerIds).toEqual(['p1']);
  });
});

describe('SP6 — a full game driven to a real end via applyAction', () => {
  it('runs the round loop until a group empties, plays out that final round, then ends', () => {
    // A 2-player game with all four stacks trimmed tiny (via makeState) so a group empties within a couple of
    // rounds of all-passing. Deterministic (no rng), so the end is reproducible and non-flaky.
    let g = makeState(
      {
        board: {
          upper: [card({ id: 'w1', kind: 'worker' }), card({ id: 'w2', kind: 'worker' })],
          lower: [],
          stacks: {
            worker: [card({ id: 'w3', kind: 'worker' }), card({ id: 'w4', kind: 'worker' })],
            building: [],
            aristocrat: [],
            trading: [],
          },
          discard: 0,
        },
      },
      ['Ann', 'Bob'],
    );

    let guard = 0;
    while (g.status === 'active' && guard < 50) {
      g = passOutRound(g);
      guard += 1;
    }
    expect(g.status).toBe('ended');
    if (g.status !== 'ended') throw new Error('unreachable');
    expect(g.results).toHaveLength(2);
    expect(g.winnerIds.length).toBeGreaterThanOrEqual(1);
    // Once armed, the game reached its final round before ending (round advanced past the first).
    expect(g.round).toBeGreaterThanOrEqual(1);
  });
});
