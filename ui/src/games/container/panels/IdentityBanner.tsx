import type { GameView, PlayerView } from '@container/engine';
import { cn } from '@/lib/utils';

export interface IdentityBannerProps {
  readonly game: GameView;
  /** The seats this client controls. `null` = hotseat (every seat), which shows no banner. */
  readonly controlledIds: readonly string[] | null;
  readonly canDrive: boolean;
  readonly myNames: readonly string[] | null;
  readonly activePlayer: PlayerView | undefined;
}

export function IdentityBanner({ game, controlledIds, canDrive, myNames, activePlayer }: IdentityBannerProps) {
  if (!controlledIds || game.status !== 'active') return null;

  return (
    <div
      data-testid="identity-banner"
      className={cn(
        'mb-4 flex flex-wrap items-center gap-x-2 rounded-lg border px-4 py-2 text-sm',
        canDrive ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground',
      )}
    >
      {myNames && myNames.length > 0 ? (
        <span>
          You are <span className="font-semibold text-foreground">{myNames.join(' & ')}</span>.
        </span>
      ) : (
        <span>Spectating.</span>
      )}
      <span data-testid="turn-status">
        {canDrive ? '✋ Your turn — take your actions.' : `Waiting for ${activePlayer?.name}…`}
      </span>
    </div>
  );
}
