/**
 * The tool ladder (rulebook pg. 5). A player has up to 3 tool slots. The 1st–3rd tools taken are value
 * 1; the 4th–6th upgrade the slots to 2, the 7th–9th to 3, the 10th–12th to 4 — always upgrading the
 * lowest slot first (so they climb 1,2,3 in order, then round again). A 13th tool has nowhere to go
 * (all slots maxed at 4) and is a no-op.
 */
export function addTool(tools: readonly number[]): number[] {
  const next = [...tools];
  if (next.length < 3) {
    next.push(1);
    return next;
  }
  const lowest = next.indexOf(Math.min(...next));
  if (next[lowest]! < 4) next[lowest] = next[lowest]! + 1;
  return next;
}
