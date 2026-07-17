import type { GameView } from '@game-hub/engine/container';

/**
 * Container's header status line: whose turn it is and what's left of it.
 *
 * This fills the shell header's `status` slot. It's a game's own line, not the platform's — "2
 * actions left" is a Container rule, and another game's header would say something else entirely.
 *
 * Deliberately **not** lazy, unlike the board: it renders in the header the moment you enter a game,
 * before the board chunk has arrived. That's affordable because it costs nothing at runtime — the
 * only engine import here is a *type*, which erases at build.
 */
export function ContainerStatus({ game }: { game: GameView }) {
  return (
    <span data-testid="turn-info" className="text-sm text-muted-foreground">
      Turn {game.turn} · <span className="font-medium text-foreground">{game.players[game.activePlayerIndex]?.name}</span>{' '}
      · {game.actionsRemaining} action{game.actionsRemaining === 1 ? '' : 's'} left
    </span>
  );
}
