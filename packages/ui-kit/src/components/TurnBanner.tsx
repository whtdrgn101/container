import type { ReactNode } from 'react';
import { cn } from '../utils.js';

/**
 * The shared turn banner every game shows at the top of its board (roadmap C2 / REVIEW §3.3).
 *
 * Three games grew three near-identical banners, and **none announced to a screen reader** — no
 * assistive-tech user in any game was told it was their move. This frame fixes that in one place:
 * `role="status"` + `aria-live="polite"`, so whatever message a board renders inside is announced, plus
 * the consistent "your turn" highlight. The *message* stays per-game (Container's "✋ Your turn — take
 * your actions", Stone Age's phase line): only the frame is shared.
 *
 * Generic on purpose — it names no game and imports no engine — so it lives beside `GameOver` in the
 * shared components. Each board passes its own `testId` (the games' e2e depend on `identity-banner` /
 * `sa-banner`) and renders its own content as children.
 */
export interface TurnBannerProps {
  /** The board's own banner testid — `identity-banner`, `sa-banner`, … (kept for the games' e2e). */
  readonly testId: string;
  /** Highlight when this client is on the clock. */
  readonly canDrive?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export function TurnBanner({ testId, canDrive = false, className, children }: TurnBannerProps) {
  return (
    <div
      data-testid={testId}
      role="status"
      aria-live="polite"
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border px-4 py-2 text-sm',
        canDrive ? 'border-primary bg-primary/10 font-medium' : 'bg-card text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}
