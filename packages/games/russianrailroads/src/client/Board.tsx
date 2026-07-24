import { ACTION_SPACES, GAP_LANE_INDICES, INDUSTRY_LANE, legalActions, legalSteps, locoResolutions, locosOnRoute } from '../engine';
import type { Action, PlayerView, RouteId, RussianRailroadsState, RussianRailroadsView, TrackColor } from '../engine';
import { Button } from '@/components/ui/button';
import { ActivityFeed } from '@/components/ActivityFeed';
import { GameOver } from '@/components/GameOver';
import { TurnBanner } from '@/components/TurnBanner';
import { seatIdentity } from '@/components/seatIdentity';
import { cn } from '@/lib/utils';
import type { BoardProps } from './types';
import * as rrApi from './api';
import { describeMove } from './feed';

/**
 * Russian Railroads' board (RR2) — the worker-placement spine plus track extension, as one plugin the
 * shell renders. It shows the shared action spaces with their occupancy, each player's routes / workers /
 * coins / score, whose turn it is, and wires `PLACE` / `MOVE_TRACK` / `PASS` (gated on `canDrive`). While
 * the active driver holds a track-extension lock, the action spaces lock and the route rows become
 * clickable — one click resolves one step (pg. 8–9). The full illustrated player board is RR9.
 *
 * Everything Russian Railroads knows lives at or below this file; the shell hands it an opaque state it
 * never reads, pinned back to `RussianRailroadsView` here.
 */
