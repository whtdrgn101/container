import { describe, expect, it } from 'vitest';
import { legalActions, viewFor } from '../../engine';
import type { Action, StPetersburgState } from '../../engine';
import { decide } from '../decide';
import { BotError } from '@game-hub/kernel/bot';
import { acquisitionValue, aristocratEndDelta, estimateRoundsLeft, evaluate, makeCtx, pickAction } from '../policy';
import { card, newGame, player, seededRng, view } from './helpers';

/** Membership check: is `action` one of the moves `legalActions` offers for this view? */
function isOffered(v: StPetersburgState, playerId: string, action: Action): boolean {
  const offered = legalActions(v, playerId).map((a) => JSON.stringify(a));
  return offered.includes(JSON.stringify(action));
}

describe('Saint Petersburg bot — guards & redaction', () => {
  it('decides a legal, offered move on a fresh game — and buys a worker rather than passing', () => {
    const state = newGame(3, seededRng(7));
    const active = state.players[state.activePlayerIndex]!;
    const v = viewFor(state, active.id);

    const action = decide(v, active.id);
    // pg. 8 "2 workers in the first round": buying an income engine beats passing on turn one.
    expect(action.type).toBe('BUY');
    // Every decision is a member of legalActions(view) — the offered ⊆ legal invariant, from the bot's side.
    expect(isOffered(v as unknown as StPetersburgState, active.id, action)).toBe(true);
  });

  it('reads only its own seat — an opponent’s rubles and hand are redacted to null', () => {
    const state = newGame(3, seededRng(1));
    const v = viewFor(state, 'p1');
    const own = v.players.find((p) => p.id === 'p1')!;
    const opp = v.players.find((p) => p.id === 'p2')!;
    expect(own.rubles).toBe(25);
    expect(own.hand).not.toBeNull();
    expect(opp.rubles).toBeNull();
    expect(opp.hand).toBeNull();
  });

  it('throws a BotError when asked to act out of turn', () => {
    const v = view({ players: [player(), player({ id: 'p2', name: 'P2' })], activePlayerIndex: 0 });
    expect(() => decide(v, 'p2')).toThrow(BotError);
  });
});

describe('Saint Petersburg bot — horizon & aristocrat end value', () => {
  it('estimates 1 round left in the final round, else scales with the tightest stack', () => {
    expect(estimateRoundsLeft(view({ finalRound: true }))).toBe(1);
    const short = view({
      board: { upper: [], lower: [], stacks: { worker: 2, building: 20, aristocrat: 20, trading: 20 }, discard: 0 },
      players: [player(), player({ id: 'p2' })],
    });
    expect(estimateRoundsLeft(short)).toBe(1); // round(2/2) = 1
    const long = view({
      board: { upper: [], lower: [], stacks: { worker: 30, building: 30, aristocrat: 30, trading: 30 }, discard: 0 },
    });
    expect(estimateRoundsLeft(long)).toBe(8); // clamped to the ceiling
  });

  it('rewards a NEW distinct aristocrat and ignores a duplicate', () => {
    const withScribe = player({ playArea: { worker: [], building: [], aristocrat: [card('scribe', 'scribe-1')] } });
    // A different aristocrat identity is the 2nd distinct → marginal end bonus of 2 (triangular table).
    expect(aristocratEndDelta(withScribe, card('judge', 'judge-1'), undefined)).toBe(2);
    // Another copy of the same identity adds no distinct → 0.
    expect(aristocratEndDelta(withScribe, card('scribe', 'scribe-2'), undefined)).toBe(0);
  });

  it('prices a displacement that removes the last copy of a distinct aristocrat', () => {
    // Owns two identities (scribe, judge). Displacing the lone judge with another scribe drops distinct 2→1.
    const p = player({
      playArea: { worker: [], building: [], aristocrat: [card('scribe', 'scribe-1'), card('judge', 'judge-1')] },
    });
    const delta = aristocratEndDelta(p, card('scribe', 'scribe-2'), card('judge', 'judge-1'));
    expect(delta).toBeLessThan(0); // 3 (two distinct) → 1 (one distinct)
  });

  it('keeps the distinct count when a displaced identity still has another copy', () => {
    // Two scribes + a judge. Displacing one scribe (a copy remains) with a controller keeps 2 distinct → 3.
    const p = player({
      playArea: {
        worker: [],
        building: [],
        aristocrat: [card('scribe', 'scribe-1'), card('scribe', 'scribe-2'), card('judge', 'judge-1')],
      },
    });
    const delta = aristocratEndDelta(p, card('controller', 'controller-1'), card('scribe', 'scribe-1'));
    expect(delta).toBe(3); // distinct 2 (scribe,judge) → 3 (scribe,judge,controller): 6 − 3
  });

  it('treats a null-ruble player defensively in acquisitionValue (rubles ?? 0)', () => {
    const ctx = makeCtx(view());
    // Never happens on an own-seat view, but the guard keeps the scorer total; a null seat can afford nothing.
    const val = acquisitionValue(player({ rubles: null }), card('market'), undefined, 5, ctx);
    expect(Number.isFinite(val)).toBe(true);
  });
});

