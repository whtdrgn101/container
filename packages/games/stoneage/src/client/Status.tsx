import type { StoneAgeView } from '../engine';

const PHASE_LABEL: Record<string, string> = {
  placement: 'placing people',
  actions: 'using actions',
  feeding: 'feeding',
};

/** Stone Age's header status line: which round/phase, and whose turn. */
export function StoneAgeStatus({ game }: { game: StoneAgeView }) {
  const active = game.players[game.activePlayerIndex];
  const phase = game.status === 'ended' ? 'game over' : (PHASE_LABEL[game.phase] ?? game.phase);
  return (
    <span data-testid="turn-info" className="text-sm text-muted-foreground">
      Round {game.round} · {phase} · <span className="font-medium text-foreground">{active?.name}</span>
    </span>
  );
}
