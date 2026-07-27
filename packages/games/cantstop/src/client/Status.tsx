import type { CantStopView } from '../engine';

/**
 * Can't Stop's header status line: whose turn it is and what they owe. Fills the shell header's
 * `status` slot — "choose a pairing" is a Can't Stop concept, not a platform one. Non-lazy and free
 * at runtime (the only engine import is a type, which erases at build).
 */
export function CantStopStatus({ game }: { game: CantStopView }) {
  const active = game.players[game.activePlayerIndex];
  const phaseLabel =
    game.status === 'ended' ? 'game over' : game.phase === 'selecting' ? 'choose a pairing' : 'ready to roll';
  return (
    <span data-testid="turn-info" className="text-sm text-muted-foreground">
      Turn {game.turn} · <span className="font-medium text-foreground">{active?.name}</span> · {phaseLabel}
    </span>
  );
}
