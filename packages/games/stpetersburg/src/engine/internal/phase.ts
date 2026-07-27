import { BOARD_SIZE, PHASES } from '../core';
import type { Board, CardKind, Phase, StPetersburgPlayer, StPetersburgState } from '../core';
import { mariinskijBonus, taxmanBonus } from './specials';

/** The next seat clockwise from the active one (pg. 3): increasing seat index, wrapping (skips nobody). */
export function nextSeatIndex(state: StPetersburgState): number {
  return (state.activePlayerIndex + 1) % state.players.length;
}

/** The phase after `phase` in the fixed cycle worker → building → aristocrat → trading → worker (pg. 2). */
export function nextPhase(phase: Phase): Phase {
  return PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length]!;
}

/**
 * The result of a board refill: the new board, and whether this deal **placed the last card of a group**
 * onto the board — the SP6 end trigger (pg. 5). `placedLast` is true iff the deal drew ≥1 card *and*
 * emptied the stack, i.e. the administrator just put a group's final card on the board.
 */
interface RefillResult {
  readonly board: Board;
  readonly placedLast: boolean;
}

/**
 * Draw from `from`'s stack into the **upper** row until the board holds `BOARD_SIZE` (8) cards across both
 * rows (pg. 4, "always 8!"). If the stack is short, deal what's there ("if there are not enough cards … he
 * places as many as there are", pg. 5). Pure: returns a new board, popping the drawn cards off the stack.
 *
 * **End trigger (pg. 5, SP6):** `placedLast` is true when this deal **places the last card of the group** —
 * it drew at least one card *and* the stack is now empty. Dealing short of 8 when the stack was **already**
 * empty (drawing zero) is *not* the trigger — no card was placed; the group emptied on an earlier deal.
 */
function refillUpper(board: Board, from: CardKind): RefillResult {
  const onBoard = board.upper.length + board.lower.length;
  const need = Math.max(0, BOARD_SIZE - onBoard);
  const stack = board.stacks[from];
  const drawn = stack.slice(0, need);
  const remaining = stack.slice(drawn.length);
  return {
    board: {
      ...board,
      upper: [...board.upper, ...drawn],
      stacks: { ...board.stacks, [from]: remaining },
    },
    placedLast: drawn.length > 0 && remaining.length === 0,
  };
}

/**
 * Close a **scoring** phase (worker / building / aristocrat) — the deterministic transition the rulebook
 * gives to the administrator (pg. 4). Returns the state changes only, so the caller (`pass`) folds them
 * into a single `record()`:
 *
 *  1. **Score** (pg. 4): every player scores *all* their cards of the ending phase's kind — the coin adds
 *     rubles (secret purse), the shield adds points (public track). A player with none scores nothing.
 *  2. **Refill** (pg. 4): deal from the **next** phase's stack into the **upper** row to `BOARD_SIZE` (8) —
 *     **unless** the pg. 8 special case applies: if **no card left the board this phase**
 *     (`tookCardThisPhase === false`), *no new cards are placed*, but the stacks still turn (the phase
 *     still advances and scoring still runs). See the module docstring below for the cite.
 *  3. **Advance**: the phase becomes the next one and its starting player is up, passes reset to 0, and
 *     `tookCardThisPhase` resets to `false` for the new phase.
 *
 * **Never called for the trading phase** — trading has no scoring (pg. 5); `pass` runs `roundTransition`
 * for it instead.
 */
export function scoreAndRefill(state: StPetersburgState): Partial<StPetersburgState> {
  return { players: scorePlayers(state), ...advanceAfterScoring(state) };
}

/**
 * **Score** every player's cards of the ending phase's kind (pg. 4) — the coin adds rubles (secret purse),
 * the shield adds points (public track) — plus the SP5 special-card scoring hooks (pg. 7–8):
 *
 *  - **Building phase:** a flipped **Observatory** (used this round, its id in `observatoryUsed`) scores
 *    **0** points instead of its printed 1 (pg. 8). **Mariinskij Theater** owners earn +1 ruble per
 *    aristocrat in their play area (pg. 7).
 *  - **Aristocrat phase:** **Tax man** owners earn +1 ruble per worker in their play area (pg. 7).
 *
 * Split out of `scoreAndRefill` so the Pub interlude (`pass` → `pubBuy`) can run *between* scoring and the
 * board refill / phase advance — the sheet's "immediately after each scoring of buildings" (pg. 8).
 */
export function scorePlayers(state: StPetersburgState): StPetersburgPlayer[] {
  // The closing phase is always a scoring kind here (trading is handled by the caller); narrow so the
  // per-kind play-area group is indexable.
  const kind = state.phase as Exclude<Phase, 'trading'>;

  return state.players.map((player) => {
    let addRubles = 0;
    let addPoints = 0;
    for (const card of player.playArea[kind]) {
      addRubles += card.income;
      // A flipped Observatory forfeits its 1 point this round (pg. 8); income is 0 either way.
      const observatoryFlipped = card.special === 'observatory' && state.observatoryUsed.includes(card.id);
      if (!observatoryFlipped) addPoints += card.points;
    }
    if (kind === 'building') addRubles += mariinskijBonus(player); // +1₽ / aristocrat (pg. 7)
    if (kind === 'aristocrat') addRubles += taxmanBonus(player); // +1₽ / worker (pg. 7)
    return { ...player, rubles: player.rubles + addRubles, points: player.points + addPoints };
  });
}

