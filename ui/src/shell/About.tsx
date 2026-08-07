import { Button, Card, CardContent } from '@game-hub/ui-kit';

/**
 * The About screen — what this room is, and why it exists.
 *
 * Reachable from the footer on every screen. Like the rest of `shell/`, it names no game: what it says
 * about the platform has to stay true no matter which boxes are on the shelf.
 *
 * ⚠️ **The privacy section is a factual claim about the running system, not marketing.** Every sentence
 * in it is checkable against the code today — no accounts or auth (`DEPLOY.md`: trusted-LAN use, no
 * auth), the only stored data is a game's own state plus the display names typed at a table
 * (`games`/`moves`/`lobbies` in SQLite), and there is no analytics or third-party script anywhere in the
 * bundle. If any of that ever stops being true — a login, a tracker, a hosted dependency — **change this
 * copy in the same commit**. A stale privacy promise is worse than none.
 */
export interface AboutProps {
  readonly onBack: () => void;
}

export function About({ onBack }: AboutProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="about-screen">
      <Button variant="ghost" size="sm" data-testid="about-back" onClick={onBack} className="text-muted-foreground">
        <span aria-hidden>←</span> Back
      </Button>

      <div className="space-y-1">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-brass">About the Games Room</h2>
        <p className="text-sm text-muted-foreground">
          A small, self-hosted board-game table for my family — and a workshop for the tech behind it.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6 text-sm leading-relaxed">
          <h3 className="font-display text-lg font-semibold text-ink">No accounts. No personal data.</h3>
          <p>
            There is nothing to sign up for. You don’t make an account, you don’t verify an email, and there’s no
            password to forget — you open a box off the shelf, or paste a table’s code, and you’re playing.
          </p>
          <p>
            The only things this server keeps are the games themselves: the state of a table, the moves played on it,
            and whatever name you type when you sit down. No email addresses, no profiles, no contacts, no location, no
            advertising or analytics of any kind, and nothing shared with anyone else — the page loads no third-party
            scripts at all. A name at a table can be “Dad” or “Bunny”; nothing checks, and nothing follows it anywhere.
          </p>
          <p>
            It runs on hardware I own and administer, on my own network, so the games stay where the players are.
            Finished with a table? Abandon it from the home screen and it’s gone.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6 text-sm leading-relaxed">
          <h3 className="font-display text-lg font-semibold text-ink">Just let people play</h3>
          <p>
            The whole point is the shortest path from “want to play something” to actually playing. Pass and play around
            one table, or share a code and play online from wherever everyone happens to be. Every game keeps running on
            the server, so you can close the tab, come back later, and pick your seat back up.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6 text-sm leading-relaxed">
          <h3 className="font-display text-lg font-semibold text-ink">…and a place to learn the craft</h3>
          <p>
            The room is also a workshop. It’s where I work on React in earnest — reactive, modular UI built out of small
            composable pieces, with the shell that draws this page knowing nothing whatsoever about the rules of any
            game on the shelf. Each game is its own self-contained package plugged into shared seams, so adding one
            changes nothing about the others.
          </p>
          <p>
            The same goes for how it ships. It builds into a single container image and runs on my local Portainer
            instance — a deliberately small, real production environment: one image, one volume, health checks, deploy
            and roll back for real. That’s the groundwork for the bigger goal of getting properly fluent with production
            Kubernetes, on a system where the only thing at stake is game night.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
