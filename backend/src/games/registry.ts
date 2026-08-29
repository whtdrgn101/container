import { KERNEL_CONTRACT_VERSION } from '@game-hub/kernel';
import type { TableOptionSpec } from '@game-hub/kernel';
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
  /** The game's player-colour palette (ordered colour ids), so the lobby can offer the pick. */
  readonly colors: readonly string[];
  /** The AI difficulty tiers this game offers (CS4), or absent if it has just one. Drives the picker. */
  readonly botDifficulties?: readonly string[];
  /**
   * The rule variants this game lets a table pick before the deal (kernel 1.5.0), or absent if its
   * rules are fixed. Published here for exactly the reason `botDifficulties` is: the setup form is
   * generic, so the only way it can render a game's options is to be told what they are.
   */
  readonly tableOptions?: readonly TableOptionSpec[];
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
    // The kernel-contract check (Track D design doc §4, slice D2a). Registration is the one moment the
    // host holds both numbers — the game's declared contract and its own — so a game built against an
    // incompatible kernel major boot-crashes here rather than failing somewhere unrecognisable mid-game
    // (a missing hook, a member that changed meaning). Absent ⇒ 1 for the transition: every game
    // predates the field. ⚠️ When a contract 2 lands, that default becomes a lie — make the declaration
    // required then.
    const declared = module.kernelContract ?? KERNEL_CONTRACT_VERSION;
    if (declared !== KERNEL_CONTRACT_VERSION) {
      throw new Error(
        `Game "${module.id}" was built against kernel contract ${declared}, but this host provides ` +
          `contract ${KERNEL_CONTRACT_VERSION}. Upgrade the game to @game-hub/kernel@${KERNEL_CONTRACT_VERSION}.x ` +
          `(or the host to the game's kernel major).`,
      );
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
    return [...this.modules.values()].map(
      ({ id, name, minPlayers, maxPlayers, colors, botDifficulties, tableOptions }) => ({
        id,
        name,
        minPlayers,
        maxPlayers,
        colors,
        // Only surface the field when a game declares tiers, so a game without them stays exactly as it
        // was on the wire (no `botDifficulties` key) and the UI shows no dead picker.
        ...(botDifficulties ? { botDifficulties } : {}),
        // Same rule for table options (kernel 1.5.0): a game with fixed rules puts no key on the wire,
        // so the setup form renders no empty "Table options" section for the seven games that predate it.
        ...(tableOptions ? { tableOptions } : {}),
      }),
    );
  }
}
