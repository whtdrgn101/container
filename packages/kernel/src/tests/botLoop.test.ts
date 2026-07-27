import { describe, expect, it, vi } from 'vitest';
import { runBotLoop, type BotLoopState } from '../botLoop';

/**
 * Unit coverage for the game-agnostic bot drive-loop. Before Track D this code lived in
 * `backend/src/botLoop.ts` and was exercised only *indirectly* by the backend integration suite — no
 * dedicated test moved with it because none existed. Now that it lives under the kernel's 100% gate it
 * gets one: every branch (each early-return, each `preStep` outcome, the ordinary step, and the runaway
 * throw) is driven here with a fake state store, so a regression fails at the unit level.
 */
interface FakeState extends BotLoopState {
  readonly status: string;
  readonly players: readonly { readonly id: string }[];
  readonly activePlayerIndex: number;
}

const makeState = (over: Partial<FakeState> = {}): FakeState => ({
  status: 'active',
  players: [{ id: 'p1' }, { id: 'p2' }],
  activePlayerIndex: 0,
  ...over,
});

describe('runBotLoop', () => {
  it('is a no-op when the game is gone', () => {
    const step = vi.fn();
    runBotLoop<FakeState>({ gameId: 'g', maxSteps: 5, label: 'X', get: () => undefined, botSeats: () => ['p1'], step });
    expect(step).not.toHaveBeenCalled();
  });

  it('is a no-op on a finished game', () => {
    const step = vi.fn();
    runBotLoop<FakeState>({
      gameId: 'g',
      maxSteps: 5,
      label: 'X',
      get: () => makeState({ status: 'ended' }),
      botSeats: () => ['p1'],
      step,
    });
    expect(step).not.toHaveBeenCalled();
  });

  it('is a no-op when there are no bots', () => {
    const step = vi.fn();
    runBotLoop<FakeState>({ gameId: 'g', maxSteps: 5, label: 'X', get: () => makeState(), botSeats: () => [], step });
    expect(step).not.toHaveBeenCalled();
  });

  it('stops when it is a human seat’s turn', () => {
    const step = vi.fn();
    // Active seat is p2, but only p1 is a bot → human on the clock.
    runBotLoop<FakeState>({
      gameId: 'g',
      maxSteps: 5,
      label: 'X',
      get: () => makeState({ activePlayerIndex: 1 }),
      botSeats: () => ['p1'],
      step,
    });
    expect(step).not.toHaveBeenCalled();
  });

  it('stops when the active index is out of range', () => {
    const step = vi.fn();
    runBotLoop<FakeState>({
      gameId: 'g',
      maxSteps: 5,
      label: 'X',
      get: () => makeState({ activePlayerIndex: 9 }),
      botSeats: () => ['p1'],
      step,
    });
    expect(step).not.toHaveBeenCalled();
  });

  it('plays the active bot seat, then stops once a human is on the clock', () => {
    let state = makeState({ activePlayerIndex: 0 }); // p1 (a bot) to act
    const step = vi.fn(() => {
      state = makeState({ activePlayerIndex: 1 }); // hands the turn to p2 (a human)
    });
    runBotLoop<FakeState>({ gameId: 'g', maxSteps: 5, label: 'X', get: () => state, botSeats: () => ['p1'], step });
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('plays several consecutive bot seats until the game ends', () => {
    let calls = 0;
    let state = makeState({ activePlayerIndex: 0 });
    const step = vi.fn(() => {
      calls += 1;
      state = calls === 1 ? makeState({ activePlayerIndex: 1 }) : makeState({ status: 'ended' });
    });
    runBotLoop<FakeState>({
      gameId: 'g',
      maxSteps: 5,
      label: 'X',
      get: () => state,
      botSeats: () => ['p1', 'p2'],
      step,
    });
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('stops without stepping when preStep reports a human owes a move (waiting)', () => {
    const step = vi.fn();
    const preStep = vi.fn(() => 'waiting' as const);
    runBotLoop<FakeState>({
      gameId: 'g',
      maxSteps: 5,
      label: 'X',
      get: () => makeState(),
      botSeats: () => ['p1'],
      preStep,
      step,
    });
    expect(preStep).toHaveBeenCalledTimes(1);
    expect(step).not.toHaveBeenCalled();
  });

  it('loops again on a preStep step, then falls through to the ordinary turn on idle', () => {
    let n = 0;
    const preStep = vi.fn(() => (n++ === 0 ? ('stepped' as const) : ('idle' as const)));
    let state = makeState({ activePlayerIndex: 0 });
    const step = vi.fn(() => {
      state = makeState({ status: 'ended' });
    });
    runBotLoop<FakeState>({
      gameId: 'g',
      maxSteps: 5,
      label: 'X',
      get: () => state,
      botSeats: () => ['p1'],
      preStep,
      step,
    });
    expect(preStep).toHaveBeenCalledTimes(2); // 'stepped' (re-loop) then 'idle' (fall through)
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('throws loudly when maxSteps is exhausted with no human ever on the clock', () => {
    const step = vi.fn(); // never advances the state → a cycling policy
    expect(() =>
      runBotLoop<FakeState>({
        gameId: 'g',
        maxSteps: 3,
        label: 'Runaway',
        get: () => makeState(),
        botSeats: () => ['p1'],
        step,
      }),
    ).toThrow(/Runaway bot runner exceeded 3 steps for game "g" — a policy is likely cycling/);
    expect(step).toHaveBeenCalledTimes(3);
  });
});
