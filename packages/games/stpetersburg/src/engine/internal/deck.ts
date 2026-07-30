import { shuffle } from '@game-hub/kernel';
import { CARD_DEFS, PHASES } from '../core';
import type { Card, CardDef, CardKind, Phase } from '../core';

/** Mint one card instance from a definition (the `i`-th copy), copying only the fields it actually has. */
function cardFromDef(def: CardDef, i: number): Card {
  return {
    id: `${def.key}-${i}`,
    key: def.key,
    kind: def.kind,
    name: def.name,
    cost: def.cost,
    income: def.income,
    points: def.points,
    // Conditional spread rather than `ware: def.ware` so an absent field stays absent (not `undefined`).
    ...(def.ware ? { ware: def.ware } : {}),
    ...(def.tradingGroup ? { tradingGroup: def.tradingGroup } : {}),
    ...(def.special ? { special: def.special } : {}),
  };
}

/** Every card instance of one group — `count` copies of each definition of that kind. */
export function mintStack(kind: CardKind): Card[] {
  const cards: Card[] = [];
  for (const def of CARD_DEFS) {
    if (def.kind !== kind) continue;
    for (let i = 1; i <= def.count; i += 1) cards.push(cardFromDef(def, i));
  }
  return cards;
}

/**
 * Fisher–Yates on the injected `rng` — this game's copy was the third of four in the repo, so it moved
 * to the kernel's `.` barrel in 1.2.0 (identical algorithm and identical `rng?` semantics: without an
 * `rng` the order is kept, deterministic for tests). Re-exported here because each of the four stacks
 * is shuffled **separately** (pg. 2, setup) and this file is where the dealers live.
 */
export { shuffle };

/**
 * Deal the four starting-player markers to seats (pg. 2): one marker per phase, so `startingPlayers[phase]`
 * is the seat that opens that phase. Distribution by player count — **4p: 1 each; 3p: one seat gets 2;
 * 2p: 2 each** (4 markers ÷ `count`, remainder handed out one per seat). With `rng`, which seat gets an
 * extra and which phase each marker opens are both random; without it the deal is deterministic (extras
 * to the lowest seats, markers in phase order) for tests.
 */
export function dealMarkers(count: number, rng?: () => number): Record<Phase, number> {
  const markers = PHASES.length; // 4 markers, one per phase
  const base = Math.floor(markers / count);
  const remainder = markers % count;

  const perSeat = Array.from({ length: count }, () => base);
  // The leftover markers go to `remainder` distinct seats (3-player game: one seat, the "youngest").
  const seatOrder = shuffle(
    Array.from({ length: count }, (_, seat) => seat),
    rng,
  );
  for (let i = 0; i < remainder; i += 1) {
    const seat = seatOrder[i]!;
    perSeat[seat] = perSeat[seat]! + 1;
  }

  // Expand to one recipient per marker, then shuffle so which phase a seat opens is random.
  const recipients: number[] = [];
  for (let seat = 0; seat < count; seat += 1) {
    for (let n = 0; n < perSeat[seat]!; n += 1) recipients.push(seat);
  }
  const order = shuffle(recipients, rng);

  const startingPlayers = {} as Record<Phase, number>;
  PHASES.forEach((phase, i) => {
    startingPlayers[phase] = order[i]!;
  });
  return startingPlayers;
}
