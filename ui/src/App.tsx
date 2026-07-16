import { Factory as FactoryIcon, Plus, Ship as ShipIcon, Warehouse as WarehouseIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Action, Color, GameState, GameView, PlayerView, ScoringCard, ShipLocation, StoredContainer } from '@container/engine';
import {
  COLORS,
  FACTORY_BUILD_COSTS,
  FACTORY_LOT_PRICES,
  legalActions,
  MAX_LOANS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SHIP_CAPACITY,
  WAREHOUSE_BUILD_COSTS,
} from '@container/engine';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BoardMap } from '@/components/BoardMap';
import { ContainerSvg } from '@/components/art/Container';
import { cn } from '@/lib/utils';
import * as api from '@/lib/api';
import type { GameSummary, Lobby } from '@/lib/api';

/** Display colors for the five container types (see engine COLORS). */
const COLOR_HEX: Record<Color, string> = {
  white: '#f8fafc',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#eab308',
};

/** Prefilled seat names. The first MIN_PLAYERS are the default game; extras fill in as seats are added. */
const NAME_POOL = ['Ann', 'Bob', 'Cid', 'Dan', 'Eve'];
const DEFAULT_NAMES = NAME_POOL.slice(0, MIN_PLAYERS);
const LOT_LABELS = ['I', 'II', 'III'];

/**
 * A single container glyph sized like the old colored swatch (h-4 w-6). Rendered as a
 * `<span title={color}>` so e2e selectors that count `span[title]` / `span` keep working.
 */
function ContainerChip({ color, className }: { color: Color; className?: string }) {
  return (
    <span title={color} className={cn('inline-flex h-4 w-6 shrink-0', className)}>
      <ContainerSvg color={COLOR_HEX[color]} />
    </span>
  );
}

const nameOf = (players: readonly PlayerView[], id: string) => players.find((p) => p.id === id)?.name ?? id;

/** Sort rank for a color on a scoring card ($10 color first, then the two-value color, then $6/$4/$2). */
const cardRank = (card: ScoringCard, color: Color) => (color === card.twoValueColor ? 9 : card.values[color]);

/** Human-readable ship location, e.g. "Ocean" or "Bob's harbor". */
function shipLabel(location: ShipLocation, players: readonly PlayerView[]): string {
  switch (location.kind) {
    case 'ocean':
      return 'Ocean';
    case 'island':
      return 'Container Island';
    case 'bank':
      return 'Off-Shore Bank';
    case 'harbor':
      return `${nameOf(players, location.playerId)}'s harbor`;
  }
}

/** Short label + testid suffix for a sail button target. */
function sailTarget(location: ShipLocation, players: readonly PlayerView[]): { label: string; testid: string } {
  switch (location.kind) {
    case 'ocean':
      return { label: 'Ocean', testid: 'sail-ocean' };
    case 'island':
      return { label: 'Island', testid: 'sail-island' };
    case 'bank':
      return { label: 'Bank', testid: 'sail-bank' };
    case 'harbor':
      return { label: nameOf(players, location.playerId), testid: `sail-harbor-${location.playerId}` };
  }
}

/** Next factory lot price, wrapping around the track. */
function nextFactoryLot(price: number): number {
  const index = FACTORY_LOT_PRICES.indexOf(price as (typeof FACTORY_LOT_PRICES)[number]);
  return FACTORY_LOT_PRICES[(index + 1) % FACTORY_LOT_PRICES.length]!;
}

function StoredChip({
  container,
  testid,
  onClick,
  disabled,
  selected,
}: {
  container: StoredContainer;
  testid: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const swatch = (
    <span
      className={cn(
        'inline-flex h-4 w-6 rounded-sm',
        selected && 'ring-2 ring-ring ring-offset-1',
      )}
    >
      <ContainerSvg color={COLOR_HEX[container.color]} />
    </span>
  );
  const label = <span className="text-[10px] leading-none tabular-nums text-muted-foreground">${container.price}</span>;
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testid}
        title={`Reprice ${container.color} (1 action)`}
        disabled={disabled}
        onClick={onClick}
        className="flex flex-col items-center gap-0.5 rounded transition-transform hover:scale-110 disabled:opacity-50"
      >
        {swatch}
        {label}
      </button>
    );
  }
  return (
    <span data-testid={testid} className="flex flex-col items-center gap-0.5">
      {swatch}
      {label}
    </span>
  );
}

