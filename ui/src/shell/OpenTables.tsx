import { Button, cn } from '@game-hub/ui-kit';
import type { GameInfo, GameSummary, Lobby, LobbyMember } from '@/lib/api';

/**
 * "Open tables" — the felt band on the shelf (Card Table redesign): games waiting for players and games
 * already in progress, drawn as cream table-cards laid on the felt. It's a restyle of the two lists that
 * used to sit in the landing's "New game" card; every affordance and testid is preserved (browse-and-
 * join, rejoin your seat, resume by seat, pass-and-play resume, abandon-with-confirm).
 *
 * **Game-agnostic** (roadmap C2): a table's game *name* comes from the server catalog, never from a
 * hardcoded list here. The band renders only when there's at least one table to show.
 */
export interface OpenTablesProps {
  readonly catalog: GameInfo[];
  readonly openLobbies: Lobby[];
  readonly activeGames: GameSummary[];
  readonly busy: boolean;

  readonly displayName: string;
  readonly onDisplayNameChange: (name: string) => void;
  readonly onJoinWaiting: (lobbyId: string) => void;
  readonly onRejoinWaiting: (lobbyId: string, seat: number) => void;

  readonly onResume: (gameId: string, playerId: string) => void;
  readonly onResumeHotseat: (gameId: string) => void;
  readonly confirmingAbandon: string | null;
  readonly onConfirmAbandon: (gameId: string | null) => void;
  readonly onAbandon: (gameId: string) => void;
}

