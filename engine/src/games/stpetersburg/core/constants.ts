// Rulebook-sourced constants for Saint Petersburg (reference_materials/StPetersburg2009_Rules.pdf,
// 2009 Rio Grande printing). This is the bootstrap scaffold (roadmap SP0); the mechanics land one
// slice at a time. Read the cited page before touching a value — do not encode rules from memory.

import type { CardDef, CardKind, Phase } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** Each player starts with 25 rubles (pg. 2, setup). */
export const STARTING_RUBLES = 25;

/** The four phases, in play order (pg. 2). Also the card-group / draw-stack names. */
export const PHASES: readonly Phase[] = ['worker', 'building', 'aristocrat', 'trading'];

/** The card groups, in board order (pg. 1). */
export const CARD_KINDS: readonly CardKind[] = ['worker', 'building', 'aristocrat', 'trading'];

/**
 * How many worker cards the administrator seeds the upper row with at setup, by player count (pg. 2 +
 * the "2 or 3 players" note, pg. 8): **8 at four players, 6 at three, 4 at two**. Every *later* refill is
 * always to 8 regardless of count — only this initial worker deal differs.
 */
export const WORKER_ROW_SEED: Readonly<Record<number, number>> = { 2: 4, 3: 6, 4: 8 };

/** The board always fills to 8 cards across both rows after a phase (pg. 4, "always 8!"). */
export const BOARD_SIZE = 8;

/** A card must always cost at least 1 ruble, even after reductions (pg. 6). */
export const MIN_CARD_COST = 1;

/** Aristocrat final-scoring table, indexed by count of *distinct* aristocrats (pg. 5–6). */
export const ARISTOCRAT_SCORE: readonly number[] = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55];

/**
 * The deck (pg. 1 contents: **31 workers / 28 buildings / 27 aristocrats / 30 trading = 116 game cards**),
 * encoded from the rulebook. Costs are the upper-left number (pg. 3); the coin is `income`, the shield is
 * `points` (pg. 9). Every value here was read off the rulebook art at high resolution.
 *
 * Note: pg. 1's "120 cards" headline is 116 game cards **plus the 4 starting-player cards** (one per
 * phase colour). We model those four as `startingPlayers` seat markers (pg. 2), not as deck cards — so
 * this array is 116 entries by design (asserted in `deck.test.ts`).
 *
 * ## Faithful adaptation (the same discipline as Stone Age's BUILDING_DECK)
 *
 * The rulebook fully enumerates the workers, base buildings, aristocrats, and the ten green **worker**
 * trading cards (pg. 1 + pg. 7–8 with printed costs). It does **not** individually enumerate the ten
 * **building** trading cards or the ten **aristocrat** trading cards — it shows only exemplars
 * (Mariinskij Theater, Tax man, Abbot). The remaining building/aristocrat trading cards below are a
 * documented adaptation: the right *count* (10 each, one copy each — pg. 7) and colour group, with a
 * plausible cost/reward spread in the printed style. Their exact values are refined when the trading
 * mechanic lands (SP4); SP0 only reads names, kinds, and totals. Flagged inline with `ADAPTED`.
 */
