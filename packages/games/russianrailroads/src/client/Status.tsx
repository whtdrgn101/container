import type { RussianRailroadsView } from '../engine';

/**
 * Russian Railroads' header status line: the round (of the total), and whose turn it is. Fills the shell
 * header's `status` slot — the round loop is a Russian Railroads concept, not a platform one. Non-lazy and
 * free at runtime (the only engine import is a type, which erases at build).
 */
export function RussianRailroadsStatus({ game }: { game: RussianRailroadsView }) {
  const active = game.players[game.activePlayerIndex];
  const label = game.status === 'ended' ? 'game over' : `Round ${game.round}/${game.rounds}`;
  return (
    <span data-testid="turn-info" className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span>
      {game.status !== 'ended' && active ? (
        <>
          {' '}
          · <span className="font-medium text-foreground">{active.name}</span>
        </>
      ) : null}
    </span>
  );
}
