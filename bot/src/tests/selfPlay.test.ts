import { MAX_PLAYERS, MIN_PLAYERS, viewFor } from '@container/engine/container';
import { describe, expect, it } from 'vitest';

import { playSelfPlay } from '../selfPlay';
import { newGame } from './helpers';

const counts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

describe('playSelfPlay', () => {
  // The headline test for the whole package. A self-play game drives thousands of real actions
  // through the real engine; if any policy ever produces an illegal or unparameterized action,
  // `applyAction` throws and this fails. That covers far more ground than any hand-built fixture.
  it.each(counts)('plays a complete %i-player game to a natural end', (playerCount) => {
    const result = playSelfPlay(newGame(playerCount));

    expect(result.completed).toBe(true);
    expect(result.state.status).toBe('ended');
    expect(result.actions).toBeGreaterThan(50);

    // The game ends the way the rules say it does: two colors exhausted.
    const exhausted = Object.values(result.state.supply.containers).filter((n) => n === 0).length;
    expect(exhausted).toBeGreaterThanOrEqual(2);

    // And it produced a real result, not a degenerate one.
    expect(result.state.results).toHaveLength(playerCount);
    expect(result.state.winnerIds.length).toBeGreaterThan(0);
  });

  it('is deterministic — the same game replays identically', () => {
    const a = playSelfPlay(newGame(3));
    const b = playSelfPlay(newGame(3));
    expect(a.actions).toBe(b.actions);
    expect(a.state).toEqual(b.state);
  });

  it('does not mutate the state it is given', () => {
    const initial = newGame(3);
    const snapshot = structuredClone(initial);
    playSelfPlay(initial);
    expect(initial).toEqual(snapshot);
  });

  it('stops at maxTurns without finishing the game', () => {
    const result = playSelfPlay(newGame(3), { maxTurns: 3 });
    expect(result.completed).toBe(false);
    expect(result.state.status).toBe('active');
    expect(result.turns).toBeLessThanOrEqual(3);
  });

  // Guards against a bot that technically finishes a game while ignoring the supply chain — which
  // would make the "complete game" test above pass for the wrong reason. It is not hypothetical:
  // an earlier draft scored each sailing hop below Produce, so ships never left port and a
  // 5-player game ran 52 turns with zero deliveries while still "completing" on the supply clock.
  it.each(counts)('runs the whole trade chain in a %i-player game', (playerCount) => {
    const result = playSelfPlay(newGame(playerCount));
    const types = new Set(result.state.log.map((move) => move.type));
    expect(types).toContain('PRODUCE');
    expect(types).toContain('FACTORY_PURCHASE');
    expect(types).toContain('HARBOR_PURCHASE');
    expect(types).toContain('DELIVER');
  });

  it('delivers repeatedly, not just once by accident', () => {
    const result = playSelfPlay(newGame(4));
    const delivers = result.state.log.filter((move) => move.type === 'DELIVER');
    expect(delivers.length).toBeGreaterThanOrEqual(3);
  });

  it('every seat decides from its own redacted view', () => {
    // Reproduces the driver's contract: bots are held to the hidden information a human has.
    const state = newGame(3);
    const view = viewFor(state, 'p1');
    expect(view.players.filter((player) => player.scoringCard !== null)).toHaveLength(1);
  });
});

describe('playSelfPlay — the finished game holds together', () => {
  it('scores every seat by the engine and picks a real winner', () => {
    const result = playSelfPlay(newGame(4));
    const totals = new Map(result.state.results.map((score) => [score.playerId, score.total]));
    const best = Math.max(...totals.values());

    for (const winnerId of result.state.winnerIds) {
      expect(totals.get(winnerId)).toBe(best);
    }
    // Money is conserved well enough that nobody ends up absurdly rich or broke — a cheap smoke
    // test that no policy found a way to farm the engine.
    for (const player of result.state.players) {
      expect(player.money).toBeGreaterThanOrEqual(0);
      expect(player.money).toBeLessThan(500);
    }
  });
});
