/**
 * The bot **strength** bench driver — the one file in `src/` that does I/O (REVIEW.md Tier 5).
 *
 * Run it with `pnpm --filter @game-hub/bot bench` (or `pnpm bench` from the package). It plays every
 * game's built-in policy against **itself** (candidate === baseline) over N seeded games and prints the
 * win rate with a Wilson 95% CI. A self-bench should land near 50% — that is the sanity check that the
 * harness is fair and unbiased; the point of the tool is to swap in a *frozen* baseline (copy the policy
 * file, build a policy from it) and pass it as `baseline` when actually tuning, then commit only when the
 * candidate's CI lower bound clears 50%.
 *
 * **Never run by CI**: it is not a test file, so `vitest` (and thus `pnpm test:bot`) never touches it —
 * only the explicit `bench` script does. `BENCH_GAMES` / `BENCH_SEATS` tune the run (default 50 / 2).
 */
import { benchmark as containerBench } from './games/container/bench';
import { benchmark as cantstopBench } from './games/cantstop/bench';
import { benchmark as stoneageBench } from './games/stoneage/bench';
import { benchmark as stpetersburgBench } from './games/stpetersburg/bench';
import type { BenchmarkResult } from './kernel';

const GAMES = Number(process.env.BENCH_GAMES ?? 50);
const SEATS = Number(process.env.BENCH_SEATS ?? 2);

type Bench = (o: { games: number; seats: number }) => BenchmarkResult;

// `minSeats` because Container is 3–5 players and cannot run the 2p default; each game runs at
// `max(SEATS, minSeats)`.
const suites: ReadonlyArray<{ readonly name: string; readonly run: Bench; readonly minSeats: number }> = [
  { name: 'container', run: containerBench, minSeats: 3 },
  { name: 'cantstop', run: cantstopBench, minSeats: 2 },
  { name: 'stoneage', run: stoneageBench, minSeats: 2 },
  { name: 'stpetersburg', run: stpetersburgBench, minSeats: 2 },
];

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function main(): void {
  console.log(
    `Bot strength self-bench — ${GAMES} games/game, ${SEATS}p (Container 3p min); candidate === baseline, expect ~50%\n`,
  );
  const header = ['game', 'seats', 'games', 'winRate', 'ci95 (Wilson)'];
  const rows = [header];
  for (const { name, run, minSeats } of suites) {
    const seats = Math.max(SEATS, minSeats);
    const result = run({ games: GAMES, seats });
    rows.push([
      name,
      String(seats),
      String(result.games),
      pct(result.winRate),
      `[${pct(result.ci95[0])}, ${pct(result.ci95[1])}]`,
    ]);
  }
  const widths = header.map((_, col) => Math.max(...rows.map((row) => row[col]!.length)));
  for (const [i, row] of rows.entries()) {
    console.log(row.map((cell, col) => cell.padEnd(widths[col]!)).join('  '));
    if (i === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  }
}

main();
