import {
  factoryAction,
  FACTORY_MOVE_COLORS,
  GAP_LANE_INDICES,
  INDUSTRY_END,
  INDUSTRY_LANE,
  industryPointsAt,
} from '../core';
import type { Industry, TrackColor } from '../core';

/**
 * The industry track (wrench) helpers (pg. 13–14, 21). Pure functions over a player's `Industry` — no
 * mutation, no randomness — so the 100% gate is reachable and the same code serves the engine, module and
 * (later) the bot.
 */

/** Which of the 5 gaps `laneIndex` is, or −1 if it isn't a gap. `factories[gapOrdinal]` fills it. */
export function gapOrdinal(laneIndex: number): number {
  return GAP_LANE_INDICES.indexOf(laneIndex);
}

/** The leftmost unfilled gap slot (0…4), or −1 if all 5 are filled (pg. 12: fill left→right). */
export function firstUnfilledGap(industry: Industry): number {
  return industry.factories.findIndex((f) => f == null);
}

/** Are all 5 gaps filled (pg. 12: replacement is only allowed once every slot holds a factory)? */
export function allGapsFilled(industry: Industry): boolean {
  return industry.factories.every((f) => f != null);
}

/**
 * The effect a factory grants when the wrench moves onto it (pg. 13). A `coins` factory yields coins
 * (choiceless — auto-resolved by the caller); a `moveTrack` factory yields a track-move credit (`count`
 * steps of any accessible colour, resolved via the pool). An `inert` factory yields nothing (lost, pg. 13).
 */
export function triggerEffect(factoryNumber: number): {
  readonly coins: number;
  readonly move: { readonly count: number; readonly colors: readonly TrackColor[] } | null;
} {
  const action = factoryAction(factoryNumber);
  if (action.kind === 'coins') return { coins: action.count, move: null };
  if (action.kind === 'moveTrack') return { coins: 0, move: { count: action.count, colors: FACTORY_MOVE_COLORS } };
  return { coins: 0, move: null };
}

/**
 * Advance the wrench up to `n` spaces (pg. 13–14). The wrench moves one lane entry at a time and **stops
 * before an unfilled gap** ("cannot move onto the gap and cannot skip it", pg. 13) — so a blocked advance
 * moves 0 spaces (the RR2 "as many as you are able to" forfeit precedent). It never moves past the end.
 * Each **factory** (filled gap) it moves onto is returned in `triggered`, in the order landed (pg. 13:
 * "when you move your wrench onto a factory, you immediately receive the indirect action").
 */
export function advanceWrench(
  industry: Industry,
  n: number,
): { readonly wrench: number; readonly triggered: number[] } {
  let wrench = industry.wrench;
  const triggered: number[] = [];
  for (let step = 0; step < n; step += 1) {
    const next = wrench + 1;
    if (next > INDUSTRY_END) break; // already at the end space
    const entry = INDUSTRY_LANE[next]!;
    if (entry.kind === 'gap') {
      const factory = industry.factories[gapOrdinal(next)];
      if (factory == null) break; // an unfilled gap blocks the wrench (pg. 13)
      wrench = next;
      triggered.push(factory); // moved onto a factory → trigger it (pg. 13)
    } else {
      wrench = next; // a numbered or numberless landing space
    }
  }
  return { wrench, triggered };
}

/** Place a factory into the leftmost unfilled gap (pg. 12, left→right). Assumes a gap is free (caller checked). */
export function placeFactoryInGap(industry: Industry, number: number): Industry {
  const slot = firstUnfilledGap(industry);
  const factories = industry.factories.map((f, i) => (i === slot ? number : f));
  return { ...industry, factories };
}

/**
 * Replace the factory in `slot` with `number` (pg. 12, once all 5 gaps are filled — any slot, no left→right
 * rule). Returns the new industry and the **replaced** number (which the caller returns to the supply).
 */
export function replaceFactoryInSlot(
  industry: Industry,
  slot: number,
  number: number,
): { readonly industry: Industry; readonly replaced: number } {
  const replaced = industry.factories[slot]!;
  const factories = industry.factories.map((f, i) => (i === slot ? number : f));
  return { industry: { ...industry, factories }, replaced };
}

/**
 * The industry-track points a player scores this round (pg. 21): the value on the wrench's space, or the
 * previous numbered space if it's on a factory / numberless space. Replaces the RR2 stub of 0.
 */
export function industryScore(industry: Industry): number {
  return industryPointsAt(industry.wrench);
}
