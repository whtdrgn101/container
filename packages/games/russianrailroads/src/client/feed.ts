import type { RussianRailroadsView } from '../engine';

/**
 * Russian Railroads' move-to-text for the shared `ActivityFeed` — the action wording only (the feed
 * renders the actor's name + bot badge). Everything RR logs is public, so nothing here is redacted.
 */
export function describeMove(entry: RussianRailroadsView['log'][number]): string {
  if (entry.type === 'PLACE') {
    const p = entry.payload as { label?: string; gainedCoins?: number } | undefined;
    if (!p?.label) return 'placed a worker';
    return p.gainedCoins ? `placed a worker — ${p.label} (+${p.gainedCoins} coins)` : `placed a worker — ${p.label}`;
  }
  if (entry.type === 'PASS') {
    const p = entry.payload as { gameEnded?: boolean; nextRound?: number } | undefined;
    if (p?.gameEnded) return 'passed — final round over, the game ends';
    if (p?.nextRound) return `passed — round over, on to round ${p.nextRound}`;
    return 'passed';
  }
  return entry.type.toLowerCase();
}