/**
 * **Refill** the board and **advance** past the just-scored phase (pg. 4) — the non-scoring tail of a
 * scoring-phase close. Reads the *closing* phase off `state.phase` (so call it before the phase advances),
 * but touches no player field, so it composes with `scorePlayers` in either order:
 *
 *  - **Refill** the upper row from the *next* phase's stack to `BOARD_SIZE` (8) — **unless** the pg. 8
 *    special case applies (`tookCardThisPhase === false`): no cards are placed, but the stacks still turn.
 *  - **Advance**: the next phase's starting player is up, passes reset, and `tookCardThisPhase` resets.
 */
export function advanceAfterScoring(state: StPetersburgState): Partial<StPetersburgState> {
  const next = nextPhase(state.phase);
  // pg. 8 special case: refill only if a card was taken this phase; otherwise the phase turns with no deal.
  let board = state.board;
  let finalRound = state.finalRound;
  if (state.tookCardThisPhase) {
    const refill = refillUpper(state.board, next);
    board = refill.board;
    // A refill placing the group's last card arms the SP6 end trigger (pg. 5); `finalRound` is sticky.
    if (refill.placedLast) finalRound = true;
  }

  return {
    board,
    phase: next,
    activePlayerIndex: state.startingPlayers[next],
    consecutivePasses: 0,
    tookCardThisPhase: false,
    finalRound,
  };
}

/**
 * Rotate all four starting-player markers **one seat left** for the next round (pg. 5: "The players give
 * their starting player markers to their **left neighbors**").
 *
 * "Left neighbor" is the next seat in turn order — the same direction `nextSeatIndex` advances (the pg. 5
 * diagrams show the marker arrow going B→C, i.e. in play order), so a marker at seat `i` moves to `i+1`.
 * Hence the seat that *opens* each phase next round is the successor of the one that opened it this round.
 */
export function rotateMarkersLeft(
  startingPlayers: Readonly<Record<Phase, number>>,
  playerCount: number,
): Record<Phase, number> {
  const rotated = {} as Record<Phase, number>;
  for (const phase of PHASES) rotated[phase] = (startingPlayers[phase] + 1) % playerCount;
  return rotated;
}

/**
 * Close the **trading** phase and roll the round over (pg. 5). Trading has no scoring, so this replaces
 * `scoreAndRefill`; it returns the changes for `pass` to fold into one `record()`:
 *
 *  1. **Discard the lower row** (pg. 5): every card in the lower row leaves the game (the discard count
 *     grows). Round 1's lower row is empty, so nothing is discarded then.
 *  2. **Slide upper → lower** (pg. 5): the remaining upper-row cards become the new lower row.
 *  3. **Refill workers to 8** from the worker stack (pg. 5) — **unconditionally**. This is the new
 *     round's *setup*, not a mid-round phase handoff, so the pg. 8 special case does **not** gate it.
 *
 *     ⚠️ **Correction (folded into SP3 from a live play-test bug).** SP2 originally gated this deal on
 *     `tookCardThisPhase`, reading pg. 8's "add no new cards to the board" as covering the round-end
 *     worker deal too. That was wrong, and it drained the board permanently: the trading phase currently
 *     can take **no** cards (trading buys are refused until SP4; ADD_TO_HAND arrives in SP3), so every
 *     trading phase ended card-less → every rollover skipped the worker deal while still discarding the
 *     lower row → the board shrank to empty and never recovered. The correct reading: **pg. 8's special
 *     case modifies the mid-round phase-end refill only** ("the administrator will add no new cards … he
 *     will, however, turn the card stacks", i.e. the phase handoffs handled by `scoreAndRefill`). **pg.
 *     5's round-end sequence — discard lower, slide upper→lower, deal workers to 8 — is the next round's
 *     setup and runs regardless.** So `scoreAndRefill` keeps the pg. 8 gate; `roundTransition` does not.
 *  4. **Rotate markers left** (pg. 5) and **increment the round**; the new worker phase's starting player
 *     is up, passes reset, and `tookCardThisPhase` resets.
 */
export function roundTransition(state: StPetersburgState): Partial<StPetersburgState> {
  const discarded = state.board.lower.length;
  // Discard the lower row; slide the upper row down into it. Upper is momentarily empty before the refill.
  const slid: Board = {
    ...state.board,
    upper: [],
    lower: state.board.upper,
    discard: state.board.discard + discarded,
  };
  // pg. 5: the round-end worker deal is unconditional (the new round's setup, not a mid-round refill).
  const refill = refillUpper(slid, 'worker');
  const startingPlayers = rotateMarkersLeft(state.startingPlayers, state.players.length);

  return {
    board: refill.board,
    round: state.round + 1,
    phase: 'worker',
    startingPlayers,
    activePlayerIndex: startingPlayers.worker,
    consecutivePasses: 0,
    tookCardThisPhase: false,
    // Between-rounds trigger ruling (pg. 5, SP6): this worker deal seeds the *new* round's worker phase, so
    // if it places the last worker on the board the game enters its final round and the round about to be
    // played out **is** "this round" — the game continues through all its phases, then ends. (This runs only
    // when `finalRound` was false — `pass` ends the game instead of rolling over once it is set — so the
    // sticky-OR isn't needed here; the deal itself is the only way `finalRound` can become true at rollover.)
    finalRound: refill.placedLast,
    // Every Observatory turns face-up for the new round (pg. 8) — scores its point / is drawable again.
    observatoryUsed: [],
  };
}
