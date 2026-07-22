import type { StPetersburgView } from '@game-hub/engine/stpetersburg';

/**
 * Saint Petersburg's header status line: the round, the current phase, and whose turn it is. Fills the
 * shell header's `status` slot — the phase cycle is a Saint Petersburg concept, not a platform one.
 * Non-lazy and free at runtime (the only engine import is a type, which erases at build).
 */
export function StPetersburgStatus({ game }: { game: StPetersburgView }) {
  const active = game.players[game.activePlayerIndex];
  const label = game.status === 'ended' ? 'game over' : `${game.phase} phase`;
  return (
    <span data-testid="turn-info" className="text-sm text-muted-foreground">
      Round {game.round} · <span className="font-medium text-foreground capitalize">{label}</span> ·{' '}
      <span className="font-medium text-foreground">{active?.name}</span>
    </span>
  );
}
