import type { GameEndState, Viewer } from '../../kernel';
import type { Card, CardKind, PendingDraw, PendingPubBuy, Phase, PlayArea, StPetersburgState, StPetersburgResult } from './core';

// `Viewer` is a kernel primitive; re-export it so consumers import it from this surface.
export type { Viewer } from '../../kernel';

/**
 * The board projected for a viewer. The two card rows are face-up (public), but the four draw **stacks
 * are a real secret** — the deck order matters — so a view carries their *counts* only, never their
 * contents (roadmap headline; the §4.6 lesson applied from day one). The discard is already a count.
 */
export interface BoardView {
  readonly upper: readonly Card[];
  readonly lower: readonly Card[];
  readonly stacks: Readonly<Record<CardKind, number>>;
  readonly discard: number;
}

/**
 * A player projected for a viewer (pg. 2). Two things are secret: a player's **rubles** ("may never
 * tell") and the **contents of their hand**. Own seat sees both; opponents see `rubles: null` and
 * `hand: null`, with only `handCount` to go on. Play areas are face-up, so always public.
 */
export interface PlayerView {
  readonly id: string;
  readonly name: string;
  /** This player's rubles, or `null` when redacted for an opponent. */
  readonly rubles: number | null;
  /** Victory points on the public scoring track — always visible (pg. 4). */
  readonly points: number;
  readonly playArea: PlayArea;
  /** Always visible — how many cards are in the hand. */
  readonly handCount: number;
  /** The hand's cards when the viewer owns this seat; `null` when redacted for an opponent. */
  readonly hand: readonly Card[] | null;
}

/**
 * A Saint Petersburg game projected for a viewer — the same shape as the state, with the two secrets
 * (opponent rubles, opponent hands) and the draw-stack contents redacted.
 */
// Intersection (not `interface extends`) so it distributes over the end-state union and keeps the
// `status` discriminant — an interface can't extend a union.
export type StPetersburgView = {
  readonly id: string;
  readonly players: readonly PlayerView[];
  readonly board: BoardView;
  readonly round: number;
  readonly phase: Phase;
  readonly startingPlayers: Readonly<Record<Phase, number>>;
  readonly activePlayerIndex: number;
  readonly consecutivePasses: number;
  /** Whether the game is in its final round (pg. 5, SP6) — public (the board/stacks everyone sees drive it). */
  readonly finalRound: boolean;
  /** Instance ids of Observatories flipped (used) this round (pg. 8, SP5) — public. */
  readonly observatoryUsed: readonly string[];
  /**
   * A pending Observatory draw (pg. 8, SP5), or absent. **Public** — including the drawn `card`: the draw
   * happens openly at the table (see `actions/observatory.ts`), so `viewFor` does not redact it.
   */
  readonly pendingDraw?: PendingDraw;
  /** A pending Pub buy-points window (pg. 8, SP5), or absent — just seat indices, so nothing to redact. */
  readonly pendingPubBuy?: PendingPubBuy;
  readonly viewerId: Viewer;
  readonly version: number;
  readonly log: StPetersburgState['log'];
} & GameEndState<StPetersburgResult>;

/** Does `viewer` own the seat `playerId` (so its secrets are visible)? A spectator (`null`/`[]`) owns none. */
function owns(viewer: Viewer, playerId: string): boolean {
  if (viewer === null) return false;
  if (typeof viewer === 'string') return viewer === playerId;
  return viewer.includes(playerId);
}

/**
 * Project `state` for `viewer` — the only thing standing between a client and another player's secrets.
 *
 * Opponents' rubles and hand contents are redacted; the draw stacks become counts. Once the game has
 * `ended` (SP6) everything is revealed — final scoring is public, and the money/hands are needed to see
 * how the result was reached (the same rule Container uses for its scoring cards).
 */
export function viewFor(state: StPetersburgState, viewer: Viewer): StPetersburgView {
  const revealAll = state.status === 'ended';

  const players: PlayerView[] = state.players.map((player) => {
    const mine = revealAll || owns(viewer, player.id);
    return {
      id: player.id,
      name: player.name,
      rubles: mine ? player.rubles : null,
      points: player.points,
      playArea: player.playArea,
      handCount: player.hand.length,
      hand: mine ? player.hand : null,
    };
  });

  const stackCounts = {} as Record<CardKind, number>;
  for (const kind of Object.keys(state.board.stacks) as CardKind[]) {
    stackCounts[kind] = state.board.stacks[kind].length;
  }

  return {
    ...state,
    players,
    board: { upper: state.board.upper, lower: state.board.lower, stacks: stackCounts, discard: state.board.discard },
    viewerId: viewer,
  };
}
