import { Suspense, useEffect, useState } from 'react';
import { Header } from '@/shell/Header';
import { Landing } from '@/shell/Landing';
import { WaitingRoom } from '@/shell/WaitingRoom';
import { useGameTransport } from '@/hooks/useGameTransport';
import { useHomeLists } from '@/hooks/useHomeLists';
import { clientFor } from '@/games/registry';
import * as api from '@/lib/api';
import type { GamePayload, Lobby } from '@/lib/api';

/**
 * The Game Hub shell (roadmap C2).
 *
 * A games room: it owns the landing screen, lobbies, navigation, seat binding, and the transport —
 * and **knows nothing about any game's rules**. A game's state is opaque here; the registry picks a
 * board by `gameType` and that board is the only thing that can read it.
 *
 * **Nothing in `shell/`, `hooks/` or this file may import `@container/engine`.** If you need a rule,
 * a colour, a piece or a seat count, it belongs in `games/<game>/` — the seat range on the landing
 * screen comes from `GET /games/catalog` for exactly this reason. A test enforces the import ban.
 */

/** Prefilled seat names. Generic filler — a hub has no opinion about who plays. */
const NAME_POOL = ['Ann', 'Bob', 'Cid', 'Dan', 'Eve'];
/** Names for AI seats, so a table of bots is still readable at a glance. */
const BOT_NAMES = ['Robo', 'Circuit', 'Widget', 'Bolt', 'Chip'];
const nameForSeat = (index: number) => NAME_POOL[index] ?? `Player ${index + 1}`;

