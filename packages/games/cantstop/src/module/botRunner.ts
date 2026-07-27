import { decide } from '../bot';
import type { CantStopDifficulty } from '../bot';
import { applyAction, viewFor } from '../engine';
import type { CantStopState } from '../engine';
import { runBotLoop } from '@game-hub/kernel';
import type { ModuleBotSeats } from '@game-hub/kernel';
import { rollFourDice } from './dice';

/** The tiers `decide` accepts. Anything else stored (a legacy/unknown value) falls back to 'normal'. */
const TIERS: ReadonlySet<string> = new Set<CantStopDifficulty>(['easy', 'normal', 'hard']);

/** Told that a bot changed the game, so the world can be brought up to date. Injected — no transport here. */
export type BotChangeListener = (state: CantStopState) => void;

/** The slice of persistence the runner needs, typed to Can't Stop (the module does the one cast). */
export interface CantStopGames {
  get(gameId: string): CantStopState | undefined;
  update(state: CantStopState): void;
}

/** A runaway guard, not a budget — an all-bot Can't Stop game ends in a few hundred actions. */
const MAX_STEPS = 5000;

/**
 * Drives the seats an AI holds in Can't Stop (the CS1 counterpart of Container's `BotRunner`).
 *
 * Far simpler than Container's — no auction, no bids — but the same contract: **the runner has no
 * special powers.** It uses the same `@game-hub/game-cantstop/bot` policy self-play uses, decides from
 * `viewFor(state, botId)`, and hands actions to the same `applyAction` a human's move goes through.
 *
 * The one Can't Stop wrinkle: rolling needs randomness the pure bot can't invent, so the runner passes
 * `decide` a `rollDice` drawn from the same `rng` (via `rollFourDice`) the `/roll` route uses — so a
 * bot rolls exactly as a person does. `tick` plays bots forward synchronously until a human is on the
 * clock, so a caller can read the game back afterwards.
 */
export class CantStopBotRunner {
  constructor(
    private readonly repo: CantStopGames,
    private readonly bots: ModuleBotSeats,
    private readonly rng: () => number,
    private readonly onChange: BotChangeListener,
  ) {}

  tick(gameId: string): void {
    const rollDice = () => rollFourDice(this.rng);
    // Each seat's stored tier (CS4). Read once per tick, keyed by seat, and passed to `decide`; a game
    // with no difficulties recorded (or an unknown legacy value) just plays 'normal'.
    const difficulties = this.bots.difficultiesForGame(gameId);
    const tierOf = (seatId: string): CantStopDifficulty => {
      const stored = difficulties[seatId];
      return stored !== undefined && TIERS.has(stored) ? (stored as CantStopDifficulty) : 'normal';
    };
    runBotLoop<CantStopState>({
      gameId,
      maxSteps: MAX_STEPS,
      label: "Can't Stop",
      get: (id) => this.repo.get(id),
      botSeats: (id) => this.bots.listForGame(id),
      step: (state, seatId) => {
        const action = decide(viewFor(state, seatId), seatId, { rollDice, difficulty: tierOf(seatId) });
        const next = applyAction(state, seatId, action);
        this.repo.update(next);
        this.onChange(next);
      },
    });
  }
}
