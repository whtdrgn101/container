// The bot kernel: the small set of primitives every game's bot shares. Deliberately tiny (like the
// engine's kernel) — a bot's actual opinions are game-specific and live in `games/<game>/`.
export { BotError } from './errors';
export { assertBotTurn, type SeatedView } from './turn';
export { makeProgressGuard, type ProgressGuard, type ProgressGuardOptions } from './progress';
export { runBenchmark, wilsonInterval, mulberry32, type BenchmarkOptions, type BenchmarkResult } from './benchmark';
