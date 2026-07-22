import type { Color, MoveRecord, PlayerView, ShipLocation } from '@game-hub/engine/container';
import { ActivityFeed } from '@/components/ActivityFeed';

/**
 * Container's activity feed — the game-specific `describe`, rendered through the shared `ActivityFeed`
 * (roadmap C2 / REVIEW §3.3). The frame (scroll, 60-entry cap, newest-first, 🤖 badges, actor name) is
 * shared; only `describe` — one line of plain English per Container move — lives here.
 *
 * Reads `GameState.log`, which the engine appends to on every applied action. **Everything in that
 * log is public by construction** — the one genuinely secret thing in Container, a losing delivery
 * bid, is deliberately never recorded (see `deliver.ts` and its log tests). If you ever add a mechanic
 * that records something a player shouldn't see, redact it in the engine's `record()` / `viewFor`,
 * **not here** — the log reaches the client either way, so hiding it in the UI would hide nothing.
 */

const LOT_LABELS = ['I', 'II', 'III'];

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
  return (
    <ActivityFeed
      log={log}
      players={players}
      botIds={botIds}
      // `describe` closes over `players` — Container names sellers/winners inside the action text.
      describe={(move) => describe(move, players)}
      testId="game-log"
    />
  );
}
