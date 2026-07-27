import { applyAction, legalActions, MAX_PLAYERS, MIN_PLAYERS, viewFor } from '../engine';
import type { Action, GameState, Viewer } from '../engine';
import type { BotDriver, GameSummary } from '@game-hub/kernel';
import type { GameModule, ModuleContext } from './context';
import { AuctionRepository, auctionIsDue } from './auctions';
import { BotRunner } from './botRunner';
import { newContainerGame } from './createGame';
import { mapContainerError } from './errors';
import { parseContainerAction } from './parseAction';
import { pushAuction } from './push';
import { registerAuctionRoutes } from './routes';

/**
 * Container, as a `GameModule` (roadmap C0) — the first game registered on the site, and for now the
 * only one. Nothing here is new behaviour: it is the Container-specific code that used to sit in the
 * shared `app.ts`, gathered behind the one contract a second game would also implement.
 */
export const containerModule: GameModule<GameState, Action> = {
  id: 'container',
  name: 'Container',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  // The five hull tints the board already paints ships/mats with, in seat order (see the UI's
  // `seatColors.ts`). PLAYER colours — not the white/red/green/blue/yellow container cargo colours.
  colors: ['indigo', 'teal', 'rose', 'amber', 'violet'],

  createGame: (opts) => newContainerGame(opts),

  applyAction: (state, playerId, action) => applyAction(state, playerId, action),

  legalActions: (state, playerId) => legalActions(state, playerId),

  viewFor: (state, viewer) => viewFor(state, viewer as Viewer),

  parseAction: (raw) => parseContainerAction(raw),

  summarize: (state): GameSummary => ({
    id: state.id,
    turn: state.turn,
    status: state.status,
    activePlayerId: state.players[state.activePlayerIndex]?.id ?? null,
    players: state.players.map((player) => ({ id: player.id, name: player.name })),
  }),

  versionOf: (state) => state.version,

  // Everything the engine logs is public by construction: `viewFor` passes the log through untouched,
  // and the one real secret — a losing delivery bid — is deliberately never recorded.
  movesOf: (state) => state.log,

  mapError: (error) => mapContainerError(error),

  /**
   * A pending auction owns the DELIVER: its sealed bids live server-side and are revealed only once
   * everyone has committed. Letting a client post its own DELIVER through `/actions` would hand the
   * deliverer every opponent's bid before choosing whether to buy out — the exact leak A1a closes.
   */
  pendingStep: (state, action) =>
    action.type === 'DELIVER' && auctionIsDue(state)
      ? {
          status: 409,
          code: 'AUCTION_PENDING',
          message: 'Resolve the delivery auction via POST /games/:id/auction/resolve',
        }
      : null,

  routes: (app, ctx) => registerAuctionRoutes(app, ctx),

  /** After the core pushes new state, bring every client's view of the auction along with it. */
  onStateChanged: (state, ctx) => pushAuction(ctx, state),

  createBotDriver: (ctx: ModuleContext): BotDriver =>
    new BotRunner(
      // The one cast: `ModuleContext.games` is opaque by contract, and this is the boundary where we
      // know the state came from Container's own `createGame`.
      { get: (id) => ctx.games.get(id) as GameState | undefined, update: (state) => ctx.games.update(state) },
      ctx.botSeats,
      new AuctionRepository(ctx.db),
      (state) => ctx.pushGame(state.id, state),
    ),
};

// The package-contract entry point (Track D / D0): the generated registry imports each game's module
// as a default. Keeps the named export for the many callers that reference `containerModule` directly.
export default containerModule;
