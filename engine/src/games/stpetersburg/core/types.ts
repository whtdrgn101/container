import type { GameEndState, MoveRecord } from '../../../kernel';

// The append-only move-log entry is a kernel primitive; re-exported so Saint Petersburg's modules
// import it from `../core` alongside the domain types.
export type { MoveRecord } from '../../../kernel';

/**
 * The four card groups (rulebook pg. 1–2). Each is also a face-down draw **stack** on the board and the
 * name of a **phase** — worker → building → aristocrat → trading (pg. 2). `trading` cards carry a
 * `tradingGroup` marking which colour group they upgrade (pg. 7).
 */
export type CardKind = 'worker' | 'building' | 'aristocrat' | 'trading';

/** A round's four phases, in play order (pg. 2). Same names as the card groups. */
export type Phase = 'worker' | 'building' | 'aristocrat' | 'trading';

/**
 * The five green "ware" symbols (pg. 7). A green **worker** and its green **trading** upgrade must share
 * a ware symbol to displace (lumberjack↔carpenter workshop, gold miner↔gold smelter, shepherd↔weaving
 * mill, fur trapper↔fur shop, ship builder↔wharf). Only green cards carry one.
 */
export type Ware = 'lumber' | 'gold' | 'wool' | 'fur' | 'ship';

/** Which colour group a trading card upgrades (pg. 7): its front colour. */
export type TradingGroup = 'worker' | 'building' | 'aristocrat';

/**
 * The six special cards flagged for their unique rules (pg. 7–8), each landing in its own mechanic at
 * SP5. `potemkin`/`pub`/`warehouse`/`observatory` are blue buildings; `mariinskij` is a blue building
 * trading card and `taxman` an orange aristocrat trading card.
 */
export type SpecialId = 'pub' | 'warehouse' | 'mariinskij' | 'taxman' | 'potemkin' | 'observatory';

/**
 * One card **definition** — the printed data for a card, from the rulebook contents (pg. 1) and the
 * trading/special sheet (pg. 7–8). Instances on the board / in hands / in play areas are minted from
 * these at `createGame` (`count` copies each), each with a unique `id`.
 */
export interface CardDef {
  /** Stable key for the definition (e.g. `lumberjack`), shared by every copy. */
  readonly key: string;
  readonly kind: CardKind;
  /** English name for display and logs. */
  readonly name: string;
  /** Printed purchase cost, upper-left (pg. 3). */
  readonly cost: number;
  /** Rubles paid when this card's group scores (0 if none — buildings pay points, not money). */
  readonly income: number;
  /** Victory points scored (0 if none — workers pay money, not points). */
  readonly points: number;
  /** Copies in the deck (pg. 1). */
  readonly count: number;
  /** Green ware symbol, on the five basic workers + their five green trading upgrades only (pg. 7). */
  readonly ware?: Ware;
  /** Which group a trading card upgrades. Present iff `kind === 'trading'`. */
  readonly tradingGroup?: TradingGroup;
  /** One of the six special cards, flagged for its SP5 rule (pg. 7–8). */
  readonly special?: SpecialId;
}

/**
 * A single card **instance** on the board, in a hand, or in a play area. Carries its definition's fields
 * denormalised (like Stone Age's building tiles) so any holder can render/score it without a deck lookup,
 * plus a unique `id` distinguishing the copies (`lumberjack-3`).
 */
export interface Card {
  readonly id: string;
  readonly key: string;
  readonly kind: CardKind;
  readonly name: string;
  readonly cost: number;
  readonly income: number;
  readonly points: number;
  readonly ware?: Ware;
  readonly tradingGroup?: TradingGroup;
  readonly special?: SpecialId;
}

/** A player's face-up play area, grouped by type (pg. 3: "group all workers, buildings, aristocrats"). */
export interface PlayArea {
  readonly worker: readonly Card[];
  readonly building: readonly Card[];
  readonly aristocrat: readonly Card[];
}

