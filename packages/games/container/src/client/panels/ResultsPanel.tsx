import type { GameView } from '../../engine';
import { nameOf } from '../chips';
import { GameOver } from '@/components/GameOver';
import { cn } from '@/lib/utils';

export interface ResultsPanelProps {
  readonly game: GameView;
  readonly resetToLanding: () => void;
}

/**
 * Container's end-of-game screen: the full scoring breakdown, rendered inside the platform's shared
 * `GameOver` frame (roadmap C4) so it matches every other game's ending. Renders nothing until the
 * engine has ended the game and scored it.
 */
export function ResultsPanel({ game, resetToLanding }: ResultsPanelProps) {
  if (game.status !== 'ended') return null;

  return (
    <GameOver winnerNames={game.winnerIds.map((id) => nameOf(game.players, id))} onNewGame={resetToLanding}>
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
                  <tr
                    key={r.playerId}
                    data-testid={`result-${r.playerId}`}
                    className={cn('border-b', isWinner && 'font-semibold')}
                  >
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
    </GameOver>
  );
}
