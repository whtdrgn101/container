import type { RussianRailroadsView } from '../engine';

/** One player's per-round scoring entry, as logged on the closing PASS (pg. 20–21). */
interface RoundScore {
  readonly playerId: string;
  readonly routes: number;
  readonly industry: number;
  readonly gained: number;
}

/**
 * Russian Railroads' move-to-text for the shared `ActivityFeed` — the action wording only (the feed
 * renders the actor's name + bot badge). Everything RR logs is public, so nothing here is redacted.
 */
export function describeMove(entry: RussianRailroadsView['log'][number], nameOf?: (id: string) => string): string {
  if (entry.type === 'PLACE') {
    const p = entry.payload as
      { label?: string; gainedCoins?: number; moves?: number; doubler?: number; tempWorkers?: number } | undefined;
    if (!p?.label) return 'placed a worker';
    if (p.gainedCoins) return `placed a worker — ${p.label} (+${p.gainedCoins} coins)`;
    if (p.doubler) return `placed a worker — took a doubler (×2 on space ${p.doubler})`;
    if (p.tempWorkers) return `placed a worker — took ${p.tempWorkers} temporary workers`;
    if (p.moves === 0) return `placed a worker — ${p.label} (no move possible)`;
    return `placed a worker — ${p.label}`;
  }
  if (entry.type === 'MOVE_TRACK') {
    const p = entry.payload as { route?: string; color?: string } | undefined;
    return `built ${p?.color ?? 'wood'} track on ${p?.route ?? 'a route'}`;
  }
  if (entry.type === 'PASS') {
    const p = entry.payload as { gameEnded?: boolean; nextRound?: number; scores?: readonly RoundScore[] } | undefined;
    const tally = p?.scores?.length
      ? '; scored ' +
        p.scores
          .map((s) => `${nameOf?.(s.playerId) ?? s.playerId} ${s.gained} (routes ${s.routes}, industry ${s.industry})`)
          .join(', ')
      : '';
    if (p?.gameEnded) return `passed — final round scored${tally}`;
    if (p?.nextRound) return `passed — round over, on to round ${p.nextRound}${tally}`;
    return 'passed';
  }
  return entry.type.toLowerCase();
}
