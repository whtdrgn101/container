import { decide } from '@game-hub/bot/cantstop';
import { applyAction, viewFor } from '@game-hub/engine/cantstop';
import type { CantStopState } from '@game-hub/engine/cantstop';
import type { BotRepository } from '../../bots';
import { rollFourDice } from './dice';

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
 * special powers.** It uses the same `@game-hub/bot/cantstop` policy self-play uses, decides from
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
    private readonly bots: BotRepository,
    private readonly rng: () => number,
    private readonly onChange: BotChangeListener,
  ) {}

  tick(gameId: string): void {
    const rollDice = () => rollFourDice(this.rng);
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const state = this.repo.get(gameId);
      if (!state || state.status !== 'active') return;

      const botIds = new Set(this.bots.listForGame(gameId));
      if (botIds.size === 0) return;

      const active = state.players[state.activePlayerIndex]!;
      if (!botIds.has(active.id)) return; // a human's move

      const action = decide(viewFor(state, active.id), active.id, { rollDice });
      const next = applyAction(state, active.id, action);
      this.repo.update(next);
      this.onChange(next);
    }
    // MAX_STEPS with no human, finished game, or botless seat means a policy is cycling. Throw (the
    // app's `tick` contains and logs it) rather than fall out silently and re-spin on every read.
    throw new Error(`Can't Stop bot runner exceeded ${MAX_STEPS} steps for game "${gameId}" — a policy is likely cycling`);
  }
}
