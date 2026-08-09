import { cn } from '@game-hub/ui-kit';

/**
 * The site footer: the quiet band under everything, the only way to the About screen, and the one place
 * that says which build you are looking at.
 *
 * Game-agnostic like the rest of `shell/`, and deliberately thin — one line about the room, the version
 * stamp, and one link. It sits below the board too, so it stays visually subdued (a wood-toned rule,
 * muted ink) rather than competing with whatever game is on the table.
 */
export interface FooterProps {
  readonly onAbout: () => void;
  /**
   * The game on the table, if one is. Both or neither: the stamp reads `Game Hub v1.0.0 : Argute v0.2.0`
   * while a game is up and `Game Hub v1.0.0` everywhere else, because a game's version is only a fact
   * about the screen that is running it.
   */
  readonly game?: { readonly name: string; readonly version: string };
}

export function Footer({ onAbout, game }: FooterProps) {
  return (
    <footer className={cn('mt-8 border-t border-wood/25 bg-background/60')} data-testid="site-footer">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted-foreground">
        <p>Game Hub — a self-hosted games room. No accounts, no tracking; just a shared code.</p>
        {/*
          The version stamp. `__HUB_VERSION__` is substituted by Vite at build time from the root
          package.json (see `vite.config.ts`), so this is a literal string in the bundle rather than a
          runtime lookup — and `tabular-nums` keeps the digits from shifting the line as versions grow.
        */}
        <p data-testid="version-stamp" className="order-last w-full tabular-nums sm:order-none sm:w-auto">
          Game Hub v{__HUB_VERSION__}
          {game && ` : ${game.name} v${game.version}`}
        </p>
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
