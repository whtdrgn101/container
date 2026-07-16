import type { ComponentType, LazyExoticComponent } from 'react';
import type { GameMessage, GamePayload } from '@/lib/api';

/**
 * The `GameClient` seam (roadmap C2) — the UI's mirror of the backend's `GameModule`.
 *
 * The shell is a games room: it owns the landing screen, the lobby, navigation, and the transport
 * (one REST client, one WebSocket per game). It knows nothing about any game's rules or shape. A game
 * plugs in a **board** and the shell renders it.
 *
 * **This file must never import a game.** It is the contract; `games/container/` is one
 * implementation and `registry.ts` is the lookup — same rule as `backend/src/games/module.ts`.
 */
export interface GameClient<S = unknown> {
  /** Matches the backend module's id and the row's `game_type`. */
  readonly id: string;
  /** Human-readable name, for the picker and the page heading. */
  readonly name: string;
  /**
   * The board. **Lazy on purpose**: a games room shouldn't ship every game's board to someone who
   * opened the home screen, and Container's board pulls in the whole engine.
   */
  readonly Board: LazyExoticComponent<ComponentType<BoardProps<S>>>;
  /**
   * The game's status line for the shell header ("Turn 3 · Ann · 2 actions left").
   *
   * A slot rather than something the header derives, because only a game knows what its own status
   * says — actions-remaining is a Container rule, not a platform concept. Keep it cheap and
   * **non-lazy**: it renders the instant you enter a game, before the board chunk lands.
   */
  readonly Status?: ComponentType<{ game: S }>;
}

/**
 * What the shell hands a board.
 *
 * Generic in `S` so a board is **fully typed against its own engine** — Container's board is a
 * `ComponentType<BoardProps<GameView>>` and never sees an `unknown`. The registry erases `S` to store
 * mixed games together (the same method-bivariance bargain the backend's `AnyGameModule` makes), but
 * the erasure stops at the seam. **Don't widen a board's props to `unknown` to make it fit.**
 */
export interface BoardProps<S> {
  readonly gameId: string;
  /** The current state, projected for this client's seats. */
  readonly game: S;
  /** Seats an AI holds. Coordination state — beside the game, never inside it. */
  readonly bots: readonly string[];
  /**
   * The seats this client may drive, or `null` for hotseat (drives them all). The shell owns seat
   * binding because it's a platform concern; the board consumes it to gate its own affordances.
   */
  readonly controlledIds: string[] | null;
  /** `?viewer=` for this client's seats — pass to any call that returns a projected state. */
  readonly viewer: string | undefined;
  /** True while the shell has a request in flight; disable affordances rather than double-submit. */
  readonly busy: boolean;
  /** Run work with the shell's busy/error handling. Errors surface in the shell's banner. */
  readonly guard: (work: () => Promise<void>) => Promise<void>;
  /** Push a new payload up to the shell after an action (version-guarded there). */
  readonly onPayload: (payload: GamePayload<S>) => void;
  /** Leave this game and go back to the hub. The game keeps running server-side. */
  readonly onLeave: () => void;
  /**
   * Side-channel pushes from the game's socket — everything that isn't `type: 'state'`. The shell
   * owns the socket and forwards these verbatim without interpreting them (Container reads
   * `type: 'auction'`). `null` until one arrives.
   */
  readonly lastMessage: GameMessage | null;
}
