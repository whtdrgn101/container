import type { RouteId, TrackColor } from '../core';

/**
 * Everything a player can do in Russian Railroads (RR2: the worker-placement spine + track extension).
 *
 * `PLACE` puts workers (and/or coins as substitutes, pg. 14) on an unoccupied action space and resolves it
 * (pg. 7, 9). A track-extension space sets a pending lock; `MOVE_TRACK` then resolves it one space at a
 * time (pg. 8–9), and no other action is allowed until the lock clears. `PASS` ends your participation for
 * the round (pg. 7); when every seat has passed the round closes and scores. The rest of the action board —
 * the colour spaces, locomotives, industry, doublers, engineers, the turn-order track — lands one slice at
 * a time.
 */
export type Action =
  | {
      readonly type: 'PLACE';
      /** The action-space id to place on (pg. 7). */
      readonly space: string;
      /**
       * How many of the required workers to pay with **coins** instead (pg. 14: coins substitute for
       * workers, and can be combined with them). 0 or absent ⇒ all workers. Must be ≤ the space's
       * requirement, and the seat must hold that many coins. Not allowed on the worker+coin space.
       */
      readonly coins?: number;
      /**
       * On a locomotive/factory **"or"** space (pg. 12): build a `'loco'` (default) or a `'factory'`. On
       * the **"and"** space it is ignored (both are built); ignored on every other space.
       */
      readonly build?: 'loco' | 'factory';
      /**
       * On the 3-worker "locomotive **and** factory" space (pg. 12): whether to add the `'loco'` (default)
       * or the `'factory'` first. Ignored elsewhere.
       */
      readonly first?: 'loco' | 'factory';
    }
  | {
      readonly type: 'MOVE_TRACK';
      /** Which of the player's three routes to advance a track on (pg. 8). */
      readonly route: RouteId;
      /**
       * The colour of track to advance (pg. 9). Optional in RR2 — the lock allows only wood, so it
       * defaults; the field is here for RR3's colour choice. Must be one the current lock allows.
       */
      readonly color?: TrackColor;
    }
  | {
      /**
       * Place the held locomotive on a route with an empty slot (pg. 10) — ends the pending-loco chain.
       * Only legal while a `pendingLoco` lock is set (RR4).
       */
      readonly type: 'PLACE_LOCO';
      /** Which route to place the held locomotive on (must have an empty slot, pg. 10). */
      readonly route: RouteId;
    }
  | {
      /**
       * Upgrade a lower-numbered locomotive on a route with the held one (pg. 10): the displaced loco
       * becomes the new held locomotive (the pg. 11 chain reaction). Only legal under a `pendingLoco` lock.
       */
      readonly type: 'REPLACE_LOCO';
      /** The route holding the locomotive to upgrade (pg. 10). */
      readonly route: RouteId;
      /** The printed number of the locomotive to replace — must exist on the route and be lower (pg. 10). */
      readonly number: number;
    }
  | {
      /**
       * Flip the held locomotive to its factory side and return it to the supply (pg. 11) — ends the chain.
       * Only legal under a `pendingLoco` lock **and** when no empty locomotive slot remains (pg. 11).
       */
      readonly type: 'FLIP_LOCO';
    }
  | {
      /**
       * Resolve a pending factory (pg. 12): place it into the **leftmost unfilled gap** on the industry
       * track. Only legal under a `pendingFactory` lock and while a gap is unfilled (RR5).
       */
      readonly type: 'PLACE_FACTORY';
      /**
       * Which factory tile to build: a **returned factory** of this number, or the **lowest-numbered
       * locomotive** if absent (pg. 12). The engine validates availability.
       */
      readonly from?: number;
    }
  | {
      /**
       * Resolve a pending factory by **replacing** an existing one (pg. 12): only once all 5 gaps are
       * filled. The replaced factory returns to the supply. Only legal under a `pendingFactory` lock.
       */
      readonly type: 'REPLACE_FACTORY';
      /** Which gap slot (0–4) to replace (pg. 12: any slot, not left-to-right). */
      readonly slot: number;
      /** The factory tile to build — a returned factory number, or the lowest locomotive if absent (pg. 12). */
      readonly from?: number;
    }
  | {
      /**
       * Spend one **action-pool** credit (pg. 13): opens the pending-moves lock for that credit's track
       * step(s). Only legal while the active seat has pool credits and no other lock is set (RR5).
       */
      readonly type: 'RESOLVE_POOL';
      /** The pool entry id to resolve. */
      readonly id: string;
    }
  | {
      /** Forfeit all remaining action-pool credits and end the resolution (pg. 13: unused credits are lost). */
      readonly type: 'SKIP_POOL';
    }
  | { readonly type: 'PASS' };

export type ActionType = Action['type'];
