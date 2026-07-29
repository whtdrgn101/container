import { KERNEL_CONTRACT_VERSION } from '@game-hub/kernel';
import { describe, expect, it } from 'vitest';
import { containerModule, createDefaultRegistry, GameRegistry } from '../games';
import type { GameModule } from '../games';

/** A minimal module — enough to register, not a game. */
const stub = (id: string, overrides: Partial<GameModule<unknown, unknown>> = {}): GameModule<unknown, unknown> => ({
  id,
  name: id,
  minPlayers: 2,
  maxPlayers: 4,
  colors: [],
  createGame: () => ({}),
  applyAction: (state) => state,
  legalActions: () => [],
  viewFor: (state) => state,
  parseAction: (raw) => ({ ok: true, action: raw }),
  summarize: () => ({ id, turn: 1, status: 'active', activePlayerId: null, players: [] }),
  versionOf: () => 0,
  movesOf: () => [],
  mapError: () => null,
  ...overrides,
});

describe('GameRegistry', () => {
  it('registers and looks a game up by id', () => {
    const registry = new GameRegistry().register(stub('chess'));
    expect(registry.get('chess')?.name).toBe('chess');
    expect(registry.require('chess').id).toBe('chess');
  });

  it('returns undefined for an unregistered id', () => {
    expect(new GameRegistry().get('nope')).toBeUndefined();
  });

  it('throws from require() for an unregistered id', () => {
    expect(() => new GameRegistry().require('nope')).toThrow(/No game module registered/);
  });

  // A duplicate id means two games would fight over the same rows once C1 keys on it. Overwriting
  // silently would make that a data-corruption bug instead of a boot crash.
  it('refuses a duplicate id rather than overwriting', () => {
    const registry = new GameRegistry().register(stub('chess'));
    expect(() => registry.register(stub('chess'))).toThrow(/already registered/);
  });

  it('refuses a module whose seat range is inverted', () => {
    expect(() => new GameRegistry().register(stub('bad', { minPlayers: 5, maxPlayers: 3 }))).toThrow(
      /minPlayers > maxPlayers/,
    );
  });

  // The kernel-contract check (Track D design doc §4, slice D2a). Registration is where the host and
  // the game's declared contract meet, so a game built against an incompatible kernel major must crash
  // the boot here rather than fail unrecognisably mid-game.
  it('accepts a game declaring the contract this host provides', () => {
    const registry = new GameRegistry().register(stub('chess', { kernelContract: KERNEL_CONTRACT_VERSION }));
    expect(registry.get('chess')).toBeDefined();
  });

  it('refuses a game built against a newer kernel contract', () => {
    expect(() => new GameRegistry().register(stub('future', { kernelContract: KERNEL_CONTRACT_VERSION + 1 }))).toThrow(
      /built against kernel contract 2, but this host provides contract 1/,
    );
  });

  it('refuses a game built against an older kernel contract', () => {
    expect(() => new GameRegistry().register(stub('ancient', { kernelContract: 0 }))).toThrow(
      /built against kernel contract 0/,
    );
  });

  // The transition default: every game predates the field, so an undeclared contract means 1 rather
  // than a flag day. ⚠️ When a contract 2 lands, this default becomes a lie — see registry.ts.
  it('treats a game that declares no contract as contract 1', () => {
    const registry = new GameRegistry().register(stub('legacy'));
    expect(registry.get('legacy')).toBeDefined();
  });

  it('every hosted game declares the contract, so the default is never actually relied on', () => {
    const registry = createDefaultRegistry();
    const declared = registry.list().map(({ id }) => [id, registry.require(id).kernelContract] as const);
    expect(declared).toEqual(declared.map(([id]) => [id, KERNEL_CONTRACT_VERSION]));
  });

  it('lists games for the picker, in registration order', () => {
    const registry = new GameRegistry().register(stub('chess')).register(stub('go'));
    expect(registry.list()).toEqual([
      { id: 'chess', name: 'chess', minPlayers: 2, maxPlayers: 4, colors: [] },
      { id: 'go', name: 'go', minPlayers: 2, maxPlayers: 4, colors: [] },
    ]);
  });

  it('registration is chainable', () => {
    const registry = new GameRegistry();
    expect(registry.register(stub('chess'))).toBe(registry);
  });
});

describe('the default registry', () => {
  it('hosts Container', () => {
    expect(createDefaultRegistry().require('container').name).toBe('Container');
  });

  // A shared singleton would leak state between the backend tests, which each build their own app
  // against their own in-memory database.
  it('is a fresh instance per call', () => {
    expect(createDefaultRegistry()).not.toBe(createDefaultRegistry());
  });
});

describe('the Container module contract', () => {
  it('declares its seat range from the engine, not a duplicated constant', () => {
    expect(containerModule.minPlayers).toBe(3);
    expect(containerModule.maxPlayers).toBe(5);
  });

  // The point of injecting `rng`: the module must stay deterministic and replayable. A module that
  // reached for Math.random would make this test flap.
  it('deals from the injected rng, so the same rng deals the same game', () => {
    const players = [{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }];
    const cardsOf = (rng: () => number) =>
      containerModule.createGame({ id: 'g1', players, rng }).players.map((p) => p.scoringCard.id);
    expect(cardsOf(seeded(0.42))).toEqual(cardsOf(seeded(0.42)));
  });

  it('deals a different game from a different rng', () => {
    const players = [{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }];
    const cardsOf = (rng: () => number) =>
      containerModule.createGame({ id: 'g1', players, rng }).players.map((p) => p.scoringCard.id);
    expect(cardsOf(seeded(0.42))).not.toEqual(cardsOf(seeded(0.99)));
  });

  it('summarizes without leaking a scoring card', () => {
    const state = containerModule.createGame({
      id: 'g1',
      players: [{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }],
      rng: seeded(0.42),
    });
    const summary = containerModule.summarize(state);
    expect(summary).toEqual({
      id: 'g1',
      turn: 1,
      status: 'active',
      activePlayerId: 'p1',
      players: [
        { id: 'p1', name: 'Ann' },
        { id: 'p2', name: 'Bo' },
        { id: 'p3', name: 'Cy' },
      ],
    });
    // Belt and braces: the whole payload, serialized, must not mention a card.
    expect(JSON.stringify(summary)).not.toMatch(/scoringCard/);
  });

  it('maps an engine error onto a status, and disowns everything else', () => {
    expect(containerModule.mapError(new Error('not mine'))).toBeNull();
    expect(containerModule.mapError('not even an error')).toBeNull();
  });
});

/** A tiny deterministic stand-in for `Math.random`, so a deal can be asserted on. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}