/** One player (pg. 2). `rubles` and `hand` are the game's two secrets — redacted by `viewFor`. */
export interface StPetersburgPlayer {
  readonly id: string;
  readonly name: string;
  /** Rubles in hand — kept secret from opponents (pg. 2 "may never tell"). Starts at 25. */
  readonly rubles: number;
  /**
   * Victory points on the public scoring track (pg. 4). Buildings and aristocrats add points at phase
   * scoring; always public (opponents watch each other's figures move). Starts at 0. Final-scoring
   * bonuses (distinct aristocrats, money ÷10, −5/hand card — pg. 5–6) are added at game end (SP6).
   */
  readonly points: number;
  /** Face-up cards played to the table, grouped by type. All public. */
  readonly playArea: PlayArea;
  /** Secret hand of ≤3 cards (4 with the warehouse) — face down (pg. 3). */
  readonly hand: readonly Card[];
}

/**
 * The shared board (pg. 2, 4). Two face-up card rows the players buy from, four face-down draw stacks,
 * and a discard pile (only its count matters — discarded cards are out of the game).
 */
export interface Board {
  /** Upper card row — where new cards are placed (pg. 4). Up to 8 cards across both rows. */
  readonly upper: readonly Card[];
  /** Lower card row — last round's leftovers, bought at −1 ruble (pg. 6). Empty in round 1. */
  readonly lower: readonly Card[];
  /** The four face-down draw stacks, one per group. **A real secret** — the view carries counts only. */
  readonly stacks: Readonly<Record<CardKind, readonly Card[]>>;
  /** Number of cards in the discard pile (pg. 4). Out of the game; a count is all anyone needs. */
  readonly discard: number;
}

/** One player's final result (pg. 5–6, SP6). Minimal at the scaffold; the breakdown fleshes out later. */
export interface StPetersburgResult {
  readonly playerId: string;
  readonly total: number;
}

/**
 * The complete, serializable state of a Saint Petersburg game — the **bootstrap scaffold** (roadmap SP0).
 *
 * Everything a setup needs to *render* is here; the game is intentionally inert until each action lands
 * in its own slice. The state grows one slice at a time, exactly as the other three games' did.
 *
 * Intersected with the kernel `GameEndState` union (REVIEW.md §3.1) from day one: while `status` is
 * `'active'` there is no `results`/`winnerIds` at all; once `'ended'` (SP6) both are present and typed.
 * Narrow on `status` before reading them.
 */
export type StPetersburgState = {
  readonly id: string;
  readonly players: readonly StPetersburgPlayer[];
  readonly board: Board;
  /** Round counter (starts at 1). A game runs ~7–10 rounds (pg. 2). */
  readonly round: number;
  /** Which of the four phases is in progress (pg. 2). */
  readonly phase: Phase;
  /**
   * The seat that starts each phase (pg. 2, 5). Dealt at random via the four starting-player markers at
   * setup; all four rotate one seat left each round. Seat index into `players`.
   */
  readonly startingPlayers: Readonly<Record<Phase, number>>;
  /**
   * Whose turn it is within the current phase. At the scaffold it equals the current phase's starting
   * player; SP1 advances it around the table until everyone passes consecutively.
   */
  readonly activePlayerIndex: number;
  /**
   * How many players have passed in a row this phase (pg. 3). The phase's actions end when it reaches
   * the player count; a pass is **not sticky** — a passed player may act again next turn. Starts at 0.
   */
  readonly consecutivePasses: number;
  /**
   * Whether any card has left the board during the **current** phase's actions (a buy — and, from SP3,
   * an add-to-hand). Drives the pg. 8 special case: if no card was taken this phase, that phase's refill
   * is **skipped** (the stacks still "turn" — the phase advances and scoring runs). Reset to `false` when
   * a phase begins; set `true` by a buy. See `internal/phase.ts` for the reading and the round-transition
   * interaction.
   */
  readonly tookCardThisPhase: boolean;
  readonly version: number;
  readonly log: readonly MoveRecord[];
} & GameEndState<StPetersburgResult>;
