import type { GameView, PlayerView } from '@game-hub/engine/container';
import { TurnBanner } from '@/components/TurnBanner';

export interface IdentityBannerProps {
  readonly game: GameView;
  /** The seats this client controls. `null` = hotseat (every seat), which shows no banner. */
  readonly controlledIds: readonly string[] | null;
  readonly canDrive: boolean;
  readonly myNames: readonly string[] | null;
  readonly activePlayer: PlayerView | undefined;
}

/** Container's seat-identity + turn line, rendered through the shared `TurnBanner` frame (§3.3). */
export function IdentityBanner({ game, controlledIds, canDrive, myNames, activePlayer }: IdentityBannerProps) {
  if (!controlledIds || game.status !== 'active') return null;

  return (
    <TurnBanner testId="identity-banner" canDrive={canDrive} className="justify-start">
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
    </TurnBanner>
  );
}
