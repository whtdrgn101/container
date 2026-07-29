import type { RussianRailroadsView } from '../engine';
import { cn, GameOver } from '@game-hub/ui-kit';

/** The ended-game projection — `results` / `winnerIds` are present only on this arm of the union. */
type EndedView = Extract<RussianRailroadsView, { status: 'ended' }>;

/**
 * Russian Railroads' final-scoring screen (pg. 22, RR8) — the shared `GameOver` frame wrapping the
 * per-player breakdown (base round total + end-bonus cards + engineer majority → total). Chrome that sits
 * above the board, so it keeps semantic tokens; the diegetic board art is elsewhere.
 */
export function Results({
  game,
  nameOf,
  onLeave,
}: {
  game: EndedView;
  nameOf: (id: string) => string;
  onLeave: () => void;
}) {
  const winnerNames = game.winnerIds.map(nameOf);
  return (
    <GameOver winnerNames={winnerNames} onNewGame={onLeave}>
      <div className="text-sm" data-testid="rr-results">
        <p className="mb-2 text-muted-foreground">
          Final scoring (pg. 22): each round&apos;s routes + industry (base), plus end-bonus cards and the engineer
          majority (40 / 20).
        </p>
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 font-medium">Player</th>
              <th className="py-1 px-2 text-right font-medium">Base</th>
              <th className="py-1 px-2 text-right font-medium">End bonus</th>
              <th className="py-1 px-2 text-right font-medium">Majority</th>
              <th className="py-1 pl-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {game.results.map((r) => {
              const won = game.winnerIds.includes(r.playerId);
              return (
                <tr
                  key={r.playerId}
                  data-testid={`rr-result-${r.playerId}`}
                  className={cn('border-t', won && 'font-semibold text-primary')}
                >
                  <td className="py-1 pr-2">
                    {nameOf(r.playerId)}
                    {won ? ' 🏆' : ''}
                  </td>
                  <td className="py-1 px-2 text-right">{r.base}</td>
                  <td className="py-1 px-2 text-right">{r.endBonus}</td>
                  <td className="py-1 px-2 text-right">{r.majority}</td>
                  <td className="py-1 pl-2 text-right">{r.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GameOver>
  );
}
