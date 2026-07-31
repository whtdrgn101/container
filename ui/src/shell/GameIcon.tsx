import { Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { cn } from '@game-hub/ui-kit';

/**
 * A game's "box lid" mark, for the shelf and the detail hero (Card Table redesign).
 *
 * The mark is the game's own `client.Icon` — **lazy**, exactly like `Board`, so opening the home screen
 * doesn't ship every game's art. It's wrapped in `Suspense` with a quiet cream placeholder (never a
 * spinner — a shelf that flickers spinners reads as broken, not loading). A game that declares no `Icon`
 * gets a neutral cream lid stamped with its initial, so the shelf is always a full grid of lids.
 *
 * Game-agnostic: the shell hands in the (type-erased) `Icon` component and the initial; it never learns
 * what any game's mark draws. The `className` sizes and is forwarded to the game's icon.
 */
export interface GameIconProps {
  /** The game's lazy icon component, or undefined for the neutral lid. */
  readonly Icon: LazyExoticComponent<ComponentType<{ className?: string }>> | undefined;
  /** First letter of the game's name, shown on the neutral lid when there's no icon. */
  readonly initial: string;
  readonly className?: string;
}

export function GameIcon({ Icon, initial, className }: GameIconProps) {
  if (!Icon) {
    return (
      <div
        aria-hidden
        className={cn('grid place-items-center bg-cream font-display text-4xl font-semibold text-wood/70', className)}
      >
        {initial}
      </div>
    );
  }
  return (
    <Suspense fallback={<div aria-hidden className={cn('animate-pulse bg-cream', className)} />}>
      <Icon className={className} />
    </Suspense>
  );
}