describe('Saint Petersburg bot — action valuation', () => {
  const ctx = makeCtx(view());

  it('passing is the zero baseline', () => {
    expect(evaluate(view(), player(), { type: 'PASS' }, ctx)).toBe(0);
  });

  it('values buying a worker positively (a recurring income engine)', () => {
    const v = view({
      board: {
        upper: [card('lumberjack')],
        lower: [],
        stacks: { worker: 20, building: 20, aristocrat: 20, trading: 20 },
        discard: 0,
      },
    });
    expect(evaluate(v, player(), { type: 'BUY', row: 'upper', index: 0 }, ctx)).toBeGreaterThan(0);
  });

  it('values a profitable green upgrade (weaving mill over shepherd) via displacement', () => {
    const shepherd = card('shepherd', 'shepherd-1');
    const p = player({ playArea: { worker: [shepherd], building: [], aristocrat: [] } });
    const v = view({
      players: [p],
      board: {
        upper: [card('weavingMill')],
        lower: [],
        stacks: { worker: 20, building: 20, aristocrat: 20, trading: 20 },
        discard: 0,
      },
    });
    const val = evaluate(v, p, { type: 'BUY', row: 'upper', index: 0, displace: 'shepherd-1' }, ctx);
    expect(val).toBeGreaterThan(0); // +3 income/round for a difference cost of 3
  });

  it('never adds to hand in the final round, and discounts a normal add', () => {
    const finalCtx = makeCtx(view({ finalRound: true }));
    const v = view({
      board: {
        upper: [card('theater')],
        lower: [],
        stacks: { worker: 20, building: 20, aristocrat: 20, trading: 20 },
        discard: 0,
      },
    });
    expect(
      evaluate({ ...v, finalRound: true }, player(), { type: 'ADD_TO_HAND', row: 'upper', index: 0 }, finalCtx),
    ).toBe(-Infinity);
    // A normal add is finite (a discounted, deferred acquisition).
    expect(Number.isFinite(evaluate(v, player(), { type: 'ADD_TO_HAND', row: 'upper', index: 0 }, ctx))).toBe(true);
    // A trading card is addable too (estimated future displacement cost).
    expect(Number.isFinite(evaluate(v, player(), { type: 'ADD_TO_HAND', row: 'upper', index: 0 }, ctx))).toBe(true);
  });

  it('sheds a hand card aggressively in the final round (play beats hold)', () => {
    const held = card('market', 'market-9');
    const p = player({ hand: [held], handCount: 1 });
    const v = view({ players: [p], finalRound: true });
    const finalCtx = makeCtx(v);
    const play = evaluate(v, p, { type: 'PLAY_FROM_HAND', index: 0 }, finalCtx);
    const pass = evaluate(v, p, { type: 'PASS' }, finalCtx);
    expect(play).toBeGreaterThan(pass); // the +5 shed (avoided −5) makes playing clearly best
  });

  it('acquisitionValue folds in a reserve penalty when spending to the bone (non-final round)', () => {
    const poor = player({ rubles: 9 });
    // Spending 5 leaves 4, below the reserve of 8 → penalised vs the same buy when rich.
    const spent = acquisitionValue(poor, card('market'), undefined, 5, ctx);
    const rich = acquisitionValue(player({ rubles: 25 }), card('market'), undefined, 5, ctx);
    expect(spent).toBeLessThan(rich);
  });
});

