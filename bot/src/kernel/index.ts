// The bot kernel: the small set of primitives every game's bot shares. Deliberately tiny (like the
// engine's kernel) — a bot's actual opinions are game-specific and live in `games/<game>/`.
export { BotError } from './errors';
