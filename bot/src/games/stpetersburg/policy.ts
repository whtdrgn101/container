import {
  ARISTOCRAT_SCORE,
  CARD_KINDS,
  displacementCost,
  effectiveCost,
  handCost,
  legalActions,
  PUB_POINT_COST,
} from '@game-hub/engine/stpetersburg';
import type {
  Action,
  Card,
  CardKind,
  PlayerView,
  StPetersburgState,
  StPetersburgView,
} from '@game-hub/engine/stpetersburg';

/**
 * The tunable opinions, in one place (SP9 greedy baseline — the "frozen first cut", Stone Age's pattern).
 * Every number is roughly "how many final victory points is this worth", and the evaluator prices each
 * offered action in those terms so the argmax over `legalActions` is a single comparable quantity.
 *
 * These are **opinions, not rules**; retune freely (a later calibration slice pits this frozen copy against
 * a new one). The rulebook tips they encode (pg. 8, cited at each use): workers early (income compounds);
 * expensive cards have the better payback ratios; keep money for the trading phase (upgrades score big);
 * distinct aristocrats are the end-game engine; a card in hand is −5 at the end, so hold sparingly and shed
 * late.
 */
export const WEIGHTS = {
  /**
   * Points a card scores every round it exists: 1 ruble of recurring **income** is worth this many VP
   * (it bundles the eventual money bonus — floor(rubles/10) — with the fact income can be **re-spent** on
   * more engines, pg. 8 "the money you earn buys the next card"). A recurring **point** is worth 1 VP flat.
   */
  incomeVp: 0.35,
  pointVp: 1.0,
  /**
   * Points-cost of one ruble **spent** on a purchase. Deliberately low: rubles spent to acquire an engine
   * return far more than they cost, which is why buying is generally good — the brake on spending is the
   * reserve below, not this. (A ruble merely *banked* is worth 0.1 at the end; spending it costs a bit more
   * than that because it also forgoes compounding — hence the reserve, not a high per-ruble cost.)
   */
  costVp: 0.15,
  /**
   * Keep money for the trading phase (pg. 8 — "upgrades are where the big points are"). Spending that would
   * drop the seat below `reserve` rubles is penalised by the shortfall × `reserveVp`, so the bot spends
   * freely down to a working reserve, then holds — the *keep-trading-money* tip, and the guard against the
   * greedy trap of spending to zero. Lifted entirely in the final round (nothing left to save for).
   */
  reserve: 8,
  reserveVp: 0.4,
  /**
   * Hand-card −5 penalty management (pg. 6 "−5 per card left in hand"). `handShed` is the value of playing
   * a held card out **in the final round** (it permanently escapes the −5); `handShedIdle` is a mild
   * always-on nudge to prefer playing over holding when values otherwise tie. Together they encode "play
   * from hand aggressively late; never end the final round holding a card it could shed".
   */
  handShed: 5,
  handShedIdle: 0.5,
  /**
   * Adding a card to hand is a *speculative, deferred* acquisition (free now, paid + played later), so its
   * owned-value is discounted and charged a hold risk (the −5 tail) that grows with how full the hand
   * already is. Tuned so a direct affordable BUY beats an ADD, and ADD wins mainly when a strong card
   * can't be bought outright this turn (pg. 8's "take a card you can't afford yet").
   */
  handDiscount: 0.5,
  handRisk: 1.5,
  handCrowd: 1.0,
  /** Small value of parking an Observatory draw into hand when buying it isn't worth it (defensive path). */
  handHold: 0.3,
} as const;

const PHASE_INDEX: Readonly<Record<string, number>> = { worker: 0, building: 1, aristocrat: 2, trading: 3 };

/** The horizon everything is discounted against — the phase-kind a card actually scores under. */
function effectiveKind(card: Card): CardKind {
  return card.kind === 'trading' ? (card.tradingGroup ?? card.kind) : card.kind;
}

/** Clamp `n` into `[lo, hi]`. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * How many more rounds this game likely runs — the horizon the recurring engines discount against. The
 * real end trigger (pg. 5) is a draw stack emptying, and the round-end worker deal drains the worker stack
 * every round unconditionally, so the tightest stack bounds the game. A rough count is plenty for a greedy
 * baseline: the smallest stack over a per-round draw of about one card per seat, clamped to a sane range.
 * In the final round it is 1 by definition.
 */
