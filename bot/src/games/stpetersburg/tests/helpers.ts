import { CARD_DEFS, createGame } from '@game-hub/engine/stpetersburg';
import type { Card, CardKind, PlayArea, PlayerView, StPetersburgState, StPetersburgView } from '@game-hub/engine/stpetersburg';

/** A deterministic pseudo-random generator (mulberry32) so a self-play game reproduces from its seed. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh Saint Petersburg game with the given seat count, its four stacks shuffled from `rng`. */
export function newGame(players: number, rng: () => number): StPetersburgState {
  const names = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  return createGame({ id: 'g1', players: names.map((name) => ({ name })), rng });
}

/** Mint a card instance from its printed definition (for hand-built unit-test scenarios). */
export function card(key: string, id = `${key}-1`): Card {
  const def = CARD_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`no card def for "${key}"`);
  return {
    id,
    key: def.key,
    kind: def.kind,
    name: def.name,
    cost: def.cost,
    income: def.income,
    points: def.points,
    ...(def.ware ? { ware: def.ware } : {}),
    ...(def.tradingGroup ? { tradingGroup: def.tradingGroup } : {}),
    ...(def.special ? { special: def.special } : {}),
  };
}

const EMPTY_PLAY_AREA: PlayArea = { worker: [], building: [], aristocrat: [] };

/** Build an own-seat `PlayerView` (rubles + hand visible), overriding only what a test cares about. */
export function player(over: Partial<PlayerView> = {}): PlayerView {
  return {
    id: 'p1',
    name: 'P1',
    rubles: 25,
    points: 0,
    playArea: EMPTY_PLAY_AREA,
    handCount: 0,
    hand: [],
    ...over,
  };
}

/** Build a minimal active `StPetersburgView` around a seat, overriding board/phase/interludes as needed. */
export function view(over: Partial<StPetersburgView> = {}): StPetersburgView {
  const seat = (over.players?.[0] as PlayerView | undefined) ?? player();
  const stacks: Record<CardKind, number> = { worker: 20, building: 20, aristocrat: 20, trading: 20 };
  return {
    id: 'g1',
    players: [seat],
    board: { upper: [], lower: [], stacks, discard: 0 },
    round: 1,
    phase: 'worker',
    startingPlayers: { worker: 0, building: 0, aristocrat: 0, trading: 0 },
    activePlayerIndex: 0,
    consecutivePasses: 0,
    finalRound: false,
    observatoryUsed: [],
    viewerId: seat.id,
    version: 0,
    log: [],
    status: 'active',
    ...over,
  } as StPetersburgView;
}
