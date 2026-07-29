import { Bot, Landmark } from 'lucide-react';
import type { Action, PlayerView } from '../../../engine';
import { ActionTip, Button, CardHeader, CardTitle } from '@game-hub/ui-kit';
import { CONTAINER_TIPS } from '../../tips';

export interface MatHeaderProps {
  readonly player: PlayerView;
  readonly isBot: boolean;
  /** Active + drivable + no forced delivery — the one gate every relocated control shares. */
  readonly showControls: boolean;
  readonly can: (type: Action['type']) => boolean;
  readonly busy: boolean;
  readonly act: (playerId: string, action: Action) => void;
}

/**
 * The mat's money strip: name (+ bot badge), cash pill, loans pill (absent at zero — e2e counts on
 * it), and — on the active player's own mat — the loan actions, which live here because loans are
 * money-strip business (part of the controls-in-their-zone relocation, 2026-07).
 */
export function MatHeader({ player, isBot, showControls, can, busy, act }: MatHeaderProps) {
  return (
    <CardHeader className="flex-row flex-wrap items-center justify-between gap-y-1">
      <CardTitle className="flex items-center gap-1.5">
        {/* Say who's a machine: an unlabelled AI opponent is just a confusing human. */}
        {isBot && (
          <span data-testid={`bot-badge-${player.id}`} title="Played by the AI" aria-label="Played by the AI">
            <Bot className="h-4 w-4" aria-hidden />
          </span>
        )}
        {player.name}
      </CardTitle>
      <div className="flex flex-wrap items-center gap-2">
        {player.loans > 0 && (
          <span
            data-testid={`loans-${player.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
          >
            <Landmark className="h-3 w-3" aria-hidden /> {player.loans} loan{player.loans === 1 ? '' : 's'}
          </span>
        )}
        <span
          data-testid={`money-${player.id}`}
          className="rounded-full bg-secondary px-2 py-0.5 text-sm font-medium tabular-nums"
        >
          ${player.money}
        </span>
        {showControls && can('REQUEST_LOAN') && (
          <ActionTip tip={CONTAINER_TIPS.requestLoan}>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              data-testid="request-loan"
              disabled={busy}
              onClick={() => act(player.id, { type: 'REQUEST_LOAN' })}
            >
              Take loan +$10
            </Button>
          </ActionTip>
        )}
        {showControls && can('REPAY_LOAN') && (
          <ActionTip tip={CONTAINER_TIPS.repayLoan}>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              data-testid="repay-loan"
              disabled={busy}
              onClick={() => act(player.id, { type: 'REPAY_LOAN' })}
            >
              Repay −$10
            </Button>
          </ActionTip>
        )}
      </div>
    </CardHeader>
  );
}