export function estimateRoundsLeft(view: StPetersburgView): number {
  if (view.finalRound) return 1;
  const minStack = Math.min(...(CARD_KINDS as readonly CardKind[]).map((k) => view.board.stacks[k]));
  return clamp(Math.round(minStack / view.players.length), 1, 8);
}

/** The decision context, computed once per `decide` so the per-action scorer stays cheap. */
export interface Ctx {
  readonly roundsLeft: number;
  readonly finalRound: boolean;
  readonly phaseIndex: number;
}

/** Build the per-turn context from the view. */
export function makeCtx(view: StPetersburgView): Ctx {
  return {
    roundsLeft: estimateRoundsLeft(view),
    finalRound: view.finalRound,
    phaseIndex: PHASE_INDEX[view.phase] ?? 0,
  };
}

/**
 * How many times a card of `kind` still scores before the game ends. One scoring per round, minus the
 * current round if its phase has already passed this round (a card bought after its phase idles until next
 * round — or never, in the final round). Floored at 1 outside the final round so an underestimated horizon
 * never zeroes a real engine.
 */
function scoringEvents(kind: CardKind, ctx: Ctx): number {
  const kindIndex = PHASE_INDEX[kind] ?? 0;
  const passedThisRound = ctx.phaseIndex > kindIndex;
  const events = ctx.roundsLeft - (passedThisRound ? 1 : 0);
  return Math.max(ctx.finalRound ? 0 : 1, events);
}

/** Find an owned card by instance id across the three play-area groups (a displacement target). */
function findInPlayArea(player: PlayerView, id: string): Card | undefined {
  return [...player.playArea.worker, ...player.playArea.building, ...player.playArea.aristocrat].find(
    (c) => c.id === id,
  );
}

/** The board score for a count of distinct aristocrats, clamped to the table's domain (pg. 5–6). */
function aristocratScore(distinct: number): number {
  return ARISTOCRAT_SCORE[Math.min(distinct, ARISTOCRAT_SCORE.length - 1)] ?? 0;
}

/**
 * The marginal end-game points from an action's effect on the **distinct-aristocrat** count (pg. 5–6): the
 * aristocrat group's identities are the end-game engine, and the table is triangular, so the *n*th new
 * distinct is worth *n*. Simulated exactly over the (public) play area — add `card` and remove `displaced`
 * when either is an aristocrat-group card — so a *new* identity is rewarded and a *duplicate* is not, and a
 * displacement that removes the last copy of a key is priced correctly.
 */
export function aristocratEndDelta(player: PlayerView, card: Card, displaced: Card | undefined): number {
  const counts = new Map<string, number>();
  for (const c of player.playArea.aristocrat) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
  const distinctBefore = counts.size;
  if (displaced && effectiveKind(displaced) === 'aristocrat') {
    const left = (counts.get(displaced.key) ?? 0) - 1;
    if (left <= 0) counts.delete(displaced.key);
    else counts.set(displaced.key, left);
  }
  if (effectiveKind(card) === 'aristocrat') counts.set(card.key, (counts.get(card.key) ?? 0) + 1);
  return aristocratScore(counts.size) - aristocratScore(distinctBefore);
}

/** The penalty for spending down below the trading-phase reserve (pg. 8). Zero once in the final round. */
function reservePenalty(rublesAfter: number, ctx: Ctx): number {
  if (ctx.finalRound) return 0;
  return Math.max(0, WEIGHTS.reserve - rublesAfter) * WEIGHTS.reserveVp;
}

/**
 * The value, in final victory points, of **owning** `card` from now on given it cost `cost` rubles and (for
 * a trading upgrade) replaced `displaced`. The recurring income/points stream over the remaining scoring
 * events, plus the distinct-aristocrat end bonus, minus the ruble cost and any reserve shortfall it opens.
 */
export function acquisitionValue(
  player: PlayerView,
  card: Card,
  displaced: Card | undefined,
  cost: number,
  ctx: Ctx,
): number {
  const events = scoringEvents(effectiveKind(card), ctx);
  const deltaIncome = card.income - (displaced?.income ?? 0);
  const deltaPoints = card.points - (displaced?.points ?? 0);
  const recurring = deltaIncome * events * WEIGHTS.incomeVp + deltaPoints * events * WEIGHTS.pointVp;
  const endBonus = aristocratEndDelta(player, card, displaced);
  const rubles = player.rubles ?? 0;
  return recurring + endBonus - cost * WEIGHTS.costVp - reservePenalty(rubles - cost, ctx);
}

