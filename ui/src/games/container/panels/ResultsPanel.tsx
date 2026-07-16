import type { GameView } from '@container/engine';
import { nameOf } from '../chips';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ResultsPanelProps {
  readonly game: GameView;
  readonly resetToLanding: () => void;
}

/** The end-of-game scoreboard. Renders nothing until the engine has ended the game and scored it. */
export function ResultsPanel({ game, resetToLanding }: ResultsPanelProps) {
  if (game.status !== 'ended') return null;

  return (
    <Card className="reveal-in mb-4" data-testid="results">
      <CardHeader>
        <CardTitle data-testid="winner">
          🏁 Game over — {game.winnerIds.map((id) => nameOf(game.players, id)).join(' & ')}{' '}
          win{game.winnerIds.length > 1 ? '' : 's'}!
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-2 py-1">Player</th>
                <th className="px-2 py-1 text-right">Cash</th>
                <th className="px-2 py-1 text-right">Island</th>
                <th className="px-2 py-1 text-right">Leftover</th>
                <th className="px-2 py-1 text-right">Loans</th>
                <th className="px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...game.results]
                .sort((a, b) => b.total - a.total)
                .map((r) => {
                  const isWinner = game.winnerIds.includes(r.playerId);
                  return (
                    <tr key={r.playerId} data-testid={`result-${r.playerId}`} className={cn('border-b', isWinner && 'font-semibold')}>
                      <td className="px-2 py-1">
                        {nameOf(game.players, r.playerId)}
                        {isWinner && ' 👑'}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">${r.cash}</td>
                      <td className="px-2 py-1 text-right tabular-nums">${r.islandScore}</td>
                      <td className="px-2 py-1 text-right tabular-nums">${r.leftover}</td>
                      <td className="px-2 py-1 text-right tabular-nums">−${r.loanPenalty}</td>
                      <td className="px-2 py-1 text-right tabular-nums" data-testid={`total-${r.playerId}`}>
                        ${r.total}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <Button className="mt-3" variant="outline" data-testid="new-game-end" onClick={resetToLanding}>
          New game
        </Button>
      </CardContent>
    </Card>
  );
}
