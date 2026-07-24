import type { RussianRailroadsView } from '../engine';

/** Pretty route names for the feed (pg. 8): "Kyiv" reads better than the id "kyiv". */
function routeLabel(route?: string): string {
  if (route === 'transsiberian') return 'Trans-Siberian';
  if (route === 'stpetersburg') return 'St. Petersburg';
  if (route === 'kyiv') return 'Kyiv';
  return route ?? 'a route';
}

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
      | {
          label?: string;
          gainedCoins?: number;
          moves?: number;
          doubler?: number;
          tempWorkers?: number;
          acquired?: number;
          advanced?: number;
          coinsGained?: number;
        }
      | undefined;
    if (!p?.label) return 'placed a worker';
    if (p.gainedCoins) return `placed a worker — ${p.label} (+${p.gainedCoins} coins)`;
    if (p.doubler) return `placed a worker — took a doubler (×2 on space ${p.doubler})`;
    if (p.tempWorkers) return `placed a worker — took ${p.tempWorkers} temporary workers`;
    if (p.acquired) return `placed a worker — took the #${p.acquired} locomotive`;
    if (p.advanced !== undefined) {
      const coins = p.coinsGained ? ` (+${p.coinsGained} coins from a factory)` : '';
      return `placed a worker — advanced the wrench ${p.advanced}${coins}`;
    }
    if (p.moves === 0) return `placed a worker — ${p.label} (no move possible)`;
    return `placed a worker — ${p.label}`;
  }
  if (entry.type === 'PLACE_FACTORY') {
    const p = entry.payload as { number?: number } | undefined;
    return `built a #${p?.number ?? '?'} factory on the industry track`;
  }
  if (entry.type === 'REPLACE_FACTORY') {
    const p = entry.payload as { number?: number; replaced?: number } | undefined;
    return `replaced a #${p?.replaced ?? '?'} factory with a #${p?.number ?? '?'}`;
  }
  if (entry.type === 'RESOLVE_POOL') {
    return 'used a factory action (move a track)';
  }
  if (entry.type === 'SKIP_POOL') {
    return 'skipped the remaining factory actions';
  }
  if (entry.type === 'MOVE_TRACK') {
    const p = entry.payload as { route?: string; color?: string } | undefined;
    return `built ${p?.color ?? 'wood'} track on ${p?.route ?? 'a route'}`;
  }
  if (entry.type === 'PLACE_LOCO') {
    const p = entry.payload as { route?: string; number?: number } | undefined;
    return `placed the #${p?.number ?? '?'} on ${routeLabel(p?.route)}`;
  }
  if (entry.type === 'REPLACE_LOCO') {
    const p = entry.payload as { route?: string; number?: number; replaced?: number } | undefined;
    return `upgraded the #${p?.replaced ?? '?'} to the #${p?.number ?? '?'} on ${routeLabel(p?.route)}`;
  }
  if (entry.type === 'FLIP_LOCO') {
    const p = entry.payload as { number?: number } | undefined;
    return `flipped the #${p?.number ?? '?'} to a factory`;
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
