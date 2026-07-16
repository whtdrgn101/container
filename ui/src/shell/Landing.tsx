import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { GameInfo, GameSummary, Lobby, LobbyMember } from '@/lib/api';

/**
 * The Game Hub's front door: games waiting for players, games in progress, and starting a new one.
 *
 * **Game-agnostic** (roadmap C2). It used to import `MIN_PLAYERS`/`MAX_PLAYERS` straight from
 * Container's engine, which quietly made the whole landing screen Container-only. Seat bounds now
 * come from the chosen game's entry in `GET /games/catalog` — the server is the authority on what it
 * hosts and what each game's rules allow, and the shell just draws it.
 */
export interface LandingProps {
  /** Every game this server hosts. Empty until the catalog loads. */
  readonly catalog: GameInfo[];
  /** The game a new room/table is for. */
  readonly selected: GameInfo | undefined;
  readonly onSelect: (gameType: string) => void;

  readonly openLobbies: Lobby[];
  readonly activeGames: GameSummary[];
  readonly busy: boolean;

  readonly displayName: string;
  readonly onDisplayNameChange: (name: string) => void;
  /** Claim the next empty seat with the display name — for someone who isn't in the room yet. */
  readonly onJoinWaiting: (lobbyId: string) => void;
  /** Take back a seat you already hold. Re-binds this window; claims nothing. */
  readonly onRejoinWaiting: (lobbyId: string, seat: number) => void;

  readonly onResume: (gameId: string, playerId: string) => void;
  readonly confirmingAbandon: string | null;
  readonly onConfirmAbandon: (gameId: string | null) => void;
  readonly onAbandon: (gameId: string) => void;

  readonly lobbySeats: number;
  readonly onLobbySeatsChange: (seats: number) => void;
  readonly onCreateLobby: () => void;

  readonly names: string[];
  readonly seatIsBot: boolean[];
  readonly onNamesChange: (names: string[]) => void;
  readonly onSeatIsBotChange: (flags: boolean[]) => void;
  readonly onStartHotseat: () => void;

  readonly joinCode: string;
  readonly onJoinCodeChange: (code: string) => void;
  readonly onJoinByCode: () => void;
  /** Fallback name for a newly added hotseat seat. */
  readonly nameForSeat: (index: number) => string;
}

