/**
 * **Table options** — the per-table rule variants a game declares and a table picks before the deal
 * (kernel 1.5.0).
 *
 * ## Why this exists
 *
 * Until 1.5.0 a game's rules were fixed at publish time: `createGame` received `{ id, players, rng }`
 * and nothing else, so a game with a real house-rule fork had exactly two bad choices — bake one
 * variant in and lie to half its players, or ship the fork as a *second game id* (`euchre` and
 * `euchre-std`), which duplicates the board, the bot and the shelf entry to express one boolean.
 * Euchre's stick-the-dealer and Spades' blind nil are both genuine forks of the rules, decided by the
 * table before the cards come out, and neither is expressible as a move.
 *
 * ## The shape, and why it is this shape
 *
 * This is deliberately modelled on `GameModule.botDifficulties` (CS4), which solved the same problem
 * one size smaller: **the game declares opaque ids, the host validates against the declaration and
 * renders a control it doesn't understand.** The contract stays game-import-free — a host never learns
 * what `stickTheDealer` *means*, only that it is a boolean the game offers and that `true` is a legal
 * value for it. That is what lets one generic form in the shell serve every game, forever.
 *
 * Two option types, and no more, on purpose: a **boolean** (a rule is on or off) and a **choice** (one
 * of a closed, game-declared list). A free-number option is the obvious third and is deliberately
 * absent — every "number" a table actually picks is a small closed set (Spades to 200 or 500; Euchre to
 * 10 or 11), which `choice` already expresses *with labels*, while a free number drags min/max/step
 * validation and a spinner into a contract that is meant to stay declarative. Add it when a third game
 * genuinely needs one (the repo's extract-on-the-third-example restraint rule, design-patterns §8).
 *
 * ## Where the values end up
 *
 * The host resolves picks → a **complete** options record (every declared id present, defaults filled)
 * *before* dealing, and hands it to `createGame` as `options`. A game folds them into its own state at
 * setup and reads them from there — so the variant is part of the serialized game, replayable and
 * migratable like any other rule data, and the host never has to store it a second time. A table's
 * choice is therefore frozen at the deal, which is exactly the physical truth: you don't switch to
 * stick-the-dealer in the middle of a hand.
 *
 * ⚠️ Options are **rules data, not coordination state** — the one place they differ from bots and
 * colours (design-patterns §2). Those sit beside the engine because the engine must not know them;
 * this must reach the engine, because it *is* a rule.
 */

/**
 * A resolved option value. `string` covers `choice` (the chosen `value`), `boolean` covers `boolean`.
 * Kept a closed union rather than `unknown` so a host can validate every value it forwards without
 * knowing any game — an option channel that accepted arbitrary JSON would be an unvalidated hole
 * straight into `createGame`.
 */
export type TableOptionValue = string | boolean;

/** What every option spec carries, whatever its type. */
interface TableOptionBase {
  /** Stable id — the key in the resolved options record, and what the game reads. */
  readonly id: string;
  /** Human-readable label for the host's setup form. */
  readonly label: string;
  /** One line of "what does this do", shown beside the control. Optional. */
  readonly help?: string;
}

/** A rule that is simply on or off (Euchre's stick-the-dealer, Spades' blind nil). */
export interface BooleanTableOption extends TableOptionBase {
  readonly type: 'boolean';
  readonly default: boolean;
}

/** A rule with a closed, game-declared set of settings (Spades' target score: 200 or 500). */
export interface ChoiceTableOption extends TableOptionBase {
  readonly type: 'choice';
  /** The legal settings, in the order the host should offer them. Must be non-empty. */
  readonly choices: readonly { readonly value: string; readonly label: string }[];
  /** Must be one of `choices[].value` — `resolveTableOptions` trusts this, so declare it correctly. */
  readonly default: string;
}

/** One declared option. A game's `GameModule.tableOptions` is an ordered list of these. */
export type TableOptionSpec = BooleanTableOption | ChoiceTableOption;

/**
 * A resolved, **complete** options record: every id the game declared, mapped to a legal value. This
 * is what reaches `createGame` — never a partial pick, so a game reads `options.stickTheDealer`
 * without a `?? false` fallback at every site and cannot accidentally diverge from its own declared
 * default.
 */
export type TableOptions = Readonly<Record<string, TableOptionValue>>;

/**
 * The outcome of validating a table's picks. Mirrors `ParseResult`: either a usable value or the
 * reason it isn't one, so the host can turn a rejection into a 400 with a message a player can read.
 */
export type ResolveOptionsResult =
  { readonly ok: true; readonly options: TableOptions } | { readonly ok: false; readonly message: string };

/**
 * The options a game gets when a table picks nothing — every declared option at its declared default.
 *
 * Exported because three callers need the same answer and must not each compute it: the host (a
 * plain `POST /games` with no options body still has to deal *something*), a lobby created before its
 * host touched the form, and a game's own tests.
 */
export function defaultTableOptions(specs: readonly TableOptionSpec[] | undefined): TableOptions {
  const resolved: Record<string, TableOptionValue> = {};
  for (const spec of specs ?? []) resolved[spec.id] = spec.default;
  return resolved;
}

/**
 * Validate a table's picks against what the game declares, and fill every unpicked option with its
 * default.
 *
 * Lives in the kernel rather than the backend because it is the *contract's* rule, not the hub's: a
 * second host, and a game's own tests, must agree byte-for-byte on what a legal pick is. Rejections
 * are deliberately specific — an unknown id is a wiring bug worth naming, and a bad choice value
 * lists what was allowed, because the person seeing it is looking at a form that just refused them.
 *
 * @param specs the game's declared options (absent ⇒ the game offers none)
 * @param picks what the table asked for (absent ⇒ all defaults)
 */
export function resolveTableOptions(
  specs: readonly TableOptionSpec[] | undefined,
  picks: Readonly<Record<string, unknown>> | undefined,
): ResolveOptionsResult {
  const declared = specs ?? [];
  const requested = picks ?? {};

  // An id the game never declared is always a rejection, and is the *only* check that runs for a game
  // with no options at all — which is what stops a caller quietly smuggling arbitrary keys into
  // `createGame` for the six hosted games that declare nothing.
  for (const id of Object.keys(requested)) {
    if (!declared.some((spec) => spec.id === id)) {
      return { ok: false, message: `Unknown table option "${id}"` };
    }
  }

  const resolved: Record<string, TableOptionValue> = {};
  for (const spec of declared) {
    // `in` rather than `!== undefined`: an explicit `{ stickTheDealer: undefined }` is a malformed
    // pick, not an omission, and should fail its type check below rather than silently default.
    if (!(spec.id in requested)) {
      resolved[spec.id] = spec.default;
      continue;
    }
    const value = requested[spec.id];
    if (spec.type === 'boolean') {
      if (typeof value !== 'boolean') {
        return { ok: false, message: `Table option "${spec.id}" must be true or false` };
      }
      resolved[spec.id] = value;
    } else {
      if (typeof value !== 'string' || !spec.choices.some((choice) => choice.value === value)) {
        const allowed = spec.choices.map((choice) => choice.value).join(', ');
        return { ok: false, message: `Table option "${spec.id}" must be one of: ${allowed}` };
      }
      resolved[spec.id] = value;
    }
  }
  return { ok: true, options: resolved };
}
