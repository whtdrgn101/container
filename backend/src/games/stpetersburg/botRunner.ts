import { decide } from '@game-hub/bot/stpetersburg';
import { applyAction, viewFor } from '@game-hub/engine/stpetersburg';
import type { StPetersburgState } from '@game-hub/engine/stpetersburg';
import { runBotLoop } from '../../botLoop';
import type { BotRepository } from '../../bots';

/** Told a bot moved the game, so the world can catch up (injected, so the runner needs no socket). */
export type BotChangeListener = (state: StPetersburgState) => void;

/** The slice of persistence the runner needs, typed to Saint Petersburg (the one cast is at the boundary). */
export interface StPetersburgGames {
  get(gameId: string): StPetersburgState | undefined;
  update(state: StPetersburgState): void;
}

/** A runaway guard, not a budget — an all-bot Saint Petersburg game plays out in a few hundred actions. */
const MAX_STEPS = 20_000;

/**
 * Drives the seats an AI holds in Saint Petersburg (roadmap SP9).
 *
 * As simple as Stone Age's runner and simpler than Container's: Saint Petersburg is strictly turn-based
 * (the phase spine follows `activePlayerIndex`, and the Pub/Observatory windows are engine-level turn locks
 * on the active seat), with **no off-turn moves and no per-turn randomness** — so "is the active seat a
 * bot?" is the whole question and there is nothing to inject (`decide` takes no options; the game has no
 * dice). Server-side on purpose — one implementation serves hotseat and remote, and a game keeps moving
 * with every browser closed. `tick` plays bots forward until a human is on the clock, synchronously (the
 * engine and SQLite both are), so a caller reads the game back afterwards and replies with it.
 *
 * The runner has no special powers: the same `@game-hub/bot` policy as self-play, the same `applyAction` a
 * human's move takes, and it decides from `viewFor(state, botId)` — the **redacted** view, so a bot seat
 * can no more read an opponent's rubles or hand than a human client can.
 */
export class BotRunner {
  constructor(
    private readonly repo: StPetersburgGames,
    private readonly bots: BotRepository,
    private readonly onChange: BotChangeListener,
  ) {}

  /**
   * Play every bot seat that is ready to act, stopping as soon as a human is on the clock. A no-op when
   * there are no bots, when it's already a human's move, or on a finished game — the core calls it on
   * reads as well as writes (so a game never wedges on a bot's turn after a restart).
   */
  tick(gameId: string): void {
    runBotLoop<StPetersburgState>({
      gameId,
      maxSteps: MAX_STEPS,
      label: 'Saint Petersburg',
      get: (id) => this.repo.get(id),
      botSeats: (id) => this.bots.listForGame(id),
      step: (state, seatId) => {
        const action = decide(viewFor(state, seatId), seatId);
        this.repo.update(applyAction(state, seatId, action));
        this.onChange(this.repo.get(gameId)!);
      },
    });
  }
}
