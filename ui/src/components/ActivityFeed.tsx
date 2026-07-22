/**
 * The shared running activity feed (bottom of every board — roadmap C2 / REVIEW §3.3).
 *
 * Modeled on Container's `GameLog` (the good one): scrollable, capped at the last 60 entries, newest
 * first, with a 🤖 badge on bot seats. Can't Stop and Stone Age had inline 6-entry copies with no badge
 * and no scroll; all three now share this frame. The genuinely per-game part is a single function,
 * `describe(entry) => string | null` — the plain-English line for a move, or `null` to hide it (e.g.
 * Container's end-of-turn). The **actor's name and bot badge are rendered here**, so `describe` returns
 * just the action text.
 *
 * **Everything a game logs is public by construction** — the log rides on the wire either way, so a
 * genuine secret must never be recorded (Container never records a losing bid). If a new mechanic ever
 * logs something hidden, redact it in the engine's `record()` / `viewFor`, not in this component.
 *
 * Typed off a structural `LogEntry`, **never** off `@game-hub/engine` — each board's engine log type is
 * structurally compatible, and its `describe` closure carries whatever game context it needs.
 */

/** The minimal shape of a logged move — structurally the engine's `MoveRecord`, restated to avoid a game import. */
export interface LogEntry {
  readonly seq: number;
  readonly type: string;
  readonly playerId: string;
  readonly payload?: Record<string, unknown>;
}

/** Show at most this many entries. A full game runs to a few hundred; nobody scrolls that far back. */
const MAX_ENTRIES = 60;

const nameOf = (players: readonly { readonly id: string; readonly name: string }[], id: string) =>
  players.find((p) => p.id === id)?.name ?? id;

export interface ActivityFeedProps<E extends LogEntry> {
  readonly log: readonly E[];
  readonly players: readonly { readonly id: string; readonly name: string }[];
  /** Seats an AI holds, shown with a 🤖 badge. */
  readonly botIds: readonly string[];
  /** One line of plain English for a move (no actor name — that's rendered here), or `null` to hide it. */
  readonly describe: (entry: E) => string | null;
  /** The feed's testid — `game-log`, `sa-log`, `cantstop-log` (the games' e2e depend on these). */
  readonly testId?: string;
  readonly emptyLabel?: string;
}

export function ActivityFeed<E extends LogEntry>({
  log,
  players,
  botIds,
  describe,
  testId = 'game-log',
  emptyLabel = 'Nothing has happened yet.',
}: ActivityFeedProps<E>) {
  const entries = log
    .map((entry) => ({ entry, text: describe(entry) }))
    .filter((e): e is { entry: E; text: string } => e.text !== null)
    .slice(-MAX_ENTRIES)
    .reverse(); // newest first — that's what you're checking when you look

  return (
    <section className="mt-6" data-testid={testId} aria-label="Activity log">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Activity</h2>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid={`${testId}-empty`}>
          {emptyLabel}
        </p>
      ) : (
        <ol className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs">
          {entries.map(({ entry, text }) => (
            // No move number: `seq` counts every applied action, but the feed hides some moves, so the
            // numbers would read as missing entries rather than as filtering.
            <li key={entry.seq} data-testid={`log-entry-${entry.seq}`} className="leading-relaxed">
              <span className="font-medium">
                {botIds.includes(entry.playerId) ? '🤖 ' : ''}
                {nameOf(players, entry.playerId)}
              </span>{' '}
              <span className="text-muted-foreground">{text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
