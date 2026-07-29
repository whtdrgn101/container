import { createContext } from 'react';

/**
 * What the shell hands the shared `GameOver` screen so it can offer a **rematch** button.
 *
 * Rematch is a **platform** feature (play again with the same players — true of any game), so the shell
 * owns all of it: the state, the API calls, and navigating everyone to the new game. It reaches the
 * button — which lives in the shared `GameOver` component, rendered deep inside whichever board is up —
 * through this context rather than threading props through every game's board.
 */
export interface RematchControls {
  /** Propose a rematch, or accept the one already open (agrees on behalf of this client's seats). */
  readonly onRematch: () => void;
  /** True while a rematch request is in flight — disable the button. */
  readonly busy: boolean;
  /** Someone has agreed to a rematch, so others see "Accept" rather than "Rematch". */
  readonly proposed: boolean;
  /** This client has already agreed and is waiting for another player to accept. */
  readonly waiting: boolean;
}

export const RematchContext = createContext<RematchControls | null>(null);