export const CARD_DEFS: readonly CardDef[] = [
  // ── Workers (green): 31. All pay income 3 (pg. 1 coin). Costs 3–8; the five basic each ×6 carry a
  //    ware symbol pairing them with a green trading upgrade (pg. 7). Czar-the-carpenter is the ×1 odd
  //    one (Zar und Zimmermann, cost 8 — "can be displaced by any green", pg. 8).
  { key: 'lumberjack', kind: 'worker', name: 'Lumberjack', cost: 3, income: 3, points: 0, count: 6, ware: 'lumber' },
  { key: 'goldMiner', kind: 'worker', name: 'Gold Miner', cost: 4, income: 3, points: 0, count: 6, ware: 'gold' },
  { key: 'shepherd', kind: 'worker', name: 'Shepherd', cost: 5, income: 3, points: 0, count: 6, ware: 'wool' },
  { key: 'furTrapper', kind: 'worker', name: 'Fur Trapper', cost: 6, income: 3, points: 0, count: 6, ware: 'fur' },
  { key: 'shipBuilder', kind: 'worker', name: 'Ship Builder', cost: 7, income: 3, points: 0, count: 6, ware: 'ship' },
  { key: 'czarCarpenter', kind: 'worker', name: 'Czar the Carpenter', cost: 8, income: 3, points: 0, count: 1 },

  // ── Buildings (blue): 28. Pay victory points, not money (pg. 1 shield). Seven standard (22 copies) +
  //    four specials (6 copies). Costs/points read off pg. 1.
  { key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1, count: 5 },
  { key: 'customsHouse', kind: 'building', name: 'Customs House', cost: 8, income: 0, points: 2, count: 5 },
  { key: 'fireStation', kind: 'building', name: 'Fire Station', cost: 11, income: 0, points: 3, count: 3 },
  { key: 'hospital', kind: 'building', name: 'Hospital', cost: 14, income: 0, points: 4, count: 3 },
  { key: 'library', kind: 'building', name: 'Library', cost: 17, income: 0, points: 5, count: 3 },
  { key: 'theater', kind: 'building', name: 'Theater', cost: 20, income: 0, points: 6, count: 2 },
  { key: 'academy', kind: 'building', name: 'Academy', cost: 23, income: 0, points: 7, count: 1 },
  // Specials (pg. 7–8). Potemkin's Village: pays 2 on buy, worth 6 when displaced (SP5). Pub: buy up to
  // 5 points at 2 rubles each after building scoring. Warehouse: hand limit 4. Observatory: 1 point, or
  // skip it to draw the top of a stack.
  { key: 'potemkin', kind: 'building', name: "Potemkin's Village", cost: 2, income: 0, points: 0, count: 1, special: 'potemkin' },
  { key: 'pub', kind: 'building', name: 'Pub', cost: 1, income: 0, points: 0, count: 2, special: 'pub' },
  { key: 'warehouse', kind: 'building', name: 'Warehouse', cost: 2, income: 0, points: 0, count: 1, special: 'warehouse' },
  { key: 'observatory', kind: 'building', name: 'Observatory', cost: 6, income: 0, points: 1, count: 2, special: 'observatory' },

  // ── Aristocrats (orange): 27. Pay a mix of income + points (pg. 1). Costs 4–18.
  { key: 'scribe', kind: 'aristocrat', name: 'Scribe', cost: 4, income: 1, points: 0, count: 6 },
  { key: 'administrator', kind: 'aristocrat', name: 'Administrator', cost: 7, income: 2, points: 0, count: 5 },
  { key: 'clerk', kind: 'aristocrat', name: 'Clerk', cost: 10, income: 3, points: 0, count: 5 },
  { key: 'secretary', kind: 'aristocrat', name: 'Secretary', cost: 12, income: 4, points: 0, count: 4 },
  { key: 'controller', kind: 'aristocrat', name: 'Controller', cost: 14, income: 4, points: 1, count: 3 },
  { key: 'judge', kind: 'aristocrat', name: 'Judge', cost: 16, income: 5, points: 2, count: 2 },
  { key: 'governess', kind: 'aristocrat', name: 'Governess', cost: 18, income: 6, points: 3, count: 2 },

  // ── Worker trading cards (green): 10, one ware each, pairing with a basic worker (pg. 7–8). Printed
  //    costs 4/6/8/10/12; counts 1/1/2/3/3. Carpenter workshop & gold smelter keep income 3 and add a
  //    cost-reduction (SP5); weaving mill & wharf raise income to 6; fur shop adds 2 points to income 3.
  { key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4, income: 3, points: 0, count: 1, ware: 'lumber', tradingGroup: 'worker' },
  { key: 'goldSmelter', kind: 'trading', name: 'Gold Smelter', cost: 6, income: 3, points: 0, count: 1, ware: 'gold', tradingGroup: 'worker' },
  { key: 'weavingMill', kind: 'trading', name: 'Weaving Mill', cost: 8, income: 6, points: 0, count: 2, ware: 'wool', tradingGroup: 'worker' },
  { key: 'furShop', kind: 'trading', name: 'Fur Shop', cost: 10, income: 3, points: 2, count: 3, ware: 'fur', tradingGroup: 'worker' },
  { key: 'wharf', kind: 'trading', name: 'Wharf', cost: 12, income: 6, points: 1, count: 3, ware: 'ship', tradingGroup: 'worker' },

  // ── Building trading cards (blue): 10, one copy each (pg. 7). Only Mariinskij Theater is enumerated
  //    by the rulebook (cost 10; +1 ruble per aristocrat at building scoring — SP5). The other nine are
  //    ADAPTED (famous St Petersburg buildings; documented cost/point spread in the printed style).
  { key: 'mariinskij', kind: 'trading', name: 'Mariinskij Theater', cost: 10, income: 0, points: 0, count: 1, tradingGroup: 'building', special: 'mariinskij' },
  { key: 'nikolaiChurch', kind: 'trading', name: 'St Nicholas Church', cost: 6, income: 0, points: 2, count: 1, tradingGroup: 'building' }, // ADAPTED
  { key: 'peterAndPaul', kind: 'trading', name: 'Peter and Paul Fortress', cost: 9, income: 0, points: 3, count: 1, tradingGroup: 'building' }, // ADAPTED
  { key: 'kunstkamera', kind: 'trading', name: 'Kunstkamera', cost: 12, income: 0, points: 4, count: 1, tradingGroup: 'building' }, // ADAPTED
  { key: 'stIsaac', kind: 'trading', name: "St Isaac's Cathedral", cost: 15, income: 0, points: 5, count: 1, tradingGroup: 'building' }, // ADAPTED
  { key: 'admiralty', kind: 'trading', name: 'Admiralty', cost: 18, income: 0, points: 6, count: 1, tradingGroup: 'building' }, // ADAPTED
  { key: 'hermitage', kind: 'trading', name: 'Hermitage', cost: 21, income: 0, points: 7, count: 1, tradingGroup: 'building' }, // ADAPTED
  { key: 'summerPalace', kind: 'trading', name: 'Summer Palace', cost: 24, income: 0, points: 8, count: 1, tradingGroup: 'building' }, // ADAPTED
  { key: 'winterPalace', kind: 'trading', name: 'Winter Palace', cost: 27, income: 0, points: 9, count: 1, tradingGroup: 'building' }, // ADAPTED
  { key: 'resurrectionChurch', kind: 'trading', name: 'Church of the Resurrection', cost: 29, income: 0, points: 10, count: 1, tradingGroup: 'building' }, // ADAPTED

  // ── Aristocrat trading cards (orange): 10, one copy each (pg. 7). Enumerated exemplars: Abbot (pg. 1
  //    — cost 6, income 1, point 1) and Tax man (pg. 8 — cost 17; +1 ruble per worker at aristocrat
  //    scoring, SP5). The other eight are ADAPTED (a documented income+point spread in the printed style).
  { key: 'abbot', kind: 'trading', name: 'Abbot', cost: 6, income: 1, points: 1, count: 1, tradingGroup: 'aristocrat' },
  { key: 'taxman', kind: 'trading', name: 'Tax Man', cost: 17, income: 0, points: 0, count: 1, tradingGroup: 'aristocrat', special: 'taxman' },
  { key: 'senator', kind: 'trading', name: 'Senator', cost: 8, income: 2, points: 1, count: 1, tradingGroup: 'aristocrat' }, // ADAPTED
  { key: 'shipBuilderMaster', kind: 'trading', name: 'Master Ship Builder', cost: 10, income: 2, points: 2, count: 1, tradingGroup: 'aristocrat' }, // ADAPTED
  { key: 'mintMaster', kind: 'trading', name: 'Master of the Mint', cost: 12, income: 4, points: 1, count: 1, tradingGroup: 'aristocrat' }, // ADAPTED
  { key: 'generalGovernor', kind: 'trading', name: 'Governor-General', cost: 14, income: 3, points: 3, count: 1, tradingGroup: 'aristocrat' }, // ADAPTED
  { key: 'chancellor', kind: 'trading', name: 'Chancellor', cost: 16, income: 5, points: 2, count: 1, tradingGroup: 'aristocrat' }, // ADAPTED
  { key: 'admiral', kind: 'trading', name: 'Admiral', cost: 18, income: 4, points: 4, count: 1, tradingGroup: 'aristocrat' }, // ADAPTED
  { key: 'fieldMarshal', kind: 'trading', name: 'Field Marshal', cost: 20, income: 6, points: 3, count: 1, tradingGroup: 'aristocrat' }, // ADAPTED
  { key: 'metropolitan', kind: 'trading', name: 'Metropolitan', cost: 22, income: 5, points: 5, count: 1, tradingGroup: 'aristocrat' }, // ADAPTED
];

/** Total copies of a given group in the deck (sum of `count`). Used by setup + the totals test. */
export const deckCount = (kind: CardKind): number =>
  CARD_DEFS.filter((def) => def.kind === kind).reduce((sum, def) => sum + def.count, 0);
