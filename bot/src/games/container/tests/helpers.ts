import { ACTIONS_PER_TURN, SCORING_CARDS, STARTING_MONEY, createGame, viewFor } from '@game-hub/engine/container';
import type {
  BankState,
  Color,
  GameState,
  GameView,
  PlayerState,
  StoredContainer,
  Supply,
} from '@game-hub/engine/container';
import { contextFor } from '../context';
import type { Ctx } from '../types';

/** Shorthand for a stored container ({ color, price }). */
export const sc = (color: Color, price: number): StoredContainer => ({ color, price });

export function makeSupply(overrides: Partial<Supply> = {}): Supply {
  return {
    containers: { white: 10, red: 10, green: 10, blue: 10, yellow: 10 },
    factories: { white: 2, red: 2, green: 2, blue: 2, yellow: 2 },
    warehouses: 10,
    ...overrides,
  };
}

export function makeBank(overrides: Partial<BankState> = {}): BankState {
  return {
    cashLots: [1, 2, 3],
    containerLots: [['white', 'red'], ['green'], []],
    tokens: 1,
    auctions: [],
    ...overrides,
  };
}

export function makePlayer(overrides: Partial<PlayerState> & Pick<PlayerState, 'id'>): PlayerState {
  return {
    name: overrides.id,
    money: STARTING_MONEY,
    factories: [{ id: `${overrides.id}-f1`, color: 'white' }],
    factoryStore: [],
    factoryLimit: 2,
    harborStore: [],
    warehouses: 1,
    harborLimit: 1,
    ship: { location: { kind: 'ocean' }, cargo: [] },
    scoringArea: [],
    scoringCard: SCORING_CARDS[0]!,
    loans: 0,
    holdingArea: [],
    ...overrides,
  };
}

// The cast bridges the end-state discriminated union: the base is the active arm (no `results`/
// `winnerIds`), and a fixture builder fabricates an arbitrary position — spreading `Partial<GameState>`
// over the base can't be proven to land on a single arm.
export function makeGame(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'g1',
    players,
    activePlayerIndex: 0,
    actionsRemaining: ACTIONS_PER_TURN,
    turn: 1,
    supply: makeSupply(),
    bank: makeBank(),
    status: 'active',
    version: 0,
    log: [],
    ...overrides,
  } as GameState;
}

/** A fresh N-player game via createGame (deterministic — createGame takes no randomness). */
export function newGame(playerCount = 3): GameState {
  return createGame({
    id: 'g1',
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i + 1}` })),
  });
}

/** The view a seat legitimately has — what every bot entry point expects. */
export const viewOf = (state: GameState, playerId: string): GameView => viewFor(state, playerId);

/** Build the policy context for a seat, the same way `decide` does. */
export const ctxFor = (state: GameState, playerId: string): Ctx => contextFor(viewFor(state, playerId), playerId);
