import { describe, expect, it } from 'vitest';
import { legalActions } from '../index';
import type { Color, GameState } from '../index';
import { makeGame, makePlayer, newGame, sc } from './helpers';

const types = (state: GameState) => legalActions(state).map((a) => a.type);

describe('legalActions', () => {
  it('offers the full menu at the start of a turn', () => {
    const actions = legalActions(newGame(3));
    expect(actions).toContainEqual({ type: 'END_TURN' });
    expect(actions).toContainEqual({ type: 'PRODUCE' });
    expect(actions).toContainEqual({ type: 'BUILD_WAREHOUSE' });
    expect(actions).toContainEqual({ type: 'REPRICE', district: 'factory' }); // starting container present
    expect(actions).not.toContainEqual({ type: 'REPRICE', district: 'harbor' }); // harbor empty
    const buildColors = actions.filter((a) => a.type === 'BUILD_FACTORY').map((a) => (a as { color: Color }).color);
    expect(buildColors.sort()).toEqual(['blue', 'green', 'red', 'yellow']);
    // From the ocean: sail to each opponent's harbor + the two central boards.
    expect(actions).toContainEqual({ type: 'SAIL', to: { kind: 'harbor', playerId: 'p2' } });
    expect(actions).toContainEqual({ type: 'SAIL', to: { kind: 'island' } });
    expect(actions).toContainEqual({ type: 'SAIL', to: { kind: 'bank' } });
    expect(actions).not.toContainEqual({ type: 'SAIL', to: { kind: 'harbor', playerId: 'p1' } }); // never own harbor
  });

  it('offers a harbor reprice when the harbor has containers', () => {
    const p1 = makePlayer({ id: 'p1', harborStore: [sc('blue', 3)], harborLimit: 3 });
    expect(legalActions(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]))).toContainEqual({
      type: 'REPRICE',
      district: 'harbor',
    });
  });

  it('offers only END_TURN when no actions remain', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: [sc('white', 2)] }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { actionsRemaining: 0 });
    expect(types(state)).toEqual(['END_TURN']);
  });

  it('offers no produce/build for a broke player, but sailing is still free', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 0 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    const actions = types(state);
    expect(actions).not.toContain('PRODUCE');
    expect(actions).not.toContain('BUILD_FACTORY');
    expect(actions).not.toContain('BUILD_WAREHOUSE');
    expect(actions).toContain('SAIL'); // sailing costs an action, not money
  });

  it('offers a single sail-to-ocean option when docked at a harbor', () => {
    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'harbor', playerId: 'p2' }, cargo: [] } });
    const sails = legalActions(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })])).filter(
      (a) => a.type === 'SAIL',
    );
    expect(sails).toEqual([{ type: 'SAIL', to: { kind: 'ocean' } }]);
  });

  it('omits PRODUCE when the factory district is full', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: [sc('white', 2), sc('white', 3)], factoryLimit: 2 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(types(state)).not.toContain('PRODUCE');
  });

  it('omits factory options at the factory limit but still allows produce/warehouse', () => {
    const p1 = makePlayer({
      id: 'p1',
      money: 100,
      factories: [
        { id: 'p1-f1', color: 'white' },
        { id: 'p1-f2', color: 'red' },
        { id: 'p1-f3', color: 'green' },
        { id: 'p1-f4', color: 'blue' },
      ],
      factoryLimit: 8,
    });
    const actions = types(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]));
    expect(actions).not.toContain('BUILD_FACTORY');
    expect(actions).toContain('PRODUCE');
    expect(actions).toContain('BUILD_WAREHOUSE');
  });

  it('offers no PRODUCE or BUILD_FACTORY for a factory-less player', () => {
    const state = makeGame([makePlayer({ id: 'p1', factories: [], money: 100 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    const actions = types(state);
    expect(actions).not.toContain('PRODUCE');
    expect(actions).not.toContain('BUILD_FACTORY');
    expect(actions).toContain('BUILD_WAREHOUSE');
  });

  it('omits BUILD_WAREHOUSE at the warehouse limit', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 100, warehouses: 5, harborLimit: 5 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(types(state)).not.toContain('BUILD_WAREHOUSE');
  });

  it('omits builds when supply is exhausted', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 100 }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], {
      supply: { factories: { white: 0, red: 0, green: 0, blue: 0, yellow: 0 }, warehouses: 0 },
    });
    const actions = types(state);
    expect(actions).not.toContain('BUILD_FACTORY');
    expect(actions).not.toContain('BUILD_WAREHOUSE');
    expect(actions).toContain('PRODUCE');
  });
});