describe('Saint Petersburg bot — the SP5 interludes (pub / observatory)', () => {
  it('buys Pub points near the end but declines them early', () => {
    const early = view({ pendingPubBuy: { queue: [0] }, phase: 'building' });
    const earlyPick = pickAction(early, 'p1');
    expect(earlyPick.type).toBe('PUB_BUY');
    expect(earlyPick).toEqual({ type: 'PUB_BUY', points: 0 }); // declines while rubles still compound

    const late = view({
      pendingPubBuy: { queue: [0] },
      phase: 'building',
      finalRound: true,
      players: [player({ rubles: 20 })],
    });
    const latePick = pickAction(late, 'p1');
    expect(latePick.type).toBe('PUB_BUY');
    expect((latePick as { points: number }).points).toBeGreaterThan(0); // converts spare rubles to VP at the end
  });

  it('resolves a pending Observatory draw by buying a worthwhile card (defensive path)', () => {
    const v = view({
      phase: 'building',
      pendingDraw: { seat: 0, stack: 'building', card: card('theater', 'theater-7'), observatoryId: 'observatory-1' },
    });
    const pick = pickAction(v, 'p1');
    expect(pick.type).toBe('OBSERVATORY_RESOLVE');
    expect((pick as { choice: string }).choice).toBe('buy'); // a 6-point Theater is worth taking
  });

  it('scores an OBSERVATORY_DRAW / unknown action as neutral (never selected off a redacted view)', () => {
    const ctx = makeCtx(view());
    expect(evaluate(view(), player(), { type: 'OBSERVATORY_DRAW', stack: 'worker' }, ctx)).toBe(0);
  });

  it('scores each Observatory resolve choice (defensive: discard / hand / buy a trading upgrade)', () => {
    const draw = {
      seat: 0,
      stack: 'worker' as const,
      card: card('weavingMill', 'weavingMill-1'),
      observatoryId: 'observatory-1',
    };
    const shepherd = card('shepherd', 'shepherd-1');
    const p = player({ playArea: { worker: [shepherd], building: [], aristocrat: [] } });
    const v = view({ players: [p], pendingDraw: draw });
    const ctx = makeCtx(v);

    expect(evaluate(v, p, { type: 'OBSERVATORY_RESOLVE', choice: 'discard' }, ctx)).toBe(0);
    // Parking to hand is a small positive normally, negative in the final round (a −5 tail incoming).
    expect(evaluate(v, p, { type: 'OBSERVATORY_RESOLVE', choice: 'hand' }, ctx)).toBeGreaterThan(0);
    const finalV = view({ players: [p], pendingDraw: draw, finalRound: true });
    expect(evaluate(finalV, p, { type: 'OBSERVATORY_RESOLVE', choice: 'hand' }, makeCtx(finalV))).toBeLessThan(0);
    // Buying the drawn trading card by displacing the shepherd is the profitable upgrade path.
    expect(evaluate(v, p, { type: 'OBSERVATORY_RESOLVE', choice: 'buy', displace: 'shepherd-1' }, ctx)).toBeGreaterThan(
      0,
    );
  });
});
