import type { Color, MoveRecord, PlayerView, ShipLocation } from '@game-hub/engine/container';

/**
 * The running activity feed (bottom of the board).
 *
 * Reads `GameState.log`, which the engine appends to on every applied action. **Everything in that
 * log is public by construction** — the one genuinely secret thing in Container, a losing delivery
 * bid, is deliberately never recorded (see `deliver.ts` and its log tests). So this component can
 * render the log as-is; there is nothing here to redact. If you ever add a mechanic that records
 * something a player shouldn't see, redact it in the engine's `record()` / `viewFor`, **not here** —
 * the log reaches the client either way, so hiding it in the UI would hide nothing.
 */

const LOT_LABELS = ['I', 'II', 'III'];

/** Show at most this many entries. A full game runs to a few hundred; nobody scrolls that far back. */
const MAX_ENTRIES = 60;

const nameOf = (players: readonly PlayerView[], id: string) => players.find((p) => p.id === id)?.name ?? id;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function whereTo(to: ShipLocation, players: readonly PlayerView[]): string {
  switch (to.kind) {
    case 'ocean':
      return 'out to sea';
    case 'island':
      return 'to Container Island';
    case 'bank':
      return 'to the Off-Shore Bank';
    case 'harbor':
      return `to ${nameOf(players, to.playerId)}'s harbor`;
  }
}

/** One line of plain English for a logged move, or `null` for moves not worth a line. */
function describe(move: MoveRecord, players: readonly PlayerView[]): string | null {
  const payload = (move.payload ?? {}) as Record<string, unknown>;
  const num = (key: string) => Number(payload[key] ?? 0);

  switch (move.type) {
    case 'PRODUCE': {
      const produced = (payload.produced ?? []) as { color: Color }[];
      return `produced ${plural(produced.length, 'container')} (${produced.map((c) => c.color).join(', ')})`;
    }
    case 'BUILD_FACTORY':
      return `built a ${String(payload.color)} factory for $${num('cost')}`;
    case 'BUILD_WAREHOUSE':
      return `built a warehouse for $${num('cost')}`;
    case 'REPRICE':
      return `repriced their ${String(payload.district)} district`;
    case 'SAIL':
      return `sailed ${whereTo(payload.to as ShipLocation, players)}`;
    case 'FACTORY_PURCHASE':
      return `trucked ${plural(num('count'), 'container')} out of ${nameOf(players, String(payload.sellerId))}'s factory for $${num('cost')}`;
    case 'HARBOR_PURCHASE':
      return `loaded ${plural(num('count'), 'container')} from ${nameOf(players, String(payload.sellerId))}'s harbor for $${num('cost')}`;
    case 'DELIVER': {
      const containers = (payload.containers ?? []) as Color[];
      const cargo = plural(containers.length, 'container');
      // The winning bid is public — every bid is revealed before the deliverer decides (pg. 15).
      return payload.buyout === true
        ? `delivered ${cargo} and bought the auction out for $${num('winningBid')}`
        : `delivered ${cargo} — ${nameOf(players, String(payload.winnerId))} won the bidding at $${num('winningBid')}`;
    }
    case 'CALL_BANK':
      return payload.lotKind === 'cash'
        ? `bid ${plural(num('count'), 'container')} on Bank cash lot ${LOT_LABELS[num('lotIndex')] ?? '?'}`
        : `bid $${num('bid')} on Bank container lot ${LOT_LABELS[num('lotIndex')] ?? '?'}`;
    case 'LOAD_FROM_BANK':
      return `collected ${plural(num('loaded'), 'container')} from the Bank`;
    case 'REQUEST_LOAN':
      return 'took a $10 Bank loan';
    case 'REPAY_LOAN':
      return 'repaid a Bank loan';
    // End of turn is noise in a feed — the next player's move already says the turn moved on.
    case 'END_TURN':
      return null;
    default:
      return null;
  }
}

export function GameLog({
  log,
  players,
  botIds,
}: {
  log: readonly MoveRecord[];
  players: readonly PlayerView[];
  botIds: readonly string[];
}) {
  const entries = log
    .map((move) => ({ move, text: describe(move, players) }))
    .filter((entry): entry is { move: MoveRecord; text: string } => entry.text !== null)
    .slice(-MAX_ENTRIES)
    .reverse(); // newest first — that's what you're checking when you look

  return (
    <section className="mt-6" data-testid="game-log" aria-label="Activity log">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Activity</h2>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="game-log-empty">
          Nothing has happened yet.
        </p>
      ) : (
        <ol className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs">
          {entries.map(({ move, text }) => (
            // No move number: `seq` counts every applied action, but the feed hides End-turn, so the
            // numbers would run 21, 20, 18, 17… and read as missing entries rather than as filtering.
            <li key={move.seq} data-testid={`log-entry-${move.seq}`} className="leading-relaxed">
              <span className="font-medium">
                {botIds.includes(move.playerId) ? '🤖 ' : ''}
                {nameOf(players, move.playerId)}
              </span>{' '}
              <span className="text-muted-foreground">{text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
