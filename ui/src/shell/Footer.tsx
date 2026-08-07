import { cn } from '@game-hub/ui-kit';

/**
 * The site footer: the quiet band under everything, and the only way to the About screen.
 *
 * Game-agnostic like the rest of `shell/`, and deliberately thin — one line about the room and one
 * link. It sits below the board too, so it stays visually subdued (a wood-toned rule, muted ink) rather
 * than competing with whatever game is on the table.
 */
export interface FooterProps {
  readonly onAbout: () => void;
}

export function Footer({ onAbout }: FooterProps) {
  return (
    <footer className={cn('mt-8 border-t border-wood/25 bg-background/60')} data-testid="site-footer">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted-foreground">
        <p>Game Hub — a self-hosted games room. No accounts, no tracking; just a shared code.</p>
        <button
          type="button"
          data-testid="about-link"
          onClick={onAbout}
          className="cursor-pointer rounded font-medium text-brass underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          About
        </button>
      </div>
    </footer>
  );
}
