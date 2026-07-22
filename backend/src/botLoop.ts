/**
 * The game-agnostic bot drive-loop, shared by every game's runner (REVIEW §3.4).
 *
 * All three runners were the same ~15 lines: while the active seat is an AI, decide + apply, guarded
 * by a `MAX_STEPS` runaway cap. Hoisting it here means the two behaviours that must never regress —
 * §1.1 (a throwing bot stalls only its own seat: the *containment* lives in `app.ts`'s `tick`) and
 * §1.4 (runaway exhaustion is **loud**, a thrown error, not a silent fall-out that re-spins on every
 * read) — live in exactly one place instead of three.
 *
 * ⚠️ This file imports **nothing** from `@game-hub/engine` — that's the C0 seam rule. The state it
 * touches is described structurally (`BotLoopState`), so the core never learns what any game is; each
 * runner supplies the genuinely per-game `step` (and Container its auction `preStep`).
 */

/** The only shape the loop reads off a game state. Every game's state satisfies it structurally. */
export interface BotLoopState {
  readonly status: string;
  readonly players: readonly { readonly id: string }[];
  readonly activePlayerIndex: number;
}

/**
 * What an optional pre-step reports back. Container's delivery auction outranks the ordinary turn:
 * everyone owes a sealed bid before the deliverer can act, so it runs ahead of the active-seat check.
 * - `'stepped'` — it advanced the flow by one unit of work; loop again.
 * - `'waiting'` — a human owes the next move in that flow; stop.
 * - `'idle'`    — nothing pending; fall through to the ordinary active-seat step.
 */
export type PreStepResult = 'stepped' | 'waiting' | 'idle';

export interface BotLoopOptions<S extends BotLoopState> {
  readonly gameId: string;
  /** Runaway guard, not a budget — an all-bot game plays itself out in far fewer steps. Per game. */
  readonly maxSteps: number;
  /** Human-readable game name for the runaway error (`Container` / `Can't Stop` / `Stone Age`). */
  readonly label: string;
  /** Re-read the current authoritative state; `undefined` if the game is gone. */
  get(gameId: string): S | undefined;
  /** The bot-held seat ids for this game (empty ⇒ an all-human game). */
  botSeats(gameId: string): Iterable<string>;
  /** A flow that outranks the turn (Container's auction). Omit when a game has none — treated as idle. */
  preStep?(state: S, botIds: ReadonlySet<string>): PreStepResult;
  /** Play one ordinary action for the given active bot seat. */
  step(state: S, activeSeatId: string): void;
}

/**
 * Play every bot seat that is ready to act, stopping as soon as a human is on the clock (their turn,
 * or — via `preStep` — their bid/call on a pending flow). A no-op when there are no bots, when it's
 * already a human's move, or on a finished game — the core calls this on reads as well as writes.
 *
 * Throws when `maxSteps` is exhausted with no human ever on the clock: that means a policy is cycling
 * on a legal-but-non-progressing action, and falling out silently would re-run the whole spin on
 * *every* read of the game — the invisible per-read DoS §1.4 is about. `app.ts`'s `tick` contains and
 * logs the throw so it stalls only this seat.
 */
export function runBotLoop<S extends BotLoopState>(opts: BotLoopOptions<S>): void {
  const { gameId, maxSteps, label, get, botSeats, preStep, step } = opts;

  for (let i = 0; i < maxSteps; i += 1) {
    const state = get(gameId);
    if (!state || state.status !== 'active') return;

    const botIds = new Set(botSeats(gameId));
    if (botIds.size === 0) return;

    if (preStep) {
      const result = preStep(state, botIds);
      if (result === 'waiting') return; // a human owes the next move in a pending flow
      if (result === 'stepped') continue; // it did one unit of work; re-read and go again
      // 'idle' → nothing pending, fall through to the ordinary turn
    }

    const active = state.players[state.activePlayerIndex];
    if (!active || !botIds.has(active.id)) return; // a human's move

    step(state, active.id);
  }

  throw new Error(`${label} bot runner exceeded ${maxSteps} steps for game "${gameId}" — a policy is likely cycling`);
}