export function Landing({
  catalog,
  selected,
  onSelect,
  openLobbies,
  activeGames,
  busy,
  displayName,
  onDisplayNameChange,
  onJoinWaiting,
  onRejoinWaiting,
  onResume,
  confirmingAbandon,
  onConfirmAbandon,
  onAbandon,
  lobbySeats,
  onLobbySeatsChange,
  onCreateLobby,
  names,
  seatIsBot,
  onNamesChange,
  onSeatIsBotChange,
  onStartHotseat,
  joinCode,
  onJoinCodeChange,
  onJoinByCode,
  nameForSeat,
}: LandingProps) {
  // Until the catalog answers, fall back to a permissive range rather than clamping the controls to
  // nonsense — the server validates the real bounds anyway.
  const minPlayers = selected?.minPlayers ?? 1;
  const maxPlayers = selected?.maxPlayers ?? 8;

  return (
    <div className="mx-auto max-w-md space-y-4">
      {openLobbies.length > 0 && (
        <Card data-testid="waiting-games">
          <CardHeader>
            <CardTitle>Games waiting for players</CardTitle>
            <p className="text-sm text-muted-foreground">Pick a name and hop into a game someone started.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              aria-label="Display name"
              data-testid="display-name"
              placeholder="Your name"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
            />
            <ul className="space-y-2">
              {openLobbies.map((open) => {
                const taken = open.members.filter((m): m is LobbyMember => m !== null);
                // Seats already claimed by a person, with the seat index they sit in — `taken` is
                // filtered, so its own index is not the seat number.
                const claimed = open.members
                  .map((member, seat) => ({ member, seat }))
                  .filter((entry): entry is { member: LobbyMember; seat: number } => entry.member !== null)
                  .filter((entry) => !entry.member.bot);
                const hasEmptySeat = open.members.some((member) => member === null);
                return (
                  <li key={open.id} data-testid={`waiting-game-${open.id}`} className="space-y-2 rounded-md border px-3 py-2">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{open.id.slice(0, 8)}</span>
                      <span>
                        {taken.length}/{open.seats} players
                      </span>
                    </div>
                    {/*
                      Leaving a waiting room drops only this window's binding — the seat keeps your
                      name on the server. So getting back in is picking your seat again, not claiming
                      a new one; "Join" would take the next *empty* seat and sit you down twice.

                      Same no-accounts bargain as resuming a game: nothing stops you picking someone
                      else's seat, and on a trusted LAN that's the point. AI seats aren't offered.
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
          </CardContent>
        </Card>
      )}

      {activeGames.length > 0 && (
        <Card data-testid="active-games">
          <CardHeader>
            <CardTitle>Games in progress</CardTitle>
            <p className="text-sm text-muted-foreground">Closed your tab? Pick your seat to jump back in.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {activeGames.map((active) => (
                <li key={active.id} data-testid={`active-game-${active.id}`} className="space-y-2 rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono">{active.id.slice(0, 8)}</span>
                    <span>Turn {active.turn}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="mr-1 text-xs text-muted-foreground">Resume as</span>
                    {/*
                      AI seats are not on offer: the server plays them, so "resuming" one would
                      put a second driver at that seat — and hand a human its secret card.
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
                    Abandoning closes out a game nobody means to finish. Two steps rather than
                    one: it's the only control here that acts on *everyone's* game, and the
                    rest of this screen is one-click-safe. Inline rather than a modal — the
                    project has no dialog primitive, and one button doesn't justify Radix.
                  */}
                  {confirmingAbandon === active.id ? (
                    <div
                      className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5"
                      data-testid={`abandon-confirm-${active.id}`}
                    >
                      <span className="text-xs text-destructive">Abandon this game for everyone? It can’t be played again.</span>
                      <Button size="sm" variant="outline" data-testid={`abandon-yes-${active.id}`} disabled={busy} onClick={() => onAbandon(active.id)}>
                        Abandon
                      </Button>
                      <Button size="sm" variant="ghost" data-testid={`abandon-no-${active.id}`} disabled={busy} onClick={() => onConfirmAbandon(null)}>
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New game</CardTitle>
          <p className="text-sm text-muted-foreground">
            {selected ? `${selected.name} is for ${minPlayers}–${maxPlayers} players.` : 'Pick a game to play.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/*
            The picker only earns its space once there's a choice to make. With one game registered
            it would be a single button that does nothing — so the hub shows it from two up.
          */}
          {catalog.length > 1 && (
            <div className="flex flex-wrap gap-2" data-testid="game-picker">
              {catalog.map((entry) => (
                <Button
                  key={entry.id}
                  size="sm"
                  variant={entry.id === selected?.id ? 'default' : 'outline'}
                  data-testid={`pick-game-${entry.id}`}
                  aria-pressed={entry.id === selected?.id}
                  disabled={busy}
                  onClick={() => onSelect(entry.id)}
                >
                  {entry.name}
                </Button>
              ))}
            </div>
          )}

          <div className="space-y-2 rounded-lg border p-3">
            <div className="text-sm font-medium">Create a shared game</div>
            <p className="text-xs text-muted-foreground">
              Make a room and share the code — each player joins and names their own seat.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Players</span>
              <Button
                size="sm"
                variant="outline"
                aria-label="Fewer players"
                data-testid="seats-dec"
                disabled={busy || lobbySeats <= minPlayers}
                onClick={() => onLobbySeatsChange(Math.max(minPlayers, lobbySeats - 1))}
              >
                −
              </Button>
              <span data-testid="seat-count" className="w-5 text-center text-sm tabular-nums">
                {lobbySeats}
              </span>
              <Button
                size="sm"
                variant="outline"
                aria-label="More players"
                data-testid="seats-inc"
                disabled={busy || lobbySeats >= maxPlayers}
                onClick={() => onLobbySeatsChange(Math.min(maxPlayers, lobbySeats + 1))}
              >
                +
              </Button>
              <Button className="ml-auto" data-testid="create-lobby" disabled={busy || !selected} onClick={onCreateLobby}>
                Create game
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or play hotseat on one device</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2">
            {names.map((name, index) => (
              // eslint-disable-next-line react/no-array-index-key -- rows are positional seats
              <div key={index} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">Seat {index + 1}</span>
                <input
                  aria-label={`Player ${index + 1} name`}
                  data-testid={`player-name-${index}`}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={name}
                  onChange={(event) => onNamesChange(names.map((value, j) => (j === index ? event.target.value : value)))}
                />
                <Button
                  variant={seatIsBot[index] ? 'default' : 'outline'}
                  size="sm"
                  aria-label={`Seat ${index + 1} is played by ${seatIsBot[index] ? 'the AI' : 'a person'}`}
                  aria-pressed={seatIsBot[index] === true}
                  title="Let the AI play this seat"
                  data-testid={`toggle-bot-${index}`}
                  disabled={busy}
                  onClick={() => {
                    const next = names.map((_, j) => seatIsBot[j] === true);
                    next[index] = !next[index];
                    onSeatIsBotChange(next);
                  }}
                >
                  🤖
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove seat ${index + 1}`}
                  data-testid={`remove-player-${index}`}
                  disabled={busy || names.length <= minPlayers}
                  onClick={() => {
                    onNamesChange(names.filter((_, j) => j !== index));
                    onSeatIsBotChange(names.map((_, j) => seatIsBot[j] === true).filter((_, j) => j !== index));
                  }}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            data-testid="add-player"
            disabled={busy || names.length >= maxPlayers}
            onClick={() => onNamesChange([...names, nameForSeat(names.length)])}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add seat
          </Button>

          {names.some((name) => name.trim() === '') && (
            <p className="text-xs text-destructive" data-testid="setup-hint">
              Every seat needs a name.
            </p>
          )}

          <Button
            className="w-full"
            data-testid="start-game"
            disabled={busy || !selected || names.some((name) => name.trim() === '')}
            onClick={onStartHotseat}
          >
            Start game ({names.length} player{names.length === 1 ? '' : 's'})
          </Button>

          <div className="flex items-center gap-2 pt-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or join by code</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex gap-2">
            <input
              aria-label="Game code"
              data-testid="join-code"
              placeholder="Paste a game code to join"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={joinCode}
              onChange={(event) => onJoinCodeChange(event.target.value)}
            />
            <Button variant="outline" data-testid="join-game" disabled={busy || joinCode.trim() === ''} onClick={onJoinByCode}>
              Join
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
