import { Suspense, useEffect, useState } from 'react';
import { Header } from '@/shell/Header';
import { Shelf } from '@/shell/Shelf';
import { GameDetail } from '@/shell/GameDetail';
import { WaitingRoom } from '@/shell/WaitingRoom';
import { ChatPanel } from '@/shell/ChatPanel';
import { Footer } from '@/shell/Footer';
import { About } from '@/shell/About';
import { useGameTransport } from '@/hooks/useGameTransport';
import { useHomeLists } from '@/hooks/useHomeLists';
import { clientFor } from '@/games/registry';
import * as api from '@/lib/api';
import type { GamePayload, Lobby, RematchInfo } from '@/lib/api';
import { Button, RematchContext } from '@game-hub/ui-kit';

/**
 * The Game Hub shell (roadmap C2).
 *
 * A games room: it owns the landing screen, lobbies, navigation, seat binding, and the transport —
 * and **knows nothing about any game's rules**. A game's state is opaque here; the registry picks a
 * board by `gameType` and that board is the only thing that can read it.
 *
 * **Nothing in `shell/`, `hooks/` or this file may import `@game-hub/engine`.** If you need a rule,
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

  // Which game a new table is for, and which game's detail screen (box lid) is open on the shelf. The
  // shelf shows no detail (`detailGame === null`); opening a lid sets both, so the detail form is built
  // for that game. `gameType` also drives the page heading once a game is running.
  const [gameType, setGameType] = useState<string | null>(null);
  const [detailGame, setDetailGame] = useState<string | null>(null);
  // Hotseat setup.
  const [names, setNames] = useState<string[]>([]);
  const [seatIsBot, setSeatIsBot] = useState<boolean[]>([]);
  // Each hotseat seat's chosen player colour (a palette id), or undefined for the palette-order default.
  // Kept sparse: an unpicked seat stays undefined so a colour-less quick-start reproduces today's tints.
  const [seatColors, setSeatColors] = useState<(string | undefined)[]>([]);
  // Each hotseat bot seat's chosen AI difficulty tier (CS4), or undefined for the default ('normal').
  // Sparse like seatColors: a seat with no explicit pick omits `difficulty` entirely from the request.
  const [seatDifficulties, setSeatDifficulties] = useState<(string | undefined)[]>([]);
  // The AI difficulty to hand a bot added in the waiting room (CS4). Defaults to 'normal'.
  const [botDifficulty, setBotDifficulty] = useState('normal');
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
  // The About screen (footer link). An **overlay screen**, not a place: it takes over `main` from
  // wherever you were and closing it puts you straight back, because none of the state behind it is
  // touched. That's why it isn't folded into the game/lobby/detail/shelf cascade below.
  const [showAbout, setShowAbout] = useState(false);
  // The open rematch proposal for the current (finished) game, or null. Platform state — the shell
  // owns it and feeds the shared GameOver screen through context.
  const [rematch, setRematch] = useState<RematchInfo | null>(null);

  // Hotseat (null) follows the active player; a seat-bound client streams as its own seats only.
  const viewer = controlledIds === null ? undefined : controlledIds.join(',');
  const transport = useGameTransport(viewer);
  const { game, gameId, bots, colors, players, lastMessage, activePlayerId, chat, presence } = transport;

  const onLanding = !game && !lobby;
  const { catalog, openLobbies, activeGames, forget } = useHomeLists(onLanding);

  // The game a new table is being set up for — the open box lid, falling back to the first hosted game
  // so `selected`-dependent handlers stay safe before one is opened.
  const selected = catalog.find((entry) => entry.id === gameType) ?? catalog[0];
  // The selected game's UI plugin, for its box lid / detail blurb+rules+mark. Via the registry (the
  // sanctioned lookup), so the shell shows a game's identity without naming or importing the game itself.
  const selectedClient = selected ? clientFor(selected.id) : undefined;

  /**
   * Open a game's detail screen from the shelf, seeding a fresh setup for *that* game: a sensible default
   * table size, generic filler names, no bots/colours/difficulties. The default is three seats where the
   * game allows it (clamped into `[min, max]`) — a typical table, and the size a quick-start has always
   * produced. Resetting per game (rather than carrying seat state across a switch) keeps a 2-player game
   * from inheriting a table set up for another.
   */
  function openDetail(id: string) {
    const entry = catalog.find((e) => e.id === id) ?? catalog[0];
    if (!entry) return;
    const seats = Math.min(entry.maxPlayers, Math.max(entry.minPlayers, 3));
    setGameType(entry.id);
    setDetailGame(entry.id);
    setLobbySeats(seats);
    setNames(NAME_POOL.slice(0, seats));
    setSeatIsBot(NAME_POOL.slice(0, seats).map(() => false));
    setSeatColors([]);
    setSeatDifficulties([]);
    setError(null);
  }

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

  /** Reset everything and return to the shelf (the landing's front door). */
  function resetToLanding() {
    transport.clear();
    setLobby(null);
    setMySeats([]);
    setControlledIds(null);
    setDetailGame(null);
    setShowAbout(false);
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
   * Resume a game as **pass-and-play** — drive every seat on this one device (`controlledIds = null`),
   * which is what a hotseat game is. Re-entering a hotseat game you left should land you back here, not
   * bound to a single seat.
   */
  async function resumeHotseat(gameId: string) {
    await guard(async () => {
      const full = await api.getGame(gameId);
      setControlledIds(null);
      applyPayload(full);
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

  /** Pick a colour for a seat you hold in the current lobby (the waiting room polls, so it shows live). */
  async function pickColor(seat: number, color: string) {
    if (!lobby) return;
    await guard(async () => setLobby(await api.setLobbyColor(lobby.id, seat, color)));
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
    // The game's tiers, if any (CS4). Only send a difficulty when the game declares one — otherwise
    // the server rejects it, and a game with no tiers must add a bot exactly as before.
    const tiers = catalog.find((entry) => entry.id === lobby.gameType)?.botDifficulties;
    const difficulty = tiers && tiers.includes(botDifficulty) ? botDifficulty : undefined;
    await guard(async () => {
      const { lobby: updated } = await api.joinLobby(
        lobby.id,
        BOT_NAMES[taken % BOT_NAMES.length]!,
        true,
        undefined,
        difficulty,
      );
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
    // enterGameAs closes only over stable setters and its own args (viewerFor(ids), not the outer
    // viewer), so its identity changing never changes its behaviour — listing it would only tear down
    // and rebuild this poll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, lobbyOpen, mySeats]);

  // Seat identity comes from the payload (`players`), never by reading the opaque `game` blob — a
  // game 4 that named its seats differently would otherwise break the header with no type error (§3.3).
  const myNames = controlledIds ? players.filter((p) => controlledIds.includes(p.id)).map((p) => p.name) : null;

  // --- Rematch (platform: play again with the same players). The shell owns it entirely. ---
  // Human seats are the ones this client can agree for; hotseat (null) drives them all.
  const humanIds = players.filter((p) => !bots.includes(p.id)).map((p) => p.id);
  const myHumanIds = (controlledIds ?? humanIds).filter((id) => humanIds.includes(id));

  /** Enter the rematched game keeping our seats — the new game has the same seat structure. */
  async function goToRematch(newId: string) {
    applyPayload(await api.getGame(newId, viewer));
    setRematch(null);
  }

  // Pick up any open proposal when entering (or switching) a game — a finished game may already have one.
  useEffect(() => {
    if (!gameId) {
      setRematch(null);
      return;
    }
    let live = true;
    void api
      .getRematch(gameId)
      .then((r) => {
        if (live) setRematch(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [gameId]);

  // A pushed proposal (someone agreed) or start (a `newGameId`): update the button, or send everyone
  // watching to the new game.
  useEffect(() => {
    if (lastMessage?.type !== 'rematch') return;
    const r: RematchInfo = {
      agreed: (lastMessage.agreed as string[]) ?? [],
      newGameId: (lastMessage.newGameId as string | null) ?? null,
    };
    setRematch(r);
    if (r.newGameId && r.newGameId !== gameId) void goToRematch(r.newGameId);
    // Fire once per FRESH push only. Adding gameId/goToRematch would re-run on the same lastMessage
    // whenever navigation or `viewer` changes, re-triggering the redirect on a stale message —
    // goToRematch genuinely depends on `viewer`, so memoizing it wouldn't remove that hazard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage]);

  /** Send an in-game chat message as `playerId`. The broadcast echoes back over the socket into `chat`. */
  async function sendChatMessage(playerId: string, body: string) {
    if (!gameId) return;
    await guard(async () => {
      await api.sendChat(gameId, playerId, body);
    });
  }

  /** Propose or accept a rematch on behalf of this client's seats. */
  async function requestRematch() {
    if (!gameId) return;
    await guard(async () => {
      const r = await api.proposeRematch(gameId, controlledIds);
      setRematch(r);
      if (r.newGameId && r.newGameId !== gameId) await goToRematch(r.newGameId);
    });
  }

  const rematchControls = {
    onRematch: () => void requestRematch(),
    busy,
    proposed: (rematch?.agreed.length ?? 0) > 0,
    waiting: !!rematch && rematch.newGameId === null && rematch.agreed.some((id) => myHumanIds.includes(id)),
  };

  // The display name you're playing as, so multiple windows are easy to tell apart when playtesting.
  // Prefer your in-game seat name(s); fall back to a claimed lobby seat name.
  const tabName =
    myNames && myNames.length > 0
      ? myNames.join(' & ')
      : lobby && mySeats.length > 0
        ? mySeats
            .map((seat) => lobby.members[seat]?.name)
            .filter(Boolean)
            .join(' & ')
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
    // A column so the footer sits under the content on a short page instead of floating mid-screen.
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-accent/40 via-background to-background">
      <Header
        heading={heading}
        gameId={gameId}
        canLeave={!!game || !!lobby}
        onLeave={resetToLanding}
        status={client?.Status && game ? <client.Status game={game} /> : undefined}
        joinSlot={
          // The front door rides in the menubar: any table's code — lobby or started game — joins from
          // anywhere off the board.
          <>
            <input
              aria-label="Game code"
              data-testid="join-code"
              placeholder="Have a code? Paste it here to join a table"
              className="w-40 min-w-0 rounded-md border border-wood/30 bg-card px-3 py-1.5 text-sm text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-72"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              data-testid="join-game"
              disabled={busy || joinCode.trim() === ''}
              onClick={() => void joinByCode(joinCode.trim())}
            >
              Join
            </Button>
          </>
        }
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {error && (
          <p
            data-testid="error"
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {showAbout ? (
          <About onBack={() => setShowAbout(false)} />
        ) : game && gameId ? (
          <>
            {client ? (
              // Lazily fetched on first render of a board — the hub itself ships none of it. The rematch
              // controls reach the board's shared GameOver screen through context, not through props.
              <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the board…</p>}>
                <RematchContext.Provider value={rematchControls}>
                  <client.Board
                    gameId={gameId}
                    game={game}
                    bots={bots}
                    colors={colors}
                    controlledIds={controlledIds}
                    viewer={viewer}
                    busy={busy}
                    guard={guard}
                    onPayload={applyPayload}
                    onLeave={resetToLanding}
                    lastMessage={lastMessage}
                  />
                </RematchContext.Provider>
              </Suspense>
            ) : (
              // The server hosts a game this build can't draw — a backend deployed ahead of the UI.
              // Say so rather than render an empty board.
              <p data-testid="unknown-game" role="alert" className="text-sm text-muted-foreground">
                This game (“{transport.gameType}”) isn’t available in this version of the app.
              </p>
            )}
            {/* Shell chrome, game-agnostic: chat + presence beside whatever board is showing. */}
            <ChatPanel
              players={players}
              controlledIds={controlledIds}
              activePlayerId={activePlayerId}
              chat={chat}
              presence={presence}
              busy={busy}
              onSend={(playerId, body) => void sendChatMessage(playerId, body)}
            />
          </>
        ) : lobby ? (
          <WaitingRoom
            lobby={lobby}
            mySeats={mySeats}
            palette={catalog.find((entry) => entry.id === lobby.gameType)?.colors ?? []}
            botDifficulties={catalog.find((entry) => entry.id === lobby.gameType)?.botDifficulties ?? []}
            botDifficulty={botDifficulty}
            onBotDifficultyChange={setBotDifficulty}
            onPickColor={(seat, color) => void pickColor(seat, color)}
            seatName={seatName}
            onSeatNameChange={setSeatName}
            busy={busy}
            onTakeSeat={() => void takeSeat()}
            onAddBot={() => void addBotSeat()}
            onStart={() => void startLobbyGame()}
            onLeave={() => {
              setLobby(null);
              setMySeats([]);
              setDetailGame(null);
            }}
          />
        ) : detailGame && selected ? (
          <GameDetail
            selected={selected}
            client={selectedClient}
            busy={busy}
            onBack={() => setDetailGame(null)}
            lobbySeats={lobbySeats}
            onLobbySeatsChange={setLobbySeats}
            onCreateLobby={() => void createSharedGame()}
            names={names}
            seatIsBot={seatIsBot}
            seatColors={seatColors}
            seatDifficulties={seatDifficulties}
            onNamesChange={setNames}
            onSeatIsBotChange={setSeatIsBot}
            onSeatColorsChange={setSeatColors}
            onSeatDifficultiesChange={setSeatDifficulties}
            onStartHotseat={() =>
              selected &&
              void run(() =>
                api.createGame(
                  selected.id,
                  names.map((name, index) => ({
                    name: name.trim(),
                    bot: seatIsBot[index] === true,
                    // Omit an unpicked seat's colour entirely, so the server applies its palette-order
                    // default — a colour-less quick-start stays byte-identical to before this feature.
                    ...(seatColors[index] !== undefined ? { color: seatColors[index] } : {}),
                    // A difficulty only rides along for a bot seat that picked one (CS4); the server
                    // rejects a tier on a human seat, and an unset tier defaults to 'normal'.
                    ...(seatIsBot[index] === true && seatDifficulties[index] !== undefined
                      ? { difficulty: seatDifficulties[index] }
                      : {}),
                  })),
                ),
              )
            }
            nameForSeat={nameForSeat}
          />
        ) : (
          <Shelf
            catalog={catalog}
            onOpen={openDetail}
            busy={busy}
            openLobbies={openLobbies}
            activeGames={activeGames}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            onJoinWaiting={(id) => void joinFromBrowse(id)}
            onRejoinWaiting={(id, seat) => void rejoinLobbyAs(id, seat)}
            onResume={(id, playerId) => void resumeAs(id, playerId)}
            onResumeHotseat={(id) => void resumeHotseat(id)}
            confirmingAbandon={confirmingAbandon}
            onConfirmAbandon={setConfirmingAbandon}
            onAbandon={(id) => void abandon(id)}
          />
        )}
      </main>

      <Footer onAbout={() => setShowAbout(true)} />
    </div>
  );
}
