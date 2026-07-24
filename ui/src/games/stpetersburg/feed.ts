import type { StPetersburgView } from '@game-hub/engine/stpetersburg';

/**
 * Saint Petersburg's move-to-text for the shared `ActivityFeed` — the action wording only (the feed renders
 * the actor's name + bot badge). Everything Saint Petersburg logs is public, so nothing here is redacted.
 */
export function describeMove(entry: StPetersburgView['log'][number]): string {
  if (entry.type === 'BUY') {
    const p = entry.payload as { cardName?: string; cost?: number; displacedName?: string } | undefined;
    if (p?.displacedName) return `upgraded the ${p.displacedName} to the ${p.cardName} (${p.cost}₽)`;
    return p ? `bought the ${p.cardName} for ${p.cost}₽` : 'bought a card';
  }
  if (entry.type === 'ADD_TO_HAND') {
    const p = entry.payload as { cardName?: string } | undefined;
    return p?.cardName ? `took the ${p.cardName} into hand` : 'took a card into hand';
  }
  if (entry.type === 'PLAY_FROM_HAND') {
    const p = entry.payload as { cardName?: string; cost?: number; displacedName?: string } | undefined;
    if (p?.displacedName) return `upgraded the ${p.displacedName} to the ${p.cardName} from hand (${p.cost}₽)`;
    return p ? `played the ${p.cardName} from hand for ${p.cost}₽` : 'played a card from hand';
  }
  if (entry.type === 'PASS') {
    const p = entry.payload as { closedPhase?: string; nextRound?: number; pubPending?: boolean } | undefined;
    if (p?.nextRound) return `passed — Round ${p.nextRound}: lower row discarded, markers passed left`;
    if (p?.pubPending) return 'passed — buildings scored; the Pub is open';
    return p?.closedPhase ? `passed — ${p.closedPhase} phase scored` : 'passed';
  }
  if (entry.type === 'PUB_BUY') {
    const p = entry.payload as { points?: number; cost?: number } | undefined;
    return p && p.points ? `bought ${p.points} point(s) at the Pub for ${p.cost}₽` : 'declined the Pub';
  }
  if (entry.type === 'OBSERVATORY_DRAW') {
    const p = entry.payload as { stack?: string; cardName?: string } | undefined;
    return p?.cardName
      ? `drew the ${p.cardName} from the ${p.stack} stack (Observatory)`
      : 'drew from a stack (Observatory)';
  }
  if (entry.type === 'OBSERVATORY_RESOLVE') {
    const p = entry.payload as
      { choice?: string; cardName?: string; cost?: number; displacedName?: string } | undefined;
    if (!p) return 'resolved the Observatory draw';
    if (p.choice === 'discard') return `discarded the ${p.cardName} (Observatory)`;
    if (p.choice === 'hand') return `took the ${p.cardName} into hand (Observatory)`;
    if (p.displacedName) return `upgraded the ${p.displacedName} to the ${p.cardName} (Observatory, ${p.cost}₽)`;
    return `bought the ${p.cardName} for ${p.cost}₽ (Observatory)`;
  }
  return entry.type.toLowerCase();
}