export default function RussianRailroadsBoard({
  gameId,
  game,
  bots,
  controlledIds,
  viewer,
  busy,
  guard,
  onPayload,
  onLeave,
}: BoardProps<RussianRailroadsView>) {
  const active = game.players[game.activePlayerIndex];
  const ended = game.status === 'ended';
  const { canDrive, myNames } = seatIdentity({
    players: game.players,
    activePlayerId: active?.id ?? null,
    bots,
    controlledIds,
  });
  const acting = canDrive && !ended && !!active;
  const pending = game.pendingMoves;
  const pendingLoco = game.pendingLoco;
  const pendingFactory = game.pendingFactory;
  const pool = active?.actionPool ?? [];
  const resolving = acting && !!pending; // holding a track-extension lock: resolve it before anything else
  const resolvingLoco = acting && !!pendingLoco; // holding a locomotive: place / upgrade / flip it
  const resolvingFactory = acting && !!pendingFactory; // owing a factory placement (pg. 12)
  const resolvingPool = acting && !pending && !pendingLoco && !pendingFactory && pool.length > 0; // pool credits
  // Free to place a worker or pass only when nothing is owed.
  const placing = acting && !pending && !pendingLoco && !pendingFactory && pool.length === 0;

  const run = (work: () => Promise<rrApi.RussianRailroadsPayload>) => guard(async () => onPayload(await work()));
  const doPlace = (space: string, opts?: { coins?: number; build?: 'loco' | 'factory'; first?: 'loco' | 'factory' }) => {
    if (!placing || !active) return;
    void run(() => rrApi.act(gameId, active.id, { type: 'PLACE', space, ...opts }, viewer, game.version));
  };
  const doFactory = (action: Action) => {
    if (!resolvingFactory || !active) return;
    void run(() => rrApi.act(gameId, active.id, action, viewer, game.version));
  };
  const doPool = (action: Action) => {
    if (!resolvingPool || !active) return;
    void run(() => rrApi.act(gameId, active.id, action, viewer, game.version));
  };
  const doMoveTrack = (route: RouteId, color?: TrackColor) => {
    if (!resolving || !active) return;
    void run(() =>
      rrApi.act(gameId, active.id, { type: 'MOVE_TRACK', route, ...(color ? { color } : {}) }, viewer, game.version),
    );
  };
  const doLoco = (action: Action) => {
    if (!resolvingLoco || !active) return;
    void run(() => rrApi.act(gameId, active.id, action, viewer, game.version));
  };
  const doPass = () => {
    if (!placing || !active) return;
    void run(() => rrApi.act(gameId, active.id, { type: 'PASS' }, viewer, game.version));
  };

  // The legal place / upgrade / flip resolutions for the held locomotive (pg. 10–11), driving the panel.
  const locoOptions = resolvingLoco && active && pendingLoco ? locoResolutions(active, pendingLoco.number) : [];
  // The legal factory / pool resolutions (pg. 12–13) — the engine's own enumeration drives each panel.
  const factoryOptions =
    resolvingFactory && active ? legalActions(game as unknown as RussianRailroadsState, active.id) : [];
  const poolOptions = resolvingPool && active ? legalActions(game as unknown as RussianRailroadsState, active.id) : [];

  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
  const winnerNames = game.status === 'ended' ? game.winnerIds.map(nameOf) : [];

  // Which of the active player's routes+colours a lock step may advance right now (drives the clickable
  // rows). A single-colour lock keeps the simple `rr-build-<route>` button; a multi-colour lock (the
  // worker+coin space once colours are unlocked) offers a `rr-build-<route>-<colour>` button per choice.
  const multiColor = resolving && !!pending && pending.colors.length > 1;
  const legalByRoute = new Map<RouteId, TrackColor[]>();
  if (resolving && active && pending) {
    for (const step of legalSteps(active.routes, pending.colors)) {
      const colors = legalByRoute.get(step.route) ?? [];
      colors.push(step.color);
      legalByRoute.set(step.route, colors);
    }
  }

  // Which placements the active seat may actually make right now — the engine's own enumeration, so the
  // board never offers a placement that would be refused or wasted (a colour space with no access, a
  // doubler with none left, an occupied/unpayable space). The View carries every field `legalActions`
  // reads (all public), so the cast is sound — move enumeration never touches a redacted secret.
  const legal = placing && active ? legalActions(game as unknown as RussianRailroadsState, active.id) : [];
  // Space ids placeable with workers (a bare PLACE) vs. with a coin substitute (a PLACE carrying `coins`).
  const spaceIds = (withCoins: boolean) =>
    new Set(legal.flatMap((a) => (a.type === 'PLACE' && (a.coins !== undefined) === withCoins ? [a.space] : [])));
  const workerSpaces = spaceIds(false);
  const coinSpaces = spaceIds(true);
  // For locomotive/factory spaces (pg. 12): which build option / order is legal right now.
  const legalBuild = (spaceId: string, build: 'loco' | 'factory') =>
    legal.some((a) => a.type === 'PLACE' && a.space === spaceId && a.build === build);
  const legalFirst = (spaceId: string, first: 'loco' | 'factory') =>
    legal.some((a) => a.type === 'PLACE' && a.space === spaceId && a.first === first);

  return (
    <div data-testid="board" className="space-y-4">
      {game.status === 'ended' && (
        <GameOver winnerNames={winnerNames} onNewGame={onLeave}>
          <p className="text-sm text-muted-foreground" data-testid="rr-result-note">
            Scored by each round's routes + industry (pg. 20–21). Final scoring — end-bonus cards + engineer majority —
            lands in a later slice.
          </p>
        </GameOver>
      )}

      <TurnBanner testId="rr-banner" canDrive={canDrive} className="mb-0">
        <span>
          {myNames ? (
            <>
              You are <span className="font-medium">{myNames.join(', ')}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Hotseat — pass the device</span>
          )}
        </span>
        <span className="font-medium">
          Round {game.round}/{game.rounds} · {active?.name ?? '—'}
        </span>
      </TurnBanner>

      {/* The active lock prompt (pg. 8–9): click a route to spend one move. */}
      {resolving && pending ? (
        <div data-testid="rr-pending" className="rounded-lg border border-primary bg-primary/5 p-3 text-sm font-medium">
          {pending.remaining} track move{pending.remaining > 1 ? 's' : ''} left — click a route below to build.
        </div>
      ) : null}

      {/* The locomotive lock prompt (pg. 10–11): place the held loco, upgrade a lower one (a chain
          reaction), or — only when no slot is free — flip it to a factory. */}
      {resolvingLoco && pendingLoco ? (
        <div
          data-testid="rr-pending-loco"
          className="rounded-lg border border-primary bg-primary/5 p-3 text-sm font-medium"
        >
          <div>Locomotive #{pendingLoco.number} in hand — place it, upgrade a lower one, or flip it to a factory.</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {locoOptions.map((opt) =>
              opt.kind === 'place' ? (
                <Button
                  key={`place-${opt.route}`}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-loco-place-${opt.route}`}
                  disabled={busy}
                  onClick={() => doLoco({ type: 'PLACE_LOCO', route: opt.route })}
                >
                  Place on {opt.route}
                </Button>
              ) : opt.kind === 'replace' ? (
                <Button
                  key={`replace-${opt.route}-${opt.number}`}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-loco-replace-${opt.route}-${opt.number}`}
                  disabled={busy}
                  onClick={() => doLoco({ type: 'REPLACE_LOCO', route: opt.route, number: opt.number })}
                >
                  Upgrade #{opt.number} on {opt.route}
                </Button>
              ) : (
                <Button
                  key="flip"
                  variant="ghost"
                  size="sm"
                  data-testid="rr-loco-flip"
                  disabled={busy}
                  title="Return it to the supply as a factory (pg. 11)"
                  onClick={() => doLoco({ type: 'FLIP_LOCO' })}
                >
                  Flip to factory
                </Button>
              ),
            )}
          </div>
        </div>
      ) : null}

      {/* The factory lock prompt (pg. 12): build the owed factory into the leftmost gap, or — once all 5
          gaps are filled — replace one. Each option is a legal factory source (lowest loco / a returned factory). */}
      {resolvingFactory && pendingFactory ? (
        <div
          data-testid="rr-pending-factory"
          className="rounded-lg border border-primary bg-primary/5 p-3 text-sm font-medium"
        >
          <div>Factory to build{game.pendingThen ? ` (then a ${game.pendingThen})` : ''} — choose a tile:</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {factoryOptions.map((opt) =>
              opt.type === 'PLACE_FACTORY' ? (
                <Button
                  key={`place-${opt.from ?? 'low'}`}
                  variant="outline"
                  size="sm"
                  data-testid={opt.from === undefined ? 'rr-factory-place' : `rr-factory-place-${opt.from}`}
                  disabled={busy}
                  onClick={() => doFactory(opt)}
                >
                  Build {opt.from === undefined ? 'lowest loco' : `#${opt.from}`}
                </Button>
              ) : opt.type === 'REPLACE_FACTORY' ? (
                <Button
                  key={`replace-${opt.slot}-${opt.from ?? 'low'}`}
                  variant="outline"
                  size="sm"
                  data-testid={opt.from === undefined ? `rr-factory-replace-${opt.slot}` : `rr-factory-replace-${opt.slot}-${opt.from}`}
                  disabled={busy}
                  onClick={() => doFactory(opt)}
                >
                  Replace slot {opt.slot + 1} with {opt.from === undefined ? 'lowest loco' : `#${opt.from}`}
                </Button>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      {/* The action-pool prompt (pg. 13): spend each factory / industrialization track-move credit, or skip
          the rest (unused credits are lost). */}
      {resolvingPool ? (
        <div
          data-testid="rr-pending-pool"
          className="rounded-lg border border-primary bg-primary/5 p-3 text-sm font-medium"
        >
          <div>Factory actions available this turn — resolve or skip:</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {poolOptions.map((opt) =>
              opt.type === 'RESOLVE_POOL' ? (
                <Button
                  key={opt.id}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-pool-resolve-${opt.id}`}
                  disabled={busy}
                  onClick={() => doPool(opt)}
                >
                  Move a track
                </Button>
              ) : opt.type === 'SKIP_POOL' ? (
                <Button
                  key="skip"
                  variant="ghost"
                  size="sm"
                  data-testid="rr-pool-skip"
                  disabled={busy}
                  onClick={() => doPool(opt)}
                >
                  Skip remaining
                </Button>
              ) : null,
            )}
          </div>
        </div>
      ) : null}

      {/* Shared action spaces (pg. 7–9). Each shows its occupancy; the active driving seat may place on an
          unoccupied one (the bottom track space is never occupied — pg. 9). Locked out while resolving. */}
      <section aria-label="Action spaces">
        <h2 className="mb-2 text-sm font-semibold">Action spaces</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACTION_SPACES.map((space) => {
            const placements = game.actionSpaces[space.id] ?? [];
            const occupied = !space.neverOccupies && placements.length > 0;
            const coinCost = space.coinCost ?? 0;
            // Gate on the engine's legal-move set (accessibility, doubler supply, occupancy, affordability).
            const canWorkers = workerSpaces.has(space.id);
            // The coin *substitution* variant (pg. 14) — not offered on the mandatory worker+coin space.
            const canCoins = coinSpaces.has(space.id);
            return (
              <div
                key={space.id}
                data-testid={`rr-space-${space.id}`}
                className={cn(
                  'rounded-lg border p-3',
                  occupied ? 'bg-muted/50' : 'bg-card',
                  space.neverOccupies && 'border-dashed',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{space.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {space.workers} worker{space.workers > 1 ? 's' : ''}
                    {coinCost ? ` + ${coinCost} coin` : ''}
                  </span>
                </div>
                {placements.length > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground" data-testid={`rr-occupied-${space.id}`}>
                    {placements
                      .map((p) => `${nameOf(p.ownerId)} (${p.workers}w${p.coins ? ` ${p.coins}c` : ''})`)
                      .join(', ')}
                    {space.neverOccupies ? ' — open to all' : ''}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">Empty</div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {space.kind === 'locomotive' ? (
                    // "Loco or factory" / "loco and factory" spaces (pg. 12): pick what to build (or the order).
                    space.loco === 'and' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`rr-place-${space.id}`}
                          disabled={busy || !legalFirst(space.id, 'loco')}
                          onClick={() => doPlace(space.id, { first: 'loco' })}
                        >
                          Loco first
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`rr-build-factory-${space.id}`}
                          disabled={busy || !legalFirst(space.id, 'factory')}
                          onClick={() => doPlace(space.id, { first: 'factory' })}
                        >
                          Factory first
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`rr-place-${space.id}`}
                          disabled={busy || !legalBuild(space.id, 'loco')}
                          onClick={() => doPlace(space.id, { build: 'loco' })}
                        >
                          Build loco
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`rr-build-factory-${space.id}`}
                          disabled={busy || !legalBuild(space.id, 'factory')}
                          onClick={() => doPlace(space.id, { build: 'factory' })}
                        >
                          Build factory
                        </Button>
                      </>
                    )
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`rr-place-${space.id}`}
                        disabled={busy || !canWorkers}
                        onClick={() => doPlace(space.id)}
                      >
                        {coinCost ? 'Place worker + coin' : 'Place worker'}
                      </Button>
                      {coinCost === 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`rr-place-coin-${space.id}`}
                          disabled={busy || !canCoins}
                          title="Use a coin instead of a worker (pg. 14)"
                          onClick={() => doPlace(space.id, { coins: space.workers })}
                        >
                          Use coin
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {placing ? (
          <div className="mt-3">
            <Button variant="default" size="sm" data-testid="rr-pass" disabled={busy} onClick={doPass}>
              Pass
            </Button>
          </div>
        ) : !ended && !resolving ? (
          <p className="mt-3 text-sm text-muted-foreground">Waiting for {active?.name ?? 'the other player'}…</p>
        ) : null}
      </section>

      {/* Players — routes, workers, coins, score, pass state (pg. 6–7, 20). */}
      <section aria-label="Players">
        <h2 className="mb-2 text-sm font-semibold">Players</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {game.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isActive={player.id === active?.id}
              isBot={bots.includes(player.id)}
              legalByRoute={player.id === active?.id ? legalByRoute : undefined}
              multiColor={multiColor}
              onMoveTrack={player.id === active?.id ? doMoveTrack : undefined}
              busy={busy}
            />
          ))}
        </div>
      </section>

      <ActivityFeed
        log={game.log}
        players={game.players}
        botIds={bots}
        describe={(entry) => describeMove(entry, nameOf)}
        testId="rr-log"
      />
    </div>
  );
}

/** Tailwind fill for each track colour (pg. 8–9) — plus a dashed neutral for empty spaces. */
const TRACK_FILL: Record<TrackColor, string> = {
  wood: 'bg-amber-700',
  green: 'bg-green-600',
  bronze: 'bg-orange-700',
  silver: 'bg-slate-400',
  gold: 'bg-yellow-500',
};

/**
 * One player's tableau card (RR3): turn-order card, workers (incl. temporary), coins, doublers, score, and
 * the three routes' tracks. During a lock, the active player's advanceable routes become clickable — a
 * single-colour lock keeps the `rr-build-<route>` button; a multi-colour lock renders a colour picker
 * (`rr-build-<route>-<colour>`).
 */
function PlayerCard({
  player,
  isActive,
  isBot,
  legalByRoute,
  multiColor,
  onMoveTrack,
  busy,
}: {
  player: PlayerView;
  isActive: boolean;
  isBot: boolean;
  legalByRoute?: Map<RouteId, TrackColor[]>;
  multiColor: boolean;
  onMoveTrack?: (route: RouteId, color?: TrackColor) => void;
  busy?: boolean;
}) {
  return (
    <div
      data-testid={`player-${player.id}`}
      className={cn('rounded-lg border p-3 text-sm', isActive ? 'border-primary bg-primary/5' : 'bg-card')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {isBot ? '🤖 ' : ''}
          {player.name}
          <span className="ml-1 text-xs text-muted-foreground">#{player.turnOrderCard}</span>
        </span>
        {player.passed ? (
          <span className="text-xs text-muted-foreground" data-testid={`rr-passed-${player.id}`}>
            passed
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span data-testid={`rr-workers-${player.id}`}>
          Workers: {player.workersAvailable}/{player.workersTotal}
          {player.tempWorkers > 0 ? (
            <span data-testid={`rr-temp-${player.id}`}> (+{player.tempWorkers} temp)</span>
          ) : null}
        </span>
        <span data-testid={`rr-coins-${player.id}`}>Coins: {player.coins}</span>
        <span data-testid={`rr-doublers-${player.id}`}>Doublers: {player.doublers}</span>
        <span data-testid={`rr-score-${player.id}`} className="font-medium">
          Score: {player.score}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-xs">
        {player.routes.map((route) => {
          const legalColors = onMoveTrack ? (legalByRoute?.get(route.id) ?? []) : [];
          const chips = (
            <span className="flex gap-0.5">
              {route.spaces.map((track, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-block h-3 w-3 border',
                    // A doubler tile sits above the first N Trans-Siberian spaces (pg. 14).
                    route.id === 'transsiberian' && i < player.doublers
                      ? 'rounded-full ring-1 ring-primary'
                      : 'rounded-sm',
                    track ? TRACK_FILL[track] : 'bg-transparent',
                  )}
                  title={`${track ?? 'empty'}${route.id === 'transsiberian' && i < player.doublers ? ' ×2' : ''}`}
                />
              ))}
            </span>
          );
          // Locomotives on this route (pg. 10) — their numbers, shown beside the route name; reach = their sum.
          const locos = locosOnRoute(player, route.id);
          const label = (
            <span className="flex w-36 shrink-0 items-baseline gap-1 text-muted-foreground">
              <span className="capitalize">{route.id}</span>
              {locos.length ? (
                <span data-testid={`rr-locos-${player.id}-${route.id}`} className="text-primary" title="Locomotives">
                  🚂{locos.map((l) => l.number).join(' ')}
                </span>
              ) : null}
            </span>
          );

          // Single-colour lock: the whole row is one build button (keeps the `rr-build-<route>` testid).
          if (legalColors.length > 0 && !multiColor) {
            return (
              <li key={route.id}>
                <button
                  type="button"
                  data-testid={`rr-build-${route.id}`}
                  disabled={busy}
                  onClick={() => onMoveTrack!(route.id)}
                  className="flex w-full items-center gap-1 rounded-sm border border-primary bg-primary/10 px-1 py-0.5 text-left hover:bg-primary/20 disabled:opacity-50"
                >
                  {label}
                  {chips}
                </button>
              </li>
            );
          }
          // Multi-colour lock: a colour picker per advanceable route (`rr-build-<route>-<colour>`).
          if (legalColors.length > 0) {
            return (
              <li key={route.id} className="flex items-center gap-1 px-1 py-0.5">
                {label}
                {chips}
                <span className="ml-1 flex gap-1">
                  {legalColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      data-testid={`rr-build-${route.id}-${color}`}
                      disabled={busy}
                      onClick={() => onMoveTrack!(route.id, color)}
                      className="rounded-sm border border-primary bg-primary/10 px-1 capitalize hover:bg-primary/20 disabled:opacity-50"
                    >
                      {color}
                    </button>
                  ))}
                </span>
              </li>
            );
          }
          return (
            <li key={route.id} className="flex items-center gap-1 px-1 py-0.5">
              {label}
              {chips}
            </li>
          );
        })}
      </ul>
      <IndustryTrack player={player} />
    </div>
  );
}

/**
 * A compact read-only render of a player's industry track (pg. 13): the lane of spaces (with printed
 * points) and gaps, the factories filling them, and the wrench's position. `INDUSTRY_LANE` is the shared
 * layout; the player's own state is the wrench index + the filled gaps.
 */
function IndustryTrack({ player }: { player: PlayerView }) {
  const { wrench, factories } = player.industry;
  return (
    <div className="mt-2" data-testid={`rr-industry-${player.id}`}>
      <div className="flex items-baseline gap-1 text-xs text-muted-foreground">
        <span>Industry</span>
        <span data-testid={`rr-wrench-${player.id}`} className="text-primary">
          🔧 space {wrench}
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-0.5">
        {INDUSTRY_LANE.map((entry, i) => {
          const here = i === wrench;
          const factory = entry.kind === 'gap' ? factories[GAP_LANE_INDICES.indexOf(i)] : null;
          const filled = factory != null;
          return (
            <span
              key={i}
              title={
                entry.kind === 'gap'
                  ? filled
                    ? `factory #${factory}`
                    : 'gap — needs a factory'
                  : entry.points != null
                    ? `${entry.points} points`
                    : 'idea space'
              }
              className={cn(
                'inline-flex h-4 min-w-4 items-center justify-center rounded-sm border px-0.5 text-[9px] leading-none',
                here && 'ring-1 ring-primary',
                entry.kind === 'gap'
                  ? filled
                    ? 'border-primary bg-primary/20'
                    : 'border-dashed bg-transparent text-muted-foreground'
                  : 'bg-muted',
              )}
            >
              {entry.kind === 'gap' ? (filled ? `#${factory}` : '·') : (entry.points ?? '💡')}
            </span>
          );
        })}
      </div>
    </div>
  );
}
