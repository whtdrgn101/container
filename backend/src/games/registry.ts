import type { GameModule } from './module';

/**
 * A registered module with its state and action types erased.
 *
 * The registry is heterogeneous by nature: only a module itself may pair its own `S` with its own
 * `A`. `unknown` (rather than `any`) keeps that honest — a caller holding an `AnyGameModule` can
 * shuttle a state from `get`/`createGame` back into `applyAction`, but it can't *read* the state, so
 * nothing outside a module can quietly grow a dependency on one game's shape.
 *
 * This relies on TypeScript comparing **methods** bivariantly, which is what lets
 * `GameModule<GameState, Action>` be stored as `GameModule<unknown, unknown>`. That is a real hole
 * (the core could hand module X a state that came from module Y), and it is closed by routing: the
 * `game_type` on the row picks the module, so a state only ever reaches the module that made it.
 * Declare `GameModule`'s operations as methods, not arrow-function properties, or this breaks.
 */
export type AnyGameModule = GameModule<unknown, unknown>;

/** What the game picker needs to know about a game without loading it (roadmap C2). */
export interface GameInfo {
  readonly id: string;
  readonly name: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

/**
 * The set of games this site can host (roadmap C0). Container registers into it at startup; a second
 * game is meant to be additive — implement `GameModule`, register, done.
 */
export class GameRegistry {
  private readonly modules = new Map<string, AnyGameModule>();

  /** Add a game. Ids are unique: a duplicate is a wiring bug, not something to silently overwrite. */
  register(module: AnyGameModule): this {
    if (this.modules.has(module.id)) {
      throw new Error(`A game module with id "${module.id}" is already registered`);
    }
    if (module.minPlayers > module.maxPlayers) {
      throw new Error(`Game "${module.id}" has minPlayers > maxPlayers`);
    }
    this.modules.set(module.id, module);
    return this;
  }

  get(id: string): AnyGameModule | undefined {
    return this.modules.get(id);
  }

  /** Like `get`, but for callers that cannot proceed without the module (an unknown `game_type`). */
  require(id: string): AnyGameModule {
    const module = this.get(id);
    if (!module) throw new Error(`No game module registered with id "${id}"`);
    return module;
  }

  /** Every registered game, for the picker. Registration order. */
  list(): GameInfo[] {
    return [...this.modules.values()].map(({ id, name, minPlayers, maxPlayers }) => ({
      id,
      name,
      minPlayers,
      maxPlayers,
    }));
  }
}