/** The value of buying `points` at the Pub (pg. 8): whole VP for 2 rubles each, worth it only near the end. */
function pubValue(points: number, ctx: Ctx): number {
  if (points <= 0) return 0;
  // A ruble converted at the Pub costs its alternative use: high early (it compounds), ~end-rate late.
  const rubleWorth = ctx.finalRound ? 0.1 : clamp(0.15 + 0.08 * ctx.roundsLeft, 0.15, 0.6);
  return points * WEIGHTS.pointVp - points * PUB_POINT_COST * rubleWorth;
}

/**
 * Score one offered action in points-equivalent. `PASS` is the zero baseline: an action is only taken when
 * it beats passing (which lets a phase close and the game progress). Every branch reads **own-seat**
 * knowledge only (the active view's rubles/hand are visible; opponents' are `null` and never read).
 */
export function evaluate(view: StPetersburgView, player: PlayerView, action: Action, ctx: Ctx): number {
  switch (action.type) {
    case 'PASS':
      return 0;

    case 'BUY': {
      const card = view.board[action.row][action.index]!;
      const displaced = action.displace ? findInPlayArea(player, action.displace) : undefined;
      const cost =
        card.kind === 'trading'
          ? displacementCost(player, card, displaced!, action.row)
          : effectiveCost(player, card, action.row);
      return acquisitionValue(player, card, displaced, cost, ctx);
    }

    case 'PLAY_FROM_HAND': {
      const card = player.hand![action.index]!; // own hand — visible on the active seat's own view
      const displaced = action.displace ? findInPlayArea(player, action.displace) : undefined;
      const cost =
        card.kind === 'trading' ? displacementCost(player, card, displaced!, undefined) : handCost(player, card);
      const shed = ctx.finalRound ? WEIGHTS.handShed : WEIGHTS.handShedIdle;
      return acquisitionValue(player, card, displaced, cost, ctx) + shed;
    }

    case 'ADD_TO_HAND': {
      // Never hold a card into the final round — it can only cost −5 (pg. 6).
      if (ctx.finalRound) return -Infinity;
      const card = view.board[action.row][action.index]!;
      // Free now, paid + played later: value it as if owned at a rough later cost, discounted, minus the
      // hold risk (worse the fuller the hand). Trading cards need a future displacement, so estimate.
      const estCost = card.kind === 'trading' ? Math.max(1, Math.round(card.cost * 0.4)) : handCost(player, card);
      const owned = acquisitionValue(player, card, undefined, estCost, ctx);
      return owned * WEIGHTS.handDiscount - WEIGHTS.handRisk - player.handCount * WEIGHTS.handCrowd;
    }

    case 'PUB_BUY':
      return pubValue(action.points, ctx);

    case 'OBSERVATORY_RESOLVE': {
      // Defensive: a bot never draws (see decide), so it never faces its own pending draw. Kept whole so
      // decide's argmax is uniform over whatever legalActions offers.
      if (action.choice === 'discard') return 0;
      const card = view.pendingDraw!.card;
      if (action.choice === 'hand') return ctx.finalRound ? -1 : WEIGHTS.handHold;
      const displaced = action.displace ? findInPlayArea(player, action.displace) : undefined;
      const cost =
        card.kind === 'trading' ? displacementCost(player, card, displaced!, undefined) : handCost(player, card);
      return acquisitionValue(player, card, displaced, cost, ctx);
    }

    default:
      return 0;
  }
}

/**
 * The best legal action for the active bot right now — argmax of `evaluate` over `legalActions(view)`.
 *
 * `legalActions` is the engine's, driven off the **view**: it reads only own-seat secrets (the active
 * seat's rubles/hand, both visible on its own view) and public board/play-area data, so the one cast is
 * sound (the same reasoning the UI uses). It fully parameterises every move — one `BUY`/`PLAY_FROM_HAND`
 * per displacement target, `PUB_BUY 0..n`, etc. — so ranking them *is* the whole policy, and every choice
 * is a legal move by construction. (It offers no `OBSERVATORY_DRAW` off a view — the draw stacks are a
 * redacted secret, so a greedy baseline simply never gambles on a blind draw, scoring the Observatory's
 * flat point instead; a documented v1 limitation.)
 */
export function pickAction(view: StPetersburgView, playerId: string): Action {
  const player = view.players[view.activePlayerIndex]!;
  const ctx = makeCtx(view);
  const actions = legalActions(view as unknown as StPetersburgState, playerId);

  let best = actions[0]!;
  let bestScore = -Infinity;
  for (const action of actions) {
    const score = evaluate(view, player, action, ctx);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}
