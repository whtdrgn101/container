import { BOARD_SIZE, PHASES } from '../core';
import type { Board, CardKind, Phase, StPetersburgState } from '../core';

/** The next seat clockwise from the active one (pg. 3): increasing seat index, wrapping (skips nobody). */
export function nextSeatIndex(state: StPetersburgState): number {
  return (state.activePlayerIndex + 1) % state.players.length;
}

/** The phase after `phase` in the fixed cycle worker → building → aristocrat → trading → worker (pg. 2). */
export function nextPhase(phase: Phase): Phase {
  return PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length]!;
}

/**
 * Draw from `from`'s stack into the **upper** row until the board holds `BOARD_SIZE` (8) cards across both
 * rows (pg. 4, "always 8!"). If the stack is short, deal what's there — a short stack is SP6's end trigger,
 * not this function's concern. Pure: returns a new board, popping the drawn cards off the stack.
 */
function refillUpper(board: Board, from: CardKind): Board {
  const onBoard = board.upper.length + board.lower.length;
  const need = Math.max(0, BOARD_SIZE - onBoard);
  const stack = board.stacks[from];
  const drawn = stack.slice(0, need);
  return {
    ...board,
    upper: [...board.upper, ...drawn],
    stacks: { ...board.stacks, [from]: stack.slice(drawn.length) },
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
  // The closing phase is always a scoring kind here (trading is handled by the caller); narrow so the
  // per-kind play-area group is indexable.
  const kind = state.phase as Exclude<Phase, 'trading'>;

  const players = state.players.map((player) => {
    let addRubles = 0;
    let addPoints = 0;
    for (const card of player.playArea[kind]) {
      addRubles += card.income;
      addPoints += card.points;
    }
    return { ...player, rubles: player.rubles + addRubles, points: player.points + addPoints };
  });

  const next = nextPhase(state.phase);
  // pg. 8 special case: refill only if a card was taken this phase; otherwise the phase turns with no deal.
  const board = state.tookCardThisPhase ? refillUpper(state.board, next) : state.board;

  return {
    players,
    board,
    phase: next,
    activePlayerIndex: state.startingPlayers[next],
    consecutivePasses: 0,
    tookCardThisPhase: false,
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
 *  3. **Refill workers to 8** from the worker stack (pg. 5) — **unless** the pg. 8 special case applies:
 *     if **no card left the board during the trading phase** (`tookCardThisPhase === false`), *no new
 *     cards are placed*. My reading (pg. 8, "Special case: no cards are bought or added…": "the
 *     administrator will add no new cards to the board. He will, however, turn the card stacks…"): the
 *     round still ends and the stacks still turn, but the *worker deal* — the only step that "adds new
 *     cards to the board" — is skipped, exactly as a mid-round refill is. The discard and the slide are
 *     rearrangements of cards already on the board, not additions, so they **always** happen.
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
  // pg. 8: only deal workers if a card was taken during the trading phase; else the board just slides.
  const board = state.tookCardThisPhase ? refillUpper(slid, 'worker') : slid;
  const startingPlayers = rotateMarkersLeft(state.startingPlayers, state.players.length);

  return {
    board,
    round: state.round + 1,
    phase: 'worker',
    startingPlayers,
    activePlayerIndex: startingPlayers.worker,
    consecutivePasses: 0,
    tookCardThisPhase: false,
  };
}
