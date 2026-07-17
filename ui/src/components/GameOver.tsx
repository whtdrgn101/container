import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  return (
    <Card className="reveal-in mb-4" data-testid="results">
      <CardHeader>
        <CardTitle data-testid="winner">
          🏁 Game over — {winnerNames.join(' & ')} win{winnerNames.length > 1 ? '' : 's'}!
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children}
        <Button className="mt-3" variant="outline" data-testid="new-game-end" onClick={onNewGame}>
          New game
        </Button>
      </CardContent>
    </Card>
  );
}
