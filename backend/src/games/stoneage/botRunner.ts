import { decide } from '@game-hub/bot/stoneage';
import { applyAction, viewFor } from '@game-hub/engine/stoneage';
import type { StoneAgeState } from '@game-hub/engine/stoneage';
import type { BotRepository } from '../../bots';
import { rollDice } from './dice';

/** Told a bot moved the game, so the world can catch up (injected, so the runner needs no socket). */
export type BotChangeListener = (state: StoneAgeState) => void;

/** The slice of persistence the runner needs, typed to Stone Age (the one cast is done at the boundary). */
export interface StoneAgeGames {
  get(gameId: string): StoneAgeState | undefined;
  update(state: StoneAgeState): void;
}

/** A runaway guard, not a budget — an all-bot Stone Age game plays out in a few thousand actions. */
const MAX_STEPS = 20_000;

/**
 * Drives the seats an AI holds in Stone Age (roadmap SA12).
 *
 * Far simpler than Container's runner: Stone Age is strictly turn-based (placement, actions, feeding all
 * follow `activePlayerIndex`) with no off-turn moves, so "is the active seat a bot?" is the whole
 * question. Server-side on purpose — one implementation serves hotseat and remote, and a game keeps
 * moving with every browser closed. `tick` plays bots forward until a human is on the clock, synchronously
 * (the engine and SQLite both are), so a caller reads the game back afterwards and replies with it.
 *
 * The runner has no special powers: same `@game-hub/bot` policies as self-play, same `applyAction` a
 * human's move takes, and it decides from `viewFor(state, botId)`. The one injection is the gather dice —
 * the bot can't invent them, so the runner supplies them from `ctx.rng` (via `rollDice`), exactly as the
 * roll route does for a human.
 */
export class BotRunner {
  constructor(
    private readonly repo: StoneAgeGames,
    private readonly bots: BotRepository,
    private readonly rng: () => number,
    private readonly onChange: BotChangeListener,
  ) {}

  /**
   * Play every bot seat that is ready to act, stopping as soon as a human is on the clock. A no-op when
   * there are no bots, when it's already a human's move, or on a finished game — the core calls it on
   * reads as well as writes.
   */
  tick(gameId: string): void {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const state = this.repo.get(gameId);
      if (!state || state.status !== 'active') return;

      const botIds = new Set(this.bots.listForGame(gameId));
      if (botIds.size === 0) return;

      const active = state.players[state.activePlayerIndex]!;
      if (!botIds.has(active.id)) return; // a human's move — stop

      const action = decide(viewFor(state, active.id), active.id, {
        rollDice: (count) => rollDice(this.rng, count),
      });
      this.repo.update(applyAction(state, active.id, action));
      this.onChange(this.repo.get(gameId)!);
    }
    // Reaching here means the loop never hit a human, a finished game, or a botless seat in MAX_STEPS
    // steps — a policy is cycling on a legal-but-non-progressing action. Self-play throws on exactly
    // this; the server used to fall out silently and re-run the whole spin on *every* read. Throw so it
    // surfaces (the app's `tick` contains and logs it) instead of becoming an invisible per-read DoS.
    throw new Error(`Stone Age bot runner exceeded ${MAX_STEPS} steps for game "${gameId}" — a policy is likely cycling`);
  }
}