export function OpenTables({
  catalog,
  openLobbies,
  activeGames,
  busy,
  displayName,
  onDisplayNameChange,
  onJoinWaiting,
  onRejoinWaiting,
  onResume,
  onResumeHotseat,
  confirmingAbandon,
  onConfirmAbandon,
  onAbandon,
}: OpenTablesProps) {
  // The display name for a game type (e.g. "stoneage" → "Stone Age"), from the server catalog. Falls
  // back to the raw id if the catalog hasn't loaded or the game is unknown to this build.
  const gameLabel = (gameType: string) => catalog.find((entry) => entry.id === gameType)?.name ?? gameType;

  if (openLobbies.length === 0 && activeGames.length === 0) return null;

  return (
    <section className="felt rounded-2xl border border-wood/40 p-4 shadow-inner sm:p-5" data-testid="open-tables">
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-felt-foreground">Open tables</h2>

      {openLobbies.length > 0 && (
        <div data-testid="waiting-games" className="mb-4 space-y-2">
          <p className="text-xs font-medium text-cream/80">
            Waiting for players — pick a name and hop into a game someone started.
          </p>
          <input
            aria-label="Display name"
            data-testid="display-name"
            placeholder="Your name"
            className="w-full rounded-md border border-wood/30 bg-card px-3 py-2 text-sm text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
          />
          <ul className="space-y-2">
            {openLobbies.map((open) => {
              const taken = open.members.filter((m): m is LobbyMember => m !== null);
              // Seats already claimed by a person, with the seat index they sit in — `taken` is filtered,
              // so its own index is not the seat number.
              const claimed = open.members
                .map((member, seat) => ({ member, seat }))
                .filter((entry): entry is { member: LobbyMember; seat: number } => entry.member !== null)
                .filter((entry) => !entry.member.bot);
              const hasEmptySeat = open.members.some((member) => member === null);
              return (
                <li
                  key={open.id}
                  data-testid={`waiting-game-${open.id}`}
                  className="space-y-2 rounded-lg border border-wood/25 bg-card px-3 py-2.5 text-card-foreground shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span
                      data-testid={`waiting-game-type-${open.id}`}
                      className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground"
                    >
                      {gameLabel(open.gameType)}
                    </span>
                    <span className="ml-auto font-mono">{open.id.slice(0, 8)}</span>
                    <span>
                      · {taken.length}/{open.seats} players
                    </span>
                  </div>
                  {/*
                    Leaving a waiting room drops only this window's binding — the seat keeps your name on
                    the server. So getting back in is picking your seat again, not claiming a new one;
                    "Join" would take the next *empty* seat and sit you down twice.
                  */}
                  {claimed.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-xs text-muted-foreground">Rejoin as</span>
                      {claimed.map(({ member, seat }) => (
                        <Button
                          key={seat}
                          size="sm"
                          variant="outline"
                          data-testid={`rejoin-waiting-${open.id}-${seat}`}
                          disabled={busy}
                          title={`Take your seat back as ${member.name}`}
                          onClick={() => onRejoinWaiting(open.id, seat)}
                        >
                          {member.name}
                        </Button>
                      ))}
                      {taken.length > claimed.length && (
                        <span className="text-xs text-muted-foreground">· 🤖 ×{taken.length - claimed.length}</span>
                      )}
                    </div>
                  )}
                  {hasEmptySeat && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">New here?</span>
                      <Button
                        size="sm"
                        data-testid={`join-waiting-${open.id}`}
                        disabled={busy || displayName.trim() === ''}
                        onClick={() => onJoinWaiting(open.id)}
                      >
                        Join
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {activeGames.length > 0 && (
        <div data-testid="active-games" className="space-y-2">
          <p className="text-xs font-medium text-cream/80">
            In progress — closed your tab? Pick your seat to jump back in.
          </p>
          <ul className="space-y-2">
            {activeGames.map((active) => (
              <li
                key={active.id}
                data-testid={`active-game-${active.id}`}
                className="space-y-2 rounded-lg border border-wood/25 bg-card px-3 py-2.5 text-card-foreground shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span
                    data-testid={`active-game-type-${active.id}`}
                    className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground"
                  >
                    {gameLabel(active.gameType)}
                  </span>
                  <span className="ml-auto font-mono">{active.id.slice(0, 8)}</span>
                  <span>· Turn {active.turn}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-xs text-muted-foreground">Resume as</span>
                  {/*
                    AI seats are not on offer: the server plays them, so "resuming" one would put a second
                    driver at that seat — and hand a human its secret card.
                  */}
                  {active.players
                    .filter((player) => !(active.bots ?? []).includes(player.id))
                    .map((player) => (
                      <Button
                        key={player.id}
                        size="sm"
                        variant="outline"
                        data-testid={`resume-${active.id}-${player.id}`}
                        disabled={busy}
                        onClick={() => onResume(active.id, player.id)}
                        className={cn(player.id === active.activePlayerId && 'ring-1 ring-primary')}
                        title={player.id === active.activePlayerId ? `${player.name} (their turn)` : player.name}
                      >
                        {player.name}
                        {player.id === active.activePlayerId ? ' •' : ''}
                      </Button>
                    ))}
                  {(active.bots ?? []).length > 0 && (
                    <span className="text-xs text-muted-foreground" data-testid={`resume-bots-${active.id}`}>
                      · 🤖 ×{(active.bots ?? []).length}
                    </span>
                  )}
                </div>
                {/*
                  Pass-and-play: drive every seat on this device. This is how you get back into a hotseat
                  game you left — resuming a single seat would strand the others (no bot to play them).
                  Shown when at least two humans share the game.
                */}
                {active.players.filter((player) => !(active.bots ?? []).includes(player.id)).length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`resume-hotseat-${active.id}`}
                    disabled={busy}
                    onClick={() => onResumeHotseat(active.id)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ↩ Play all seats (pass &amp; play)
                  </Button>
                )}
                {/*
                  Abandoning closes out a game nobody means to finish. Two steps rather than one: it's the
                  only control here that acts on *everyone's* game, and the rest is one-click-safe.
                */}
                {confirmingAbandon === active.id ? (
                  <div
                    className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5"
                    data-testid={`abandon-confirm-${active.id}`}
                  >
                    <span className="text-xs text-destructive">
                      Abandon this game for everyone? It can’t be played again.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`abandon-yes-${active.id}`}
                      disabled={busy}
                      onClick={() => onAbandon(active.id)}
                    >
                      Abandon
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`abandon-no-${active.id}`}
                      disabled={busy}
                      onClick={() => onConfirmAbandon(null)}
                    >
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid={`abandon-${active.id}`}
                    disabled={busy}
                    onClick={() => onConfirmAbandon(active.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Abandon game
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
