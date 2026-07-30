// The bot kernel: the small set of primitives every game's bot shares. Deliberately tiny (like the
// engine's kernel) — a bot's actual opinions are game-specific and live in `games/<game>/`.
export { BotError } from './errors.js';
export { assertBotTurn, type SeatedView } from './turn.js';
export { makeProgressGuard, type ProgressGuard, type ProgressGuardOptions } from './progress.js';
export { runBenchmark, wilsonInterval, type BenchmarkOptions, type BenchmarkResult } from './benchmark.js';
// `mulberry32` moved to the framework-free `.` barrel in kernel 1.2.0 (an engine test needs a seeded
// rng too, and must not import the bot subpath to get one). Re-exported here so `./bot`'s surface is
// unchanged — every game's bench imports it from this subpath.
export { mulberry32 } from '../random.js';
