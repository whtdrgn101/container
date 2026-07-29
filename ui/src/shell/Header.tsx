import type { ReactNode } from 'react';
import { Dices } from 'lucide-react';
import { Button } from '@game-hub/ui-kit';

/**
 * The site header: where you are, and the way back out.
 *
 * Game-agnostic. The one game-shaped thing that used to live here — the "Turn 3 · Ann · 2 actions
 * left" line — is now a **slot** (`status`) the board fills, because only a game knows what its own
 * status line says. Chess has no actions-remaining; Container does. Don't teach this component to
 * read a game state to put it back.
 */
export interface HeaderProps {
  /** What this screen is called: "Game Hub", "Game Hub - [Tim]", "Container - [Ann]". */
  readonly heading: string;
  /** The game's id, when in one — shown as the shareable code. */
  readonly gameId: string | null;
  /** True when there's somewhere to go back to (a game or a lobby). */
  readonly canLeave: boolean;
  readonly onLeave: () => void;
  /** The current game's status line, rendered by its own board. */
  readonly status?: ReactNode;
}

export function Header({ heading, gameId, canLeave, onLeave, status }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-sm"
          >
            <Dices className="h-4 w-4" />
          </span>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl" data-testid="page-title">
            {canLeave ? (
              // Only a link when there's somewhere to go back to. Leaving is safe and needs no
              // confirmation: the game lives on the server, so it keeps running (bots included) and
              // reappears under "Games in progress" to rejoin.
              <button
                type="button"
                data-testid="home-link"
                onClick={onLeave}
                title="Back to the Game Hub — this game keeps going; rejoin it any time from the home screen"
                // Underline + pointer, not a color shift: `text-primary` is nearly the same shade as
                // the heading in both themes, so a color-only hover was invisible and the link
                // undiscoverable.
                className="cursor-pointer rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden>←</span> {heading}
              </button>
            ) : (
              heading
            )}
          </h1>
        </div>
        {gameId && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="game-code"
              data-game-id={gameId}
              title="Copy game code — share it so another device can join this game"
              onClick={() => void navigator.clipboard?.writeText(gameId).catch(() => undefined)}
              className="hidden items-center gap-1 rounded border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent sm:inline-flex"
            >
              <span aria-hidden>🔗</span> {gameId.slice(0, 8)}
            </button>
            {status}
            <Button variant="outline" size="sm" data-testid="new-game" onClick={onLeave}>
              New game
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
