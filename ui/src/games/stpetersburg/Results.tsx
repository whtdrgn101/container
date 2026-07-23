import type { StPetersburgView } from '@game-hub/engine/stpetersburg';
import { GameOver } from '@/components/GameOver';
import { cn } from '@/lib/utils';

/** The game once it has ended — `results`/`winnerIds` are present only on this arm of the state union. */
type EndedView = Extract<StPetersburgView, { status: 'ended' }>;

/**
 * Saint Petersburg's final-scoring screen (pg. 5–6, SP6): the shared `GameOver` frame wrapping the
 * per-player breakdown table — base points + the distinct-aristocrat table + 1 pt / 10₽ − 5 / hand card.
 */
export function Results({ game, playerName, onLeave }: { game: EndedView; playerName: (id: string) => string; onLeave: () => void }) {
  return (
    <GameOver winnerNames={game.winnerIds.map((id) => playerName(id))} onNewGame={onLeave}>
      <table className="w-full text-sm" data-testid="sp-results">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Player</th>
            <th className="px-1 font-medium" title="Points already banked on the score track">Base</th>
            <th className="px-1 font-medium" title="Distinct aristocrats, scored by the board table">Aristocrats</th>
            <th className="px-1 font-medium" title="1 point per full 10 rubles">Money</th>
            <th className="px-1 font-medium" title="−5 per card still in hand">Hand</th>
            <th className="pl-1 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {[...game.results]
            .sort((a, b) => b.total - a.total)
            .map((r) => {
              const won = game.winnerIds.includes(r.playerId);
              return (
                <tr key={r.playerId} data-testid={`sp-result-${r.playerId}`} className={cn('border-t', won && 'font-semibold text-primary')}>
                  <td className="py-1 pr-2 font-medium">
                    {playerName(r.playerId)}
                    {won ? ' 🏁' : ''}
                  </td>
                  <td className="px-1 tabular-nums text-muted-foreground">{r.base}</td>
                  <td className="px-1 tabular-nums text-muted-foreground" title={`${r.distinctAristocrats} distinct`}>
                    {r.aristocrats}
                    <span className="ml-0.5 text-[10px]">×{r.distinctAristocrats}</span>
                  </td>
                  <td className="px-1 tabular-nums text-muted-foreground">{r.money}</td>
                  <td className="px-1 tabular-nums text-muted-foreground">{r.handPenalty > 0 ? `−${r.handPenalty}` : '0'}</td>
                  <td className="pl-1 text-right font-semibold tabular-nums">{r.total}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </GameOver>
  );
}