export default function App() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which game a new table is for. Set from the catalog once it loads.
  const [gameType, setGameType] = useState<string | null>(null);
  // Hotseat setup.
  const [names, setNames] = useState<string[]>([]);
  const [seatIsBot, setSeatIsBot] = useState<boolean[]>([]);
  // Shared-game (lobby) setup + waiting-room state.
  const [lobbySeats, setLobbySeats] = useState(0);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  // Seats this client has claimed (a solo tester can fill several; each device usually claims one).
  const [mySeats, setMySeats] = useState<number[]>([]);
  const [seatName, setSeatName] = useState('');
  // The player ids this client controls. `null` = control every seat (hotseat / bare join). An
  // array binds the window to the seats claimed in the lobby: you only act on those players' turns.
  const [controlledIds, setControlledIds] = useState<string[] | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmingAbandon, setConfirmingAbandon] = useState<string | null>(null);

  // Hotseat (null) follows the active player; a seat-bound client streams as its own seats only.
  const viewer = controlledIds === null ? undefined : controlledIds.join(',');
  const transport = useGameTransport(viewer);
  const { game, bots, lastMessage } = transport;

  const onLanding = !game && !lobby;
  const { catalog, openLobbies, activeGames, forget } = useHomeLists(onLanding);

  // Default the new-game form to the first game the server offers, once we know what that is.
  const selected = catalog.find((entry) => entry.id === gameType) ?? catalog[0];
  useEffect(() => {
    if (!selected) return;
    setGameType((current) => current ?? selected.id);
    setLobbySeats((current) => (current === 0 ? selected.minPlayers : current));
    setNames((current) => (current.length === 0 ? NAME_POOL.slice(0, selected.minPlayers) : current));
    setSeatIsBot((current) => (current.length === 0 ? NAME_POOL.slice(0, selected.minPlayers).map(() => false) : current));
  }, [selected]);

  /** Run async work with busy/error handling but no state assignment (for lobby flows). */
  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const applyPayload = (payload: GamePayload) => transport.apply(payload);

  async function run(work: () => Promise<GamePayload>) {
    await guard(async () => applyPayload(await work()));
  }

  /** Reset everything and return to the landing screen. */
  function resetToLanding() {
    transport.clear();
    setLobby(null);
    setMySeats([]);
    setControlledIds(null);
    setError(null);
  }

  // Lobby seats map to player ids in seat order (createGame assigns p1, p2, … by seat).
  const seatsToIds = (seats: number[]) => seats.map((seat) => `p${seat + 1}`);
  // A seat-bound client always views as its OWN seats (comma-separated) — never "follow active" —
  // so it only ever sees its own secret cards. `''` (no seats) is a spectator; `undefined` is hotseat.
  const viewerFor = (ids: string[]) => ids.join(',');

  /** Enter a started game bound to the seats claimed in the lobby (empty seats ⇒ spectator). */
  async function enterGameAs(id: string, seats: number[]) {
    const ids = seatsToIds(seats);
    const mine = await api.getGame(id, viewerFor(ids));
    setControlledIds(ids);
    setLobby(null);
    applyPayload(mine);
  }

  /** Enter a code that may be a lobby or a started game, and route to the right screen. */
  async function joinByCode(code: string) {
    await guard(async () => {
      try {
        const found = await api.getLobby(code);
        if (found.status === 'started' && found.gameId) {
          await enterGameAs(found.gameId, mySeats); // usually a fresh spectator (no claimed seats)
        } else {
          setMySeats([]);
          setLobby(found);
        }
      } catch {
        // Not a lobby code — fall back to a direct game id (a bare join controls every seat).
        setControlledIds(null);
        applyPayload(await api.getGame(code));
      }
    });
  }

  /** Create a shared game (an empty lobby) and enter its waiting room. */
  async function createSharedGame() {
    if (!selected) return;
    await guard(async () => {
      const created = await api.createLobby(selected.id, lobbySeats);
      setMySeats([]);
      setLobby(created);
    });
  }

  /** Join an open game listed on the home screen: claim a seat with the display name and enter it. */
  async function joinFromBrowse(id: string) {
    await guard(async () => {
      const { lobby: updated, seat } = await api.joinLobby(id, displayName.trim());
      setMySeats([seat]);
      setLobby(updated);
    });
  }

  /**
   * Take back a seat you already hold in a waiting room.
   *
   * Leaving a lobby drops only this window's binding — the seat keeps your name server-side — so
   * coming back is a **re-bind, not a claim**: no API write at all. Going through `joinLobby` instead
   * (the only way back before) took the next *empty* seat, which sat you down a second time under
   * your own name and let you fill your own room.
   *
   * The host may have started the game while you were away, so this handles that too rather than
   * dropping you into a waiting room for a game that no longer exists.
   */
  async function rejoinLobbyAs(id: string, seat: number) {
    await guard(async () => {
      const found = await api.getLobby(id);
      if (found.status === 'started' && found.gameId) {
        await enterGameAs(found.gameId, [seat]);
        return;
      }
      setMySeats([seat]);
      setLobby(found);
    });
  }

  /** Resume an in-progress game bound to a chosen seat (no login — just pick who you are). */
  async function resumeAs(gameId: string, playerId: string) {
    await guard(async () => {
      const mine = await api.getGame(gameId, playerId);
      setControlledIds([playerId]);
      applyPayload(mine);
    });
  }

  /**
   * Abandon a game from the home screen: close out something nobody means to finish.
   *
   * Drops the row immediately rather than waiting for the 3s poll to notice — otherwise the game you
   * just abandoned sits there looking live, and you click it again. The poll is still the source of
   * truth; this only avoids the gap.
   */
  async function abandon(gameId: string) {
    await guard(async () => {
      await api.abandonGame(gameId);
      forget(gameId);
      setConfirmingAbandon(null);
    });
  }

  /** Claim the next open seat in the current lobby with the entered name. */
  async function takeSeat() {
    if (!lobby) return;
    await guard(async () => {
      const { lobby: updated, seat } = await api.joinLobby(lobby.id, seatName.trim());
      setMySeats((prev) => [...prev, seat]);
      setLobby(updated);
      setSeatName('');
    });
  }

  /**
   * Fill the next empty seat with an AI. Deliberately *not* added to `mySeats`: the bot plays itself
   * server-side, so claiming it would only make this client think it had a turn to take.
   */
  async function addBotSeat() {
    if (!lobby) return;
    const taken = lobby.members.filter((member) => member !== null).length;
    await guard(async () => {
      const { lobby: updated } = await api.joinLobby(lobby.id, BOT_NAMES[taken % BOT_NAMES.length]!, true);
      setLobby(updated);
    });
  }

  /** Start the current (full) lobby's game, entering it bound to this client's claimed seats. */
  async function startLobbyGame() {
    if (!lobby) return;
    const id = lobby.id;
    const seats = mySeats;
    await guard(async () => {
      const started = await api.startLobby(id);
      const startedId = (started.game as { id: string }).id;
      await enterGameAs(startedId, seats);
    });
  }

  // While waiting in an open lobby, poll it so seats fill in and we transition when the host starts.
  const lobbyId = lobby?.id;
  const lobbyOpen = lobby?.status === 'open';
  useEffect(() => {
    if (!lobbyId || !lobbyOpen) return;
    const timer = setInterval(() => {
      void api
        .getLobby(lobbyId)
        .then(async (fresh) => {
          if (fresh.status === 'started' && fresh.gameId) {
            await enterGameAs(fresh.gameId, mySeats);
          } else {
            setLobby(fresh);
          }
        })
        .catch(() => undefined);
    }, 1500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enterGameAs is stable enough for this poll
  }, [lobbyId, lobbyOpen, mySeats]);

  const gameId = game ? (game as { id: string }).id : null;
  const players = game ? (game as { players: { id: string; name: string }[] }).players : [];
  const myNames = controlledIds ? players.filter((p) => controlledIds.includes(p.id)).map((p) => p.name) : null;

  // The display name you're playing as, so multiple windows are easy to tell apart when playtesting.
  // Prefer your in-game seat name(s); fall back to a claimed lobby seat name.
  const tabName =
    myNames && myNames.length > 0
      ? myNames.join(' & ')
      : lobby && mySeats.length > 0
        ? mySeats.map((seat) => lobby.members[seat]?.name).filter(Boolean).join(' & ')
        : null;

  /**
   * What this screen is called — used for both the `<h1>` and the tab title, so they can't drift.
   *
   * Two parts: where you are, then who you are. Off the board you're in the **Game Hub** — the site is
   * a games room, and the waiting room is part of the hub rather than part of a game. On the board
   * it's the game itself: `Container - [Tim]`. The name comes from the registry, not a constant —
   * that's what makes this the hub rather than one game's app.
   *
   * The `- [name]` suffix follows you into the waiting room (`Game Hub - [Tim]`) on purpose: telling
   * two playtest windows apart is the whole reason the name is here, and the waiting room is exactly
   * when you have several open. It drops off only when there's no one name to show — the landing
   * screen, or hotseat, where every seat is yours.
   */
  const client = transport.gameType ? clientFor(transport.gameType) : undefined;
  const place = game ? (client?.name ?? 'Game') : 'Game Hub';
  const heading = tabName ? `${place} - [${tabName}]` : place;
  useEffect(() => {
    document.title = heading;
  }, [heading]);

  return (
    <div className="min-h-screen">
      <Header
        heading={heading}
        gameId={gameId}
        canLeave={!!game || !!lobby}
        onLeave={resetToLanding}
        status={client?.Status && game ? <client.Status game={game} /> : undefined}
      />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <p
            data-testid="error"
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {game && gameId ? (
          client ? (
            // Lazily fetched on first render of a board — the hub itself ships none of it.
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the board…</p>}>
              <client.Board
                gameId={gameId}
                game={game}
                bots={bots}
                controlledIds={controlledIds}
                viewer={viewer}
                busy={busy}
                guard={guard}
                onPayload={applyPayload}
                onLeave={resetToLanding}
                lastMessage={lastMessage}
              />
            </Suspense>
          ) : (
            // The server hosts a game this build can't draw — a backend deployed ahead of the UI.
            // Say so rather than render an empty board.
            <p data-testid="unknown-game" role="alert" className="text-sm text-muted-foreground">
              This game (“{transport.gameType}”) isn’t available in this version of the app.
            </p>
          )
        ) : lobby ? (
          <WaitingRoom
            lobby={lobby}
            mySeats={mySeats}
            seatName={seatName}
            onSeatNameChange={setSeatName}
            busy={busy}
            onTakeSeat={() => void takeSeat()}
            onAddBot={() => void addBotSeat()}
            onStart={() => void startLobbyGame()}
            onLeave={() => {
              setLobby(null);
              setMySeats([]);
            }}
          />
        ) : (
          <Landing
            catalog={catalog}
            selected={selected}
            onSelect={setGameType}
            openLobbies={openLobbies}
            activeGames={activeGames}
            busy={busy}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            onJoinWaiting={(id) => void joinFromBrowse(id)}
            onRejoinWaiting={(id, seat) => void rejoinLobbyAs(id, seat)}
            onResume={(id, playerId) => void resumeAs(id, playerId)}
            confirmingAbandon={confirmingAbandon}
            onConfirmAbandon={setConfirmingAbandon}
            onAbandon={(id) => void abandon(id)}
            lobbySeats={lobbySeats}
            onLobbySeatsChange={setLobbySeats}
            onCreateLobby={() => void createSharedGame()}
            names={names}
            seatIsBot={seatIsBot}
            onNamesChange={setNames}
            onSeatIsBotChange={setSeatIsBot}
            onStartHotseat={() =>
              selected &&
              void run(() =>
                api.createGame(
                  selected.id,
                  names.map((name, index) => ({ name: name.trim(), bot: seatIsBot[index] === true })),
                ),
              )
            }
            joinCode={joinCode}
            onJoinCodeChange={setJoinCode}
            onJoinByCode={() => void joinByCode(joinCode.trim())}
            nameForSeat={nameForSeat}
          />
        )}
      </main>
    </div>
  );
}
