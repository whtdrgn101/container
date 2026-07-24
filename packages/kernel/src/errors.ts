/**
 * The one game-agnostic error type, shared by every game in the engine (the platform kernel).
 *
 * A rejected action throws a `GameError` carrying a stable, machine-readable `code` so callers (and
 * the backend's HTTP mapping) branch on the reason without string-matching the message. The class is
 * generic in its code union so each game can pin `code` to *its own* set of reasons —
 * `class ContainerError extends GameError<ContainerErrorCode> {}` — keeping the compile-time check
 * that a thrown code is one the game actually declares. The default (`string`) is for callers that
 * only need to read a code they didn't throw.
 */
export class GameError<Code extends string = string> extends Error {
  readonly code: Code;

  constructor(code: Code, message: string) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}