export default function App() {
  const [game, setGame] = useState<GameView | null>(null);
  const [names, setNames] = useState<string[]>(DEFAULT_NAMES);
  const [produceLot, setProduceLot] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which containers the active player has selected to buy (one district, one seller at a time).
  const [pick, setPick] = useState<{ district: 'factory' | 'harbor'; sellerId: string; indices: number[] } | null>(null);
  // Which factory color the active player has selected to build from the shared supply.
  const [buildColor, setBuildColor] = useState<Color | null>(null);
  // The open delivery auction as *this client* may see it — the server holds the sealed bids and
  // reveals them only once every opponent has committed (A1).
  const [auction, setAuction] = useState<api.DeliveryAuctionView | null>(null);
  // The bid being typed, and which seat is entering it. On a shared screen the seats bid one at a
  // time behind a "pass the device" gate, so only one seat is ever mid-bid.
  const [bidDraft, setBidDraft] = useState<number>(0);
  const [bidderSeatId, setBidderSeatId] = useState<string | null>(null);
  // Which tied bidder the deliverer has picked, when a runoff ends level (pg. 16).
  const [tieChoice, setTieChoice] = useState<string | null>(null);
  // Per-container-lot cash bids and per-cash-lot container-count bids for Bank auctions, by lot index.
  const [bankBid, setBankBid] = useState<Record<number, number>>({});
  const [bankCount, setBankCount] = useState<Record<number, number>>({});
  // Code entered on the landing screen to join an existing game or lobby.
  const [joinCode, setJoinCode] = useState('');
  // Shared-game (lobby) setup + waiting-room state.
  const [lobbySeats, setLobbySeats] = useState(MIN_PLAYERS);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  // Seats this client has claimed (a solo tester can fill several; each device usually claims one).
  const [mySeats, setMySeats] = useState<number[]>([]);
  const [seatName, setSeatName] = useState('');
  // The player ids this client controls. `null` = control every seat (hotseat / bare join). An
  // array binds the window to the seats claimed in the lobby: you only act on those players' turns.
  const [controlledIds, setControlledIds] = useState<string[] | null>(null);
  // Open games shown on the home screen, and the display name used to join one.
  const [openLobbies, setOpenLobbies] = useState<Lobby[]>([]);
  const [displayName, setDisplayName] = useState('');
  // In-progress games shown on the home screen, for resuming after a closed tab.
  const [activeGames, setActiveGames] = useState<GameSummary[]>([]);

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

  async function run(work: () => Promise<GameView>) {
    await guard(async () => setGame(await work()));
  }

  /** Reset everything and return to the landing screen. */
  function resetToLanding() {
    setGame(null);
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
    setGame(mine);
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
        setGame(await api.getGame(code));
      }
    });
  }

  /** Create a shared game (an empty lobby) and enter its waiting room. */
  async function createSharedGame() {
    await guard(async () => {
      const created = await api.createLobby(lobbySeats);
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

  /** Resume an in-progress game bound to a chosen seat (no login — just pick who you are). */
  async function resumeAs(gameId: string, playerId: string) {
    await guard(async () => {
      const mine = await api.getGame(gameId, playerId);
      setControlledIds([playerId]);
      setGame(mine);
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

  /** Start the current (full) lobby's game, entering it bound to this client's claimed seats. */
  async function startLobbyGame() {
    if (!lobby) return;
    const id = lobby.id;
    const seats = mySeats;
    await guard(async () => {
      const started = await api.startLobby(id);
      await enterGameAs(started.id, seats);
    });
  }

  // Live sync: while in a game, subscribe to its server stream (as this client's seat) and apply
  // pushed state. The version guard keeps a late push from overwriting newer state from a POST.
  const gameId = game?.id;
  // Hotseat (null) follows the active player; a seat-bound client streams as its own seats only.
  const streamViewer = controlledIds === null ? undefined : controlledIds.join(',');
  useEffect(() => {
    if (!gameId) return;
    return api.subscribeGame(
      gameId,
      (pushed) => setGame((prev) => (prev && prev.id === pushed.id && pushed.version >= prev.version ? pushed : prev)),
      streamViewer,
      setAuction,
    );
  }, [gameId, streamViewer]);

  // The stream only pushes an auction when one *changes*, so a client that joins or reloads while
  // one is already open would see nothing until the next bid. Re-fetch whenever the game reaches (or
  // leaves) a delivery, which also means a dropped push can't strand the panel: the auction is
  // derived from the game state, never only from a message we hope arrived.
  const auctionKey = game
    ? `${game.turn}:${game.activePlayerIndex}:${game.players[game.activePlayerIndex]?.ship.location.kind}:${
        game.players[game.activePlayerIndex]?.ship.cargo.length ?? 0
      }`
    : null;
  useEffect(() => {
    if (!gameId) {
      setAuction(null);
      return;
    }
    void api.getAuction(gameId, controlledIds?.length === 1 ? controlledIds[0] : undefined).then(setAuction, () => {});
  }, [gameId, auctionKey, controlledIds]);

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

  // On the home screen, poll the list of open games so friends can hop into one another started.
  const onLanding = !game && !lobby;
  useEffect(() => {
    if (!onLanding) return;
    let active = true;
    const load = () => {
      void api
        .listLobbies()
        .then((list) => active && setOpenLobbies(list))
        .catch(() => undefined);
      void api
        .listActiveGames()
        .then((list) => active && setActiveGames(list))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [onLanding]);

  // legalActions is a pure read over observable state and never inspects hidden scoring cards,
  // so passing the redacted per-viewer view (which only nulls out opponents' cards) is safe.
  const legal = game ? legalActions(game as unknown as GameState) : [];
  const can = (type: Action['type']) => legal.some((action) => action.type === type);
  const buildableColors = legal
    .filter((action): action is Extract<Action, { type: 'BUILD_FACTORY' }> => action.type === 'BUILD_FACTORY')
    .map((action) => action.color);
  const sailActions = legal.filter((action): action is Extract<Action, { type: 'SAIL' }> => action.type === 'SAIL');
  const activePlayer = game ? game.players[game.activePlayerIndex] : undefined;
  // This client may drive the game only when it controls the active seat (or controls all seats, in
  // hotseat). This is what binds the window to the seat you joined as and locks other players' turns.
  const canDrive = !controlledIds || (!!activePlayer && controlledIds.includes(activePlayer.id));
  const myNames =
    controlledIds && game ? game.players.filter((p) => controlledIds.includes(p.id)).map((p) => p.name) : null;

  // Put the display name you're playing as in the tab title, so multiple windows are easy to tell
  // apart when playtesting. Prefer your in-game seat name(s); fall back to a claimed lobby seat name.
  const tabName =
    myNames && myNames.length > 0
      ? myNames.join(' & ')
      : lobby && mySeats.length > 0
        ? mySeats.map((seat) => lobby.members[seat]).filter(Boolean).join(' & ')
        : null;
  useEffect(() => {
    document.title = tabName ? `Container [${tabName}]` : 'Container';
  }, [tabName]);

  const nextFactoryCost = activePlayer ? FACTORY_BUILD_COSTS[activePlayer.factories.length - 1] : undefined;
  const containersGone = game ? COLORS.filter((color) => game.supply.containers[color] === 0).length : 0;
  const mustDeliverNow =
    !!activePlayer && activePlayer.ship.location.kind === 'island' && activePlayer.ship.cargo.length > 0;

  // Which seats does this client answer for? Hotseat (`null`) drives every seat, so it must collect
  // every opponent's bid — one at a time, behind a pass-the-device gate.
  const mySeatIds = controlledIds ?? game?.players.map((p) => p.id) ?? [];
  const iAmDeliverer = !!auction && mySeatIds.includes(auction.delivererId);
  /** My seats that still owe a bid, in seat order. */
  const seatsStillToBid = auction
    ? auction.bidders.filter((b) => !b.hasBid && mySeatIds.includes(b.playerId)).map((b) => b.playerId)
    : [];
  const bidsOutstanding = auction ? auction.bidders.filter((b) => !b.hasBid).length : 0;

  function act(playerId: string, action: Action) {
    if (!game || !canDrive) return; // only the client controlling the active seat may submit moves
    setPick(null);
    setBuildColor(null);
    void run(() => api.applyAction(game.id, playerId, action, streamViewer));
  }

  /** Toggle a container into/out of the current buy selection. */
  function toggleBuy(district: 'factory' | 'harbor', sellerId: string, index: number) {
    setPick((prev) => {
      if (!prev || prev.district !== district || prev.sellerId !== sellerId) {
        return { district, sellerId, indices: [index] };
      }
      const indices = prev.indices.includes(index)
        ? prev.indices.filter((i) => i !== index)
        : [...prev.indices, index];
      return indices.length ? { district, sellerId, indices } : null;
    });
  }

  /**
   * Commit one seat's sealed bid. The amount goes straight to the server and is never held in this
   * client's state — that is what stops the deliverer's screen from seeing it.
   */
  function submitBid(playerId: string) {
    if (!game) return;
    const amount = bidDraft;
    setBidderSeatId(null);
    setBidDraft(0);
    void run(async () => {
      await api.placeBid(game.id, playerId, amount);
      // Refresh from the server rather than trusting the local echo: the auction may have just
      // flipped to `decision` if this was the last bid.
      setAuction(await api.getAuction(game.id, controlledIds?.length === 1 ? controlledIds[0] : undefined));
      return game;
    });
  }

  /**
   * Deliverer only: accept the high bid (bid + matching subsidy), or buy out and keep the cargo.
   * `winnerId` is required exactly when a runoff ended level and the cargo is going to a bidder.
   */
  function resolveDelivery(buyout: boolean, winnerId?: string) {
    if (!game || !auction) return;
    setPick(null);
    setBuildColor(null);
    setTieChoice(null);
    void run(() => api.resolveAuction(game.id, auction.delivererId, buyout, streamViewer, winnerId));
  }

  /** Buy every selected container from the seller in a single action. */
  function commitBuy() {
    if (!game || !pick) return;
    const active = game.players[game.activePlayerIndex];
    const seller = game.players.find((p) => p.id === pick.sellerId);
    if (!active || !seller) return;
    const store = pick.district === 'factory' ? seller.factoryStore : seller.harborStore;
    const bought = pick.indices
      .map((i) => store[i])
      .filter((c): c is StoredContainer => c !== undefined)
      .map((c) => ({ color: c.color, price: c.price }));
    const action: Action =
      pick.district === 'factory'
        ? { type: 'FACTORY_PURCHASE', sellerId: pick.sellerId, bought }
        : { type: 'HARBOR_PURCHASE', bought };
    setPick(null);
    void run(() => api.applyAction(game.id, active.id, action, streamViewer));
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Container</h1>
          {game && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="game-code"
                data-game-id={game.id}
                title="Copy game code — share it so another device can join this game"
                onClick={() => void navigator.clipboard?.writeText(game.id).catch(() => undefined)}
                className="hidden items-center gap-1 rounded border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent sm:inline-flex"
              >
                <span aria-hidden>🔗</span> {game.id.slice(0, 8)}
              </button>
              <span data-testid="turn-info" className="text-sm text-muted-foreground">
                Turn {game.turn} · <span className="font-medium text-foreground">{game.players[game.activePlayerIndex]?.name}</span>{' '}
                · {game.actionsRemaining} action{game.actionsRemaining === 1 ? '' : 's'} left
              </span>
              <Button variant="outline" size="sm" data-testid="new-game" onClick={resetToLanding}>
                New game
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error && (
          <p
            role="alert"
            data-testid="error"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {game ? (
          <>
            {controlledIds && game.status === 'active' && (
              <div
                data-testid="identity-banner"
                className={cn(
                  'mb-4 flex flex-wrap items-center gap-x-2 rounded-lg border px-4 py-2 text-sm',
                  canDrive ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground',
                )}
              >
                {myNames && myNames.length > 0 ? (
                  <span>
                    You are <span className="font-semibold text-foreground">{myNames.join(' & ')}</span>.
                  </span>
                ) : (
                  <span>Spectating.</span>
                )}
                <span data-testid="turn-status">
                  {canDrive ? '✋ Your turn — take your actions.' : `Waiting for ${activePlayer?.name}…`}
                </span>
              </div>
            )}
            {/*
              The delivery auction (A1). Deliberately top-level rather than inside the active
              player's card: the people who need it most are the *opponents*, whose turn it isn't.
              Each client only ever sees its own bid — the server holds the rest until the reveal.
            */}
            {auction && game.status === 'active' && (
              <Card className="reveal-in mb-4 border-primary/50" data-testid="auction">
                <CardHeader>
                  <CardTitle className="text-base">
                    Delivery auction — {nameOf(game.players, auction.delivererId)} is delivering
                    {auction.phase === 'runoff' && <span className="ml-2 text-destructive">· runoff!</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Cargo:</span>
                    {auction.cargo.map((color, cargoIndex) => (
                      <ContainerChip key={cargoIndex} color={color as Color} />
                    ))}
                  </div>

                  {/*
                    A runoff keeps the opening bids on the table (pg. 16): the tied players add cash
                    knowing exactly what they're level on, which is the whole tension of the round.
                  */}
                  {auction.phase === 'runoff' && auction.revealed && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs" data-testid="runoff-banner">
                      Tied at ${Math.max(0, ...Object.values(auction.revealed))} —{' '}
                      {auction.bidders.map((b) => nameOf(game.players, b.playerId)).join(' and ')} add cash to their
                      existing bid. Highest total wins.
                    </p>
                  )}

                  {/* Who still owes a bid this round. That someone has bid is public; the amount is not. */}
                  <div className="flex flex-wrap gap-2 text-xs" data-testid="auction-bidders">
                    {auction.bidders.map((bidder) => (
                      <span
                        key={bidder.playerId}
                        data-testid={`bidder-${bidder.playerId}`}
                        className={cn(
                          'rounded-full border px-2 py-0.5',
                          bidder.hasBid ? 'border-primary/50 bg-primary/10' : 'text-muted-foreground',
                        )}
                      >
                        {nameOf(game.players, bidder.playerId)} {bidder.hasBid ? '✓ bid' : '… thinking'}
                      </span>
                    ))}
                  </div>

                  {auction.phase !== 'decision' ? (
                    seatsStillToBid.length > 0 ? (
                      bidderSeatId === null ? (
                        /*
                          Pass-the-device gate. On a shared screen one client answers for every seat,
                          so the bid box stays hidden until that player says they're looking — which
                          is what makes a "secret" bid actually secret on one device.
                        */
                        <div className="space-y-2 rounded-md border border-dashed p-3 text-center">
                          <p className="text-sm">
                            {controlledIds === null ? 'Pass the device to ' : 'Your turn to bid, '}
                            <span className="font-semibold">{nameOf(game.players, seatsStillToBid[0]!)}</span>
                          </p>
                          <Button
                            size="sm"
                            data-testid="reveal-bid-entry"
                            disabled={busy}
                            onClick={() => {
                              setBidderSeatId(seatsStillToBid[0]!);
                              setBidDraft(0);
                            }}
                          >
                            I'm {nameOf(game.players, seatsStillToBid[0]!)} — enter my bid
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2 rounded-md border p-3">
                          <label className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium">
                              {auction.phase === 'runoff'
                                ? `${nameOf(game.players, bidderSeatId)} adds to their $${auction.revealed?.[bidderSeatId] ?? 0} bid`
                                : `${nameOf(game.players, bidderSeatId)}'s secret bid`}
                            </span>
                            <input
                              type="number"
                              min={0}
                              // A runoff bid stacks on top of the opening bid, so what's left to
                              // spend is the cash still in hand, not the whole pile.
                              max={
                                (game.players.find((p) => p.id === bidderSeatId)?.money ?? 0) -
                                (auction.phase === 'runoff' ? (auction.revealed?.[bidderSeatId] ?? 0) : 0)
                              }
                              autoFocus
                              data-testid="bid-input"
                              className="w-24 rounded-md border bg-background px-2 py-1 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              value={bidDraft}
                              onChange={(event) => setBidDraft(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                            />
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {auction.phase === 'runoff'
                              ? 'Added to your first bid — you never get that back. Highest total wins.'
                              : '$0 is a legal bluff. Nobody sees this until everyone has bid.'}
                          </p>
                          <Button
                            size="sm"
                            className="w-full"
                            data-testid="submit-bid"
                            disabled={busy}
                            onClick={() => submitBid(bidderSeatId)}
                          >
                            Place sealed bid
                          </Button>
                        </div>
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground" data-testid="auction-waiting">
                        {iAmDeliverer
                          ? `Waiting for ${bidsOutstanding} opponent${bidsOutstanding === 1 ? '' : 's'} to bid…`
                          : 'Bid placed. Waiting for the other players…'}
                      </p>
                    )
                  ) : (
                    <div className="space-y-3" data-testid="auction-reveal">
                      {/* Every bid is in, so revealing them all at once keeps the bidding simultaneous. */}
                      <div className="space-y-1">
                        {Object.keys(auction.revealed ?? {}).map((playerId) => {
                          const opening = auction.revealed?.[playerId] ?? 0;
                          const added = auction.runoffRevealed?.[playerId];
                          const total = opening + (added ?? 0);
                          return (
                            <div
                              key={playerId}
                              data-testid={`revealed-${playerId}`}
                              className={cn(
                                'flex justify-between rounded px-2 py-1 text-sm',
                                total === auction.winningBid && 'bg-primary/10 font-medium',
                              )}
                            >
                              <span>{nameOf(game.players, playerId)}</span>
                              <span className="tabular-nums">
                                {added === undefined ? (
                                  `$${opening}`
                                ) : (
                                  // Show the arithmetic: a runoff total is the opening bid *plus*
                                  // the addition, and players will want to check it.
                                  <>
                                    <span className="text-muted-foreground">
                                      ${opening} + ${added} ={' '}
                                    </span>
                                    ${total}
                                  </>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {iAmDeliverer ? (
                        <>
                          {/*
                            A runoff that ends level is the deliverer's call (pg. 16) — the engine
                            refuses to guess, so the choice must be made here before Deliver unlocks.
                          */}
                          {auction.choiceRequired.length > 0 && (
                            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-2" data-testid="tie-choice">
                              <p className="text-xs font-medium text-destructive">
                                Still tied at ${auction.winningBid} — you choose who gets the cargo:
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {auction.choiceRequired.map((playerId) => (
                                  <Button
                                    key={playerId}
                                    size="sm"
                                    variant={tieChoice === playerId ? 'default' : 'outline'}
                                    data-testid={`choose-winner-${playerId}`}
                                    onClick={() => setTieChoice(playerId)}
                                  >
                                    {nameOf(game.players, playerId)}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              data-testid="deliver"
                              disabled={busy || (auction.choiceRequired.length > 0 && tieChoice === null)}
                              onClick={() => resolveDelivery(false, tieChoice ?? undefined)}
                            >
                              Deliver (earn ${(auction.winningBid ?? 0) * 2})
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              data-testid="buyout"
                              disabled={busy}
                              // A buyout needs no winner: every tied bidder just takes their bid back.
                              onClick={() => resolveDelivery(true)}
                            >
                              Buy out (${auction.winningBid ?? 0})
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Waiting for {nameOf(game.players, auction.delivererId)} to accept or buy out…
                        </p>
                      )}
                    </div>
                  )}

                  {/*
                    Loans are the one action legal on someone else's turn (pg. 16) — precisely so a
                    broke player can afford to bid. Without this the rule has nowhere to happen.
                  */}
                  {auction.phase === 'bidding' &&
                    seatsStillToBid.length > 0 &&
                    (game.players.find((p) => p.id === seatsStillToBid[0]!)?.loans ?? 0) < MAX_LOANS && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full text-xs"
                        data-testid="auction-loan"
                        disabled={busy}
                        onClick={() => {
                          const seat = seatsStillToBid[0]!;
                          void run(() => api.applyAction(game.id, seat, { type: 'REQUEST_LOAN' }, streamViewer));
                        }}
                      >
                        Short on cash? Take a $10 Bank loan
                      </Button>
                    )}
                </CardContent>
              </Card>
            )}

            {game.status === 'ended' && (
              <Card className="reveal-in mb-4" data-testid="results">
                <CardHeader>
                  <CardTitle data-testid="winner">
                    🏁 Game over — {game.winnerIds.map((id) => nameOf(game.players, id)).join(' & ')}{' '}
                    win{game.winnerIds.length > 1 ? '' : 's'}!
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="px-2 py-1">Player</th>
                          <th className="px-2 py-1 text-right">Cash</th>
                          <th className="px-2 py-1 text-right">Island</th>
                          <th className="px-2 py-1 text-right">Leftover</th>
                          <th className="px-2 py-1 text-right">Loans</th>
                          <th className="px-2 py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...game.results]
                          .sort((a, b) => b.total - a.total)
                          .map((r) => {
                            const isWinner = game.winnerIds.includes(r.playerId);
                            return (
                              <tr key={r.playerId} data-testid={`result-${r.playerId}`} className={cn('border-b', isWinner && 'font-semibold')}>
                                <td className="px-2 py-1">
                                  {nameOf(game.players, r.playerId)}
                                  {isWinner && ' 👑'}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums">${r.cash}</td>
                                <td className="px-2 py-1 text-right tabular-nums">${r.islandScore}</td>
                                <td className="px-2 py-1 text-right tabular-nums">${r.leftover}</td>
                                <td className="px-2 py-1 text-right tabular-nums">−${r.loanPenalty}</td>
                                <td className="px-2 py-1 text-right tabular-nums" data-testid={`total-${r.playerId}`}>
                                  ${r.total}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  <Button className="mt-3" variant="outline" data-testid="new-game-end" onClick={resetToLanding}>
                    New game
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="mb-4" data-testid="supply">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-sm font-medium">Containers left</span>
                  {COLORS.map((color) => {
                    const count = game.supply.containers[color];
                    return (
                      <span
                        key={color}
                        data-testid={`supply-container-${color}`}
                        title={`${color}: ${count} left in the supply`}
                        className={cn(
                          'flex items-center gap-1 text-xs tabular-nums',
                          count === 0 && 'font-semibold text-destructive',
                        )}
                      >
                        <ContainerChip color={color} />
                        ×{count}
                      </span>
                    );
                  })}
                  <span className="text-xs text-muted-foreground" data-testid="endgame-hint">
                    {containersGone === 0
                      ? 'Game ends when 2 colors run out'
                      : `${containersGone}/2 colors exhausted — game ends at 2`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Factory supply</span>
                    {COLORS.map((color) => {
                      const count = game.supply.factories[color];
                      const selectable = buildableColors.includes(color) && !busy;
                      return (
                        <button
                          key={color}
                          type="button"
                          data-testid={`supply-factory-${color}`}
                          title={`${color}: ${count} available`}
                          disabled={!selectable}
                          onClick={() => setBuildColor(color)}
                          className={cn(
                            'flex items-center gap-1 rounded border px-1.5 py-1 text-xs tabular-nums transition-colors',
                            selectable ? 'hover:bg-accent' : 'opacity-40',
                            buildColor === color && 'ring-2 ring-ring',
                          )}
                        >
                          <ContainerChip color={color} />
                          ×{count}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <WarehouseIcon className="h-4 w-4" aria-hidden />
                    <span data-testid="supply-warehouses">Warehouses: {game.supply.warehouses}</span>
                  </div>

                  {activePlayer && canDrive && buildColor && buildableColors.includes(buildColor) && nextFactoryCost !== undefined && (
                    <Button
                      size="sm"
                      className="sm:ml-auto"
                      data-testid="build-factory"
                      disabled={busy}
                      onClick={() => act(activePlayer.id, { type: 'BUILD_FACTORY', color: buildColor })}
                    >
                      <FactoryIcon className="h-4 w-4" aria-hidden /> Build {buildColor} factory (${nextFactoryCost})
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="mb-4" data-testid="bank">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">Off-Shore Bank</span>
                  <span className="text-xs text-muted-foreground" data-testid="bank-tokens">
                    Tokens: {game.bank.tokens}
                  </span>
                  <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    Cash lots:
                    {game.bank.cashLots.map((cash, i) => (
                      <span key={i} data-testid={`bank-cash-${i}`} className="tabular-nums">
                        {LOT_LABELS[i]} ${cash}
                      </span>
                    ))}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3">
                  {game.bank.containerLots.map((lot, i) => {
                    const auction = game.bank.auctions.find((a) => a.lotKind === 'container' && a.lotIndex === i);
                    const callable = canDrive && legal.some((a) => a.type === 'CALL_BANK' && a.lotIndex === i);
                    const minBid = auction ? auction.bid + 1 : 1;
                    const bid = bankBid[i] ?? minBid;
                    return (
                      <div key={i} className="rounded-md border p-2" data-testid={`bank-container-${i}`}>
                        <div className="mb-1 text-xs font-medium">Lot {LOT_LABELS[i]}</div>
                        <div className="flex min-h-6 flex-wrap gap-1">
                          {lot.length === 0 ? (
                            <span className="text-xs text-muted-foreground">empty</span>
                          ) : (
                            lot.map((color, ci) => (
                              <ContainerChip key={ci} color={color} />
                            ))
                          )}
                        </div>
                        {auction && (
                          <div className="mt-1 text-xs text-muted-foreground" data-testid={`bank-auction-${i}`}>
                            {nameOf(game.players, auction.highBidderId)} leads ${auction.bid}
                          </div>
                        )}
                        {callable && activePlayer && (
                          <div className="mt-1 flex items-center gap-1">
                            <input
                              type="number"
                              min={minBid}
                              data-testid={`bank-bid-${i}`}
                              className="w-14 rounded border bg-background px-1 py-0.5 text-right text-xs"
                              value={bid}
                              onChange={(event) =>
                                setBankBid((prev) => ({
                                  ...prev,
                                  [i]: Math.max(minBid, Math.floor(Number(event.target.value) || minBid)),
                                }))
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`bank-call-${i}`}
                              disabled={busy}
                              onClick={() => act(activePlayer.id, { type: 'CALL_BANK', lotIndex: i, bid })}
                            >
                              {auction ? 'Outbid' : 'Call'}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-3">
                  {game.bank.cashLots.map((cash, i) => {
                    const auction = game.bank.auctions.find((a) => a.lotKind === 'cash' && a.lotIndex === i);
                    const callable = canDrive && legal.some((a) => a.type === 'CALL_BANK' && a.lotKind === 'cash' && a.lotIndex === i);
                    const minCount = auction ? auction.bid + 1 : 1;
                    const count = bankCount[i] ?? minCount;
                    const board = activePlayer
                      ? [...activePlayer.factoryStore, ...activePlayer.harborStore].sort((a, b) => a.price - b.price)
                      : [];
                    return (
                      <div key={i} className="rounded-md border p-2" data-testid={`bank-cash-lot-${i}`}>
                        <div className="mb-1 text-xs font-medium">
                          Cash {LOT_LABELS[i]} — ${cash}
                        </div>
                        {auction && (
                          <div className="mb-1 text-xs text-muted-foreground" data-testid={`bank-cash-auction-${i}`}>
                            {nameOf(game.players, auction.highBidderId)} leads {auction.bid} container
                            {auction.bid === 1 ? '' : 's'}
                          </div>
                        )}
                        {callable && activePlayer && (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={minCount}
                              max={board.length}
                              data-testid={`bank-count-${i}`}
                              className="w-14 rounded border bg-background px-1 py-0.5 text-right text-xs"
                              value={count}
                              onChange={(event) =>
                                setBankCount((prev) => ({
                                  ...prev,
                                  [i]: Math.max(minCount, Math.floor(Number(event.target.value) || minCount)),
                                }))
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`bank-cash-call-${i}`}
                              disabled={busy || count > board.length}
                              onClick={() =>
                                act(activePlayer.id, {
                                  type: 'CALL_BANK',
                                  lotKind: 'cash',
                                  lotIndex: i,
                                  containerBid: board.slice(0, count),
                                })
                              }
                            >
                              {auction ? 'Outbid' : 'Bid'}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {activePlayer && (
              <BoardMap
                game={game}
                sailActions={canDrive ? sailActions : []}
                onSail={(action) => act(activePlayer.id, action)}
                busy={busy}
              />
            )}

            <section
              aria-label="Player boards"
              data-testid="board"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
            {game.players.map((player, index) => {
              const isActive = index === game.activePlayerIndex;
              // The server only sends a player's secret scoring card to that player (all cards at game end).
              const card = player.scoringCard;
              const nextWarehouseCost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1];
              const capacity = Math.min(player.factories.length, player.factoryLimit - player.factoryStore.length);
              const canReprice = isActive && can('REPRICE') && !busy && canDrive;

              // Buying is done by the active player from THIS card's player (an opponent).
              const active = game.players[game.activePlayerIndex]!;
              const canFactoryBuy =
                !isActive &&
                !busy &&
                canDrive &&
                legal.some((a) => a.type === 'FACTORY_PURCHASE' && a.sellerId === player.id) &&
                active.harborStore.length < active.harborLimit;
              const activeShipLoc = active.ship.location;
              const canHarborBuy =
                !isActive &&
                !busy &&
                canDrive &&
                activeShipLoc.kind === 'harbor' &&
                activeShipLoc.playerId === player.id &&
                active.ship.cargo.length < SHIP_CAPACITY &&
                player.harborStore.length > 0;

              // Current buy selection against this card's store (if any).
              const factoryPick = pick?.district === 'factory' && pick.sellerId === player.id ? pick.indices : [];
              const factoryPickCost = factoryPick.reduce((s, i) => s + (player.factoryStore[i]?.price ?? 0), 0);
              const factoryPickOk =
                factoryPick.length > 0 &&
                active.money >= factoryPickCost &&
                active.harborStore.length + factoryPick.length <= active.harborLimit;
              const harborPick = pick?.district === 'harbor' && pick.sellerId === player.id ? pick.indices : [];
              const harborPickCost = harborPick.reduce((s, i) => s + (player.harborStore[i]?.price ?? 0), 0);
              const harborPickOk =
                harborPick.length > 0 &&
                active.money >= harborPickCost &&
                active.ship.cargo.length + harborPick.length <= SHIP_CAPACITY;
              return (
                <Card
                  key={player.id}
                  data-testid={`player-card-${player.id}`}
                  data-active={isActive}
                  className={cn(isActive && 'ring-2 ring-ring')}
                >
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{player.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      {player.loans > 0 && (
                        <span
                          data-testid={`loans-${player.id}`}
                          className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                        >
                          🏦 {player.loans} loan{player.loans === 1 ? '' : 's'}
                        </span>
                      )}
                      <span
                        data-testid={`money-${player.id}`}
                        className="rounded-full bg-secondary px-2 py-0.5 text-sm font-medium tabular-nums"
                      >
                        ${player.money}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <FactoryIcon className="h-4 w-4" aria-hidden />
                      <span>Factories</span>
                      {player.factories.map((factory) => (
                        <ContainerChip key={factory.id} color={factory.color} />
                      ))}
                      <span className="ml-auto inline-flex items-center gap-1" data-testid={`warehouses-${player.id}`}>
                        <WarehouseIcon className="h-4 w-4" aria-hidden />
                        {player.warehouses}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid={`ship-${player.id}`}>
                      <ShipIcon className="h-4 w-4" aria-hidden />
                      <span>{shipLabel(player.ship.location, game.players)}</span>
                      <span className="flex flex-wrap gap-1" data-testid={`cargo-${player.id}`}>
                        {player.ship.cargo.map((color, cargoIndex) => (
                          <ContainerChip key={cargoIndex} color={color} />
                        ))}
                      </span>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Factory store
                          {canReprice ? ' (click to reprice)' : canFactoryBuy ? ' (click to buy)' : ''}
                        </span>
                        <span data-testid={`store-count-${player.id}`}>
                          {player.factoryStore.length} / {player.factoryLimit}
                        </span>
                      </div>
                      <div className="flex min-h-8 flex-wrap items-end gap-2" data-testid={`store-${player.id}`}>
                        {player.factoryStore.map((container, chipIndex) => (
                          <StoredChip
                            key={chipIndex}
                            container={container}
                            testid={`store-chip-${player.id}-${chipIndex}`}
                            disabled={busy}
                            selected={factoryPick.includes(chipIndex)}
                            onClick={
                              canReprice
                                ? () =>
                                    act(player.id, {
                                      type: 'REPRICE',
                                      district: 'factory',
                                      arrangement: player.factoryStore.map((current, i) =>
                                        i === chipIndex ? { color: current.color, price: nextFactoryLot(current.price) } : current,
                                      ),
                                    })
                                : canFactoryBuy
                                  ? () => toggleBuy('factory', player.id, chipIndex)
                                  : undefined
                            }
                          />
                        ))}
                      </div>
                      {canFactoryBuy && factoryPick.length > 0 && (
                        <Button
                          size="sm"
                          className="mt-2 w-full"
                          data-testid={`buy-factory-${player.id}`}
                          disabled={busy || !factoryPickOk}
                          onClick={commitBuy}
                        >
                          Buy {factoryPick.length} for ${factoryPickCost}
                        </Button>
                      )}
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Harbor{canHarborBuy ? ' (click to load ship)' : ''}</span>
                        <span data-testid={`harbor-count-${player.id}`}>
                          {player.harborStore.length} / {player.harborLimit}
                        </span>
                      </div>
                      <div className="flex min-h-8 flex-wrap items-end gap-2" data-testid={`harbor-${player.id}`}>
                        {player.harborStore.map((container, chipIndex) => (
                          <StoredChip
                            key={chipIndex}
                            container={container}
                            testid={`harbor-chip-${player.id}-${chipIndex}`}
                            disabled={busy}
                            selected={harborPick.includes(chipIndex)}
                            onClick={canHarborBuy ? () => toggleBuy('harbor', player.id, chipIndex) : undefined}
                          />
                        ))}
                      </div>
                      {canHarborBuy && harborPick.length > 0 && (
                        <Button
                          size="sm"
                          className="mt-2 w-full"
                          data-testid={`buy-harbor-${player.id}`}
                          disabled={busy || !harborPickOk}
                          onClick={commitBuy}
                        >
                          Load {harborPick.length} for ${harborPickCost}
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid={`scoring-${player.id}`}>
                      <span>Island:</span>
                      {player.scoringArea.length === 0 ? (
                        <span>—</span>
                      ) : (
                        player.scoringArea.map((color, scoreIndex) => (
                          <ContainerChip key={scoreIndex} color={color} />
                        ))
                      )}
                    </div>

                    <div className="border-t pt-2 text-xs" data-testid={`scoring-card-${player.id}`}>
                      {card ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-medium">{isActive ? 'Your card:' : 'Card:'}</span>
                          {[...COLORS]
                            .sort((a, b) => cardRank(card, b) - cardRank(card, a))
                            .map((color) => {
                              const isTwo = color === card.twoValueColor;
                              return (
                                <span key={color} className="flex items-center gap-1">
                                  <ContainerChip color={color} />
                                  {isTwo ? `$10/$${card.values[color]} ★` : `$${card.values[color]}`}
                                </span>
                              );
                            })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">🂠 Secret scoring card</span>
                      )}
                    </div>

                    {player.holdingArea.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid={`holding-${player.id}`}>
                        <span>Bank holding:</span>
                        {player.holdingArea.map((color, holdIndex) => (
                          <ContainerChip key={holdIndex} color={color} />
                        ))}
                      </div>
                    )}

                    {isActive && canDrive && !mustDeliverNow && (
                        <div className="space-y-2 border-t pt-3" data-testid="controls">
                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">Produce into lot</div>
                          <div className="flex flex-wrap gap-1">
                            {FACTORY_LOT_PRICES.map((price) => (
                              <button
                                key={price}
                                type="button"
                                data-testid={`produce-lot-${price}`}
                                onClick={() => setProduceLot(price)}
                                className={cn(
                                  'h-7 w-9 rounded border text-xs tabular-nums',
                                  produceLot === price ? 'bg-primary text-primary-foreground' : 'bg-background',
                                )}
                              >
                                ${price}
                              </button>
                            ))}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          className="w-full"
                          data-testid={`produce-${player.id}`}
                          disabled={busy || !can('PRODUCE')}
                          onClick={() =>
                            act(player.id, {
                              type: 'PRODUCE',
                              placements: player.factories.slice(0, capacity).map((f) => ({ color: f.color, price: produceLot })),
                            })
                          }
                        >
                          <Plus className="h-4 w-4" aria-hidden /> Produce into ${produceLot}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          data-testid="build-warehouse"
                          disabled={busy || !can('BUILD_WAREHOUSE')}
                          onClick={() => act(player.id, { type: 'BUILD_WAREHOUSE' })}
                        >
                          <WarehouseIcon className="h-4 w-4" aria-hidden /> Build warehouse
                          {nextWarehouseCost !== undefined ? ` ($${nextWarehouseCost})` : ''}
                        </Button>

                        <div>
                          <div className="mb-1 text-xs text-muted-foreground">Sail to</div>
                          <div className="flex flex-wrap gap-1">
                            {sailActions.map((sailAction) => {
                              const target = sailTarget(sailAction.to, game.players);
                              return (
                                <Button
                                  key={target.testid}
                                  size="sm"
                                  variant="outline"
                                  data-testid={target.testid}
                                  disabled={busy}
                                  onClick={() => act(player.id, sailAction)}
                                >
                                  <ShipIcon className="h-4 w-4" aria-hidden /> {target.label}
                                </Button>
                              );
                            })}
                          </div>
                        </div>

                        {(can('REQUEST_LOAN') || can('REPAY_LOAN')) && (
                          <div className="flex gap-2">
                            {can('REQUEST_LOAN') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                data-testid="request-loan"
                                disabled={busy}
                                onClick={() => act(player.id, { type: 'REQUEST_LOAN' })}
                              >
                                Take loan +$10
                              </Button>
                            )}
                            {can('REPAY_LOAN') && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                data-testid="repay-loan"
                                disabled={busy}
                                onClick={() => act(player.id, { type: 'REPAY_LOAN' })}
                              >
                                Repay −$10
                              </Button>
                            )}
                          </div>
                        )}

                        {can('LOAD_FROM_BANK') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            data-testid="load-bank"
                            disabled={busy}
                            onClick={() => act(player.id, { type: 'LOAD_FROM_BANK' })}
                          >
                            Load ship from Bank holding
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          data-testid="end-turn"
                          disabled={busy}
                          onClick={() => act(player.id, { type: 'END_TURN' })}
                        >
                          End turn
                        </Button>
                        </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            </section>
          </>
        ) : lobby ? (
          <Card className="mx-auto max-w-md" data-testid="lobby">
            <CardHeader>
              <CardTitle>Waiting for players</CardTitle>
              <p className="text-sm text-muted-foreground">
                Share this code. The game starts once every seat is filled.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                type="button"
                data-testid="lobby-code"
                data-lobby-id={lobby.id}
                title="Copy game code"
                onClick={() => void navigator.clipboard?.writeText(lobby.id).catch(() => undefined)}
                className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-xs transition-colors hover:bg-accent"
              >
                <span aria-hidden>🔗</span> {lobby.id}
              </button>

              <ul className="space-y-1" data-testid="lobby-seats">
                {lobby.members.map((member, i) => (
                  <li
                    // eslint-disable-next-line react/no-array-index-key -- fixed positional seats
                    key={i}
                    data-testid={`lobby-seat-${i}`}
                    className={cn(
                      'flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                      mySeats.includes(i) && 'border-primary ring-1 ring-primary',
                    )}
                  >
                    <span className="text-muted-foreground">Seat {i + 1}</span>
                    <span className={member ? 'font-medium' : 'text-muted-foreground'}>
                      {member ?? 'Empty'}
                      {mySeats.includes(i) ? ' (you)' : ''}
                    </span>
                  </li>
                ))}
              </ul>

              {lobby.members.some((member) => member === null) && (
                <div className="flex gap-2">
                  <input
                    aria-label="Your name"
                    data-testid="seat-name"
                    placeholder="Your name"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={seatName}
                    onChange={(event) => setSeatName(event.target.value)}
                  />
                  <Button data-testid="take-seat" disabled={busy || seatName.trim() === ''} onClick={() => void takeSeat()}>
                    Take a seat
                  </Button>
                </div>
              )}

              <Button
                className="w-full"
                data-testid="start-lobby"
                disabled={busy || lobby.members.some((member) => member === null)}
                onClick={() => void startLobbyGame()}
              >
                {lobby.members.some((member) => member === null) ? 'Waiting for all seats…' : 'Start game'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                data-testid="leave-lobby"
                onClick={() => {
                  setLobby(null);
                  setMySeats([]);
                }}
              >
                Leave
              </Button>
            </CardContent>
          </Card>
        ) : (
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
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                  <ul className="space-y-2">
                    {openLobbies.map((open) => {
                      const taken = open.members.filter((m): m is string => m !== null);
                      return (
                        <li
                          key={open.id}
                          data-testid={`waiting-game-${open.id}`}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-xs text-muted-foreground">{open.id.slice(0, 8)}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {taken.length}/{open.seats} players{taken.length ? ` · ${taken.join(', ')}` : ''}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            data-testid={`join-waiting-${open.id}`}
                            disabled={busy || displayName.trim() === ''}
                            onClick={() => void joinFromBrowse(open.id)}
                          >
                            Join
                          </Button>
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
                      <li
                        key={active.id}
                        data-testid={`active-game-${active.id}`}
                        className="space-y-2 rounded-md border px-3 py-2"
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-mono">{active.id.slice(0, 8)}</span>
                          <span>Turn {active.turn}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="mr-1 text-xs text-muted-foreground">Resume as</span>
                          {active.players.map((player) => (
                            <Button
                              key={player.id}
                              size="sm"
                              variant="outline"
                              data-testid={`resume-${active.id}-${player.id}`}
                              disabled={busy}
                              onClick={() => void resumeAs(active.id, player.id)}
                              className={cn(player.id === active.activePlayerId && 'ring-1 ring-primary')}
                              title={player.id === active.activePlayerId ? `${player.name} (their turn)` : player.name}
                            >
                              {player.name}
                              {player.id === active.activePlayerId ? ' •' : ''}
                            </Button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>New game</CardTitle>
                <p className="text-sm text-muted-foreground">Container is for {MIN_PLAYERS}–{MAX_PLAYERS} players.</p>
              </CardHeader>
            <CardContent className="space-y-3">
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
                    disabled={busy || lobbySeats <= MIN_PLAYERS}
                    onClick={() => setLobbySeats((n) => Math.max(MIN_PLAYERS, n - 1))}
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
                    disabled={busy || lobbySeats >= MAX_PLAYERS}
                    onClick={() => setLobbySeats((n) => Math.min(MAX_PLAYERS, n + 1))}
                  >
                    +
                  </Button>
                  <Button className="ml-auto" data-testid="create-lobby" disabled={busy} onClick={() => void createSharedGame()}>
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
                      onChange={(event) =>
                        setNames((prev) => prev.map((value, j) => (j === index ? event.target.value : value)))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove seat ${index + 1}`}
                      data-testid={`remove-player-${index}`}
                      disabled={busy || names.length <= MIN_PLAYERS}
                      onClick={() => setNames((prev) => prev.filter((_, j) => j !== index))}
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
                disabled={busy || names.length >= MAX_PLAYERS}
                onClick={() => setNames((prev) => [...prev, NAME_POOL[prev.length] ?? `Player ${prev.length + 1}`])}
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
                disabled={busy || names.some((name) => name.trim() === '')}
                onClick={() => void run(() => api.createGame(names.map((name) => ({ name: name.trim() }))))}
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
                  onChange={(event) => setJoinCode(event.target.value)}
                />
                <Button
                  variant="outline"
                  data-testid="join-game"
                  disabled={busy || joinCode.trim() === ''}
                  onClick={() => void joinByCode(joinCode.trim())}
                >
                  Join
                </Button>
              </div>
            </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
