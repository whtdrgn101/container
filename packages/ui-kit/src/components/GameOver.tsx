import { useContext, type ReactNode } from 'react';
import { Button } from './ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { RematchContext } from '../rematch.js';

export interface GameOverProps {
  /** Winner display name(s) — one, or several on a shared victory. */
  readonly winnerNames: readonly string[];
  /** Back to the hub to start a new game. */
  readonly onNewGame: () => void;
  /** Game-specific detail — a scoreboard, final standings, whatever the game wants to show. */
  readonly children?: ReactNode;
}

/**
 * The shared end-of-game screen (roadmap C4).
 *
 * Every game finishes in the **same frame** — a "Game over" card with the winner(s) highlighted and one
 * way back to the hub — while each game fills in its own detail (Container's scoring table, Can't Stop's
 * final standings). Generic on purpose: it names no game and imports no engine, so it lives in the shared
 * components rather than any game's folder, and every future game gets a consistent ending for free.
 *
 * Keeps the `results` / `winner` / `new-game-end` testids the games' e2e already rely on.
 */
export function GameOver({ winnerNames, onNewGame, children }: GameOverProps) {
  // Rematch is a platform feature the shell owns; it reaches this shared screen through context so no
  // game's board has to thread it. Absent (null) ⇒ just the "New game" button.
  const rematch = useContext(RematchContext);
  const rematchLabel = rematch?.waiting
    ? 'Waiting for another player…'
    : rematch?.proposed
      ? 'Accept rematch'
      : 'Rematch';

  return (
    <Card className="reveal-in mb-4" data-testid="results">
      <CardHeader>
        <CardTitle data-testid="winner">
          🏁 Game over — {winnerNames.join(' & ')} win{winnerNames.length > 1 ? '' : 's'}!
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children}
        <div className="mt-3 flex flex-wrap gap-2">
          {rematch && (
            <Button data-testid="rematch" disabled={rematch.busy || rematch.waiting} onClick={rematch.onRematch}>
              {rematchLabel}
            </Button>
          )}
          <Button variant="outline" data-testid="new-game-end" onClick={onNewGame}>
            New game
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
