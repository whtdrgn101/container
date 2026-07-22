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

/**
 * One player's final-scoring result (pg. 5–6, SP6) — the full breakdown the results screen renders.
 *
 * `total = base + aristocrats + money − handPenalty`, computed with **no clamp** (the rulebook states none;
 * pg. 6's minus-points example simply subtracts). A total can therefore be negative if hand penalties
 * outweigh a small banked score — preserved faithfully rather than floored at 0.
 */
export interface StPetersburgResult {
  readonly playerId: string;
  /** Points already banked on the public scoring track when the game ended (pg. 4). */
  readonly base: number;
  /** Points for **distinct** aristocrats, from the board table (pg. 5–6): `ARISTOCRAT_SCORE[distinct]`. */
  readonly aristocrats: number;
  /** How many distinct aristocrats (by card identity) drove `aristocrats` — surfaced for the results UI. */
  readonly distinctAristocrats: number;
  /** 1 point per full 10 rubles left (pg. 6): `floor(rubles / 10)`. */
  readonly money: number;
  /** −5 per card still in hand (pg. 6), as a **positive** magnitude subtracted from the total. */
  readonly handPenalty: number;
  /** The final score: `base + aristocrats + money − handPenalty` (unclamped). */
  readonly total: number;
}

/**
 * The **Observatory** draw interlude (pg. 8, SP5). A player who owns an unflipped Observatory may, once
 * per round during the building phase, draw the top card of a chosen stack **instead of a normal action**;
 * it lands here as a forced follow-up decision (buy / hand / discard), locking the drawing seat's turn
 * exactly like Stone Age's `pendingGather`. The `card` is drawn from a stack (otherwise a *secret*, pg. 2),
 * but the observatory draw happens openly at the table — like a hand *take* (SP3), the card is **public
 * the moment it's drawn** — so `viewFor` reveals it (documented in `view.ts` / `actions/observatory.ts`).
 */
export interface PendingDraw {
  /** Seat index of the Observatory's owner (the only seat that may resolve this). */
  readonly seat: number;
  /** Which stack the top card came from (pg. 8: "the stack of his choice"). */
  readonly stack: CardKind;
  /** The drawn card — public (revealed by `viewFor`, never redacted; see above). */
  readonly card: Card;
  /** The instance id of the Observatory that drew — flipped (scored 0) once this resolves. */
  readonly observatoryId: string;
}

/**
 * The **Pub** decision window (pg. 8, SP5). *Immediately after* the building phase scores, every seat
 * owning at least one Pub may buy up to 5 victory points at 2 rubles each. It is modelled as an interlude:
 * the building phase's actions have ended and scoring has run, but the phase does **not** advance (no
 * refill, no next phase) until each queued Pub owner has taken a `PUB_BUY` (0 points = decline). The head
 * of the queue is the seat on the clock (`activePlayerIndex`); the phase advances when the queue empties.
 */
export interface PendingPubBuy {
  /** Seat indices owning a Pub, not yet resolved, in ascending seat order. The head is up. */
  readonly queue: readonly number[];
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
  /**
   * Instance ids of **Observatory** cards flipped (used) this round (pg. 8, SP5). A flipped Observatory
   * scores 0 points at building scoring and may not be upgraded (displaced) while flipped. Reset to `[]`
   * at the round transition ("to begin the next round, he turns it face-up"). Empty when no Observatory
   * has been used.
   */
  readonly observatoryUsed: readonly string[];
  /**
   * Whether the game is in its **final round** (pg. 5, SP6). Set `true` the moment a board refill places
   * the **last card of any group** onto the board (the last worker / building / aristocrat / trading card);
   * once set it stays set. The game then "continues through all phases of this round" and, when the trading
   * phase closes, ends into final scoring instead of rolling over. Set at a phase-handoff refill
   * (`advanceAfterScoring`) or the round-end worker deal (`roundTransition`) — see `internal/phase.ts` for
   * the trigger detection and the between-rounds ruling. Starts `false`.
   */
  readonly finalRound: boolean;
  /**
   * A rolled-but-unresolved Observatory draw (pg. 8, SP5), or absent. While present the drawing seat's
   * turn is **locked**: the only legal move is `OBSERVATORY_RESOLVE` (buy / hand / discard), the same way
   * `pendingGather` locks a Stone Age turn.
   */
  readonly pendingDraw?: PendingDraw;
  /**
   * The **Pub** buy-points interlude after building scoring (pg. 8, SP5), or absent. While present the
   * building phase is paused: the queued Pub owner on the clock must take a `PUB_BUY` before anything else.
   */
  readonly pendingPubBuy?: PendingPubBuy;
  readonly version: number;
  readonly log: readonly MoveRecord[];
} & GameEndState<StPetersburgResult>;
