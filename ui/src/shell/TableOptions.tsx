import type { TableOptions as TableOptionValues, TableOptionSpec } from '@game-hub/kernel';

/**
 * The **house rules** section of a game's setup screen (kernel 1.5.0) — the rule variants a table
 * agrees before the cards come out.
 *
 * **Entirely game-agnostic**, and that is the whole design. The shell knows there are booleans and
 * closed choices; it does *not* know what `stickTheDealer` or `blindNil` mean, which game declares
 * them, or what any of them do. Everything rendered here comes off the game's catalog entry
 * (`GameInfo.tableOptions`), so a game published tomorrow grows a working form here without a line of
 * shell code — the same bargain `colors` and `botDifficulties` already make (roadmap C2).
 *
 * A game that declares no options renders nothing at all: `specs` is empty and the caller drops the
 * section, so the seven games that predate the feature show exactly the form they always did.
 *
 * Options apply to **both** ways of sitting down — pass-and-play and a shared table — because they are
 * a property of the game being dealt, not of how the players reached it. The caller therefore renders
 * this once, above the mode-specific panel, rather than twice inside each.
 */
export interface TableOptionsProps {
  /** What this game offers, from its catalog entry. Empty ⇒ render nothing. */
  readonly specs: readonly TableOptionSpec[];
  /** The table's current picks. Ids absent from it fall back to each spec's declared default. */
  readonly values: TableOptionValues;
  readonly onChange: (values: TableOptionValues) => void;
  readonly busy: boolean;
}

export function TableOptions({ specs, values, onChange, busy }: TableOptionsProps) {
  if (specs.length === 0) return null;

  /** Read a pick, falling back to the game's own declared default rather than to a shell-side guess. */
  const valueOf = (spec: TableOptionSpec) => values[spec.id] ?? spec.default;
  const set = (id: string, value: string | boolean) => onChange({ ...values, [id]: value });

  return (
    <div className="space-y-2 border-b border-border/60 pb-3" data-testid="table-options">
      <div className="font-display text-base font-semibold text-ink">House rules</div>
      {specs.map((spec) => (
        <div key={spec.id} className="flex items-start gap-2" data-testid={`table-option-${spec.id}`}>
          {spec.type === 'boolean' ? (
            <label className="flex flex-1 items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                data-testid={`table-option-input-${spec.id}`}
                checked={valueOf(spec) === true}
                disabled={busy}
                onChange={(event) => set(spec.id, event.target.checked)}
              />
              <span className="min-w-0">
                <span className="text-ink">{spec.label}</span>
                {spec.help && <span className="block text-xs text-muted-foreground">{spec.help}</span>}
              </span>
            </label>
          ) : (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <label className="flex-1 text-sm text-ink" htmlFor={`table-option-input-${spec.id}`}>
                {spec.label}
                {spec.help && <span className="block text-xs text-muted-foreground">{spec.help}</span>}
              </label>
              <select
                id={`table-option-input-${spec.id}`}
                data-testid={`table-option-input-${spec.id}`}
                className="rounded-md border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={String(valueOf(spec))}
                disabled={busy}
                onChange={(event) => set(spec.id, event.target.value)}
              >
                {spec.choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
