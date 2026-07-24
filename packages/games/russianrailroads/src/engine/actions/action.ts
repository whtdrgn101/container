/**
 * Everything a player can do in Russian Railroads (RR1: the worker-placement spine).
 *
 * `PLACE` puts workers (and/or coins as substitutes, pg. 14) on an unoccupied action space and resolves
 * it fully (pg. 7). `PASS` ends your participation for the round (pg. 7); when every seat has passed the
 * round closes. RR1 models two action spaces (take-2-coins and the never-occupied bottom track space);
 * the full action board — the rest of the track spaces with a chosen route, locomotives, industry,
 * doublers, engineers, the turn-order track — lands one slice at a time.
 */
export type Action =
  | {
      readonly type: 'PLACE';
      /** The action-space id to place on (pg. 7). */
      readonly space: string;
      /**
       * How many of the required workers to pay with **coins** instead (pg. 14: coins substitute for
       * workers, and can be combined with them). 0 or absent ⇒ all workers. Must be ≤ the space's
       * requirement, and the seat must hold that many coins.
       */
      readonly coins?: number;
    }
  | { readonly type: 'PASS' };

export type ActionType = Action['type'];
