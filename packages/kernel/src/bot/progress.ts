import { BotError } from './errors.js';

/**
 * The self-play runaway guard, shared by every game (REVIEW §3.4).
 *
 * Self-play drives whole games with every seat botted; a policy that returns a legal-but-non-
 * progressing action would otherwise loop forever. The guard watches a **progress marker** — the
 * turn (Container, Can't Stop) or the round (Stone Age) — and throws once too many actions land
 * without it advancing, so a cycling policy fails fast (~the per-marker cap) instead of hanging.
 *
 * Container and Can't Stop already did exactly this per-turn; Stone Age had only a flat 100,000-action
 * cap with no per-round detection, so a cycle burned 100k actions before failing. This is the strong
 * per-marker variant, now shared, with Stone Age switched onto it.
 */
export interface ProgressGuardOptions {
  /** Max actions allowed at one marker value before we conclude the policy is cycling. */
  readonly maxPerMarker: number;
  /** The marker's noun for the error message: `'turn'` or `'round'`. */
  readonly marker: string;
  /** The marker's value before the first action (`state.turn` / `state.round`). */
  readonly initial: number;
}

export interface ProgressGuard {
  /**
   * Record one applied action landing at `marker` (the *post*-action turn/round value), played by
   * `seatId`. Throws a `BotError` if the marker hasn't advanced for `maxPerMarker` actions running.
   */
  record(marker: number, seatId: string): void;
}

export function makeProgressGuard(options: ProgressGuardOptions): ProgressGuard {
  let current = options.initial;
  let sinceProgress = 0;
  return {
    record(marker, seatId) {
      if (marker === current) {
        sinceProgress += 1;
        if (sinceProgress > options.maxPerMarker) {
          throw new BotError(
            `Bot seat "${seatId}" took ${sinceProgress} actions in ${options.marker} ${current} without ending it — a policy is cycling`,
          );
        }
      } else {
        current = marker;
        sinceProgress = 0;
      }
    },
  };
}
