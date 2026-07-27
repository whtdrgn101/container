import type { ActionSpaceDef, Engineer, EngineerAction, RouteSpecial, TrackColor } from '../engine';

/**
 * Player-facing help text for every Russian Railroads action spot (the ActionTip content). Lives with the
 * game (Track D: this is the game's own package). The plate and engineer text is **derived from the space /
 * engineer data** so it can never drift from what the button actually does — the same catalogs the board
 * renders. Rulebook pages cited per entry (RR pp. 7–22, the same reads the engine constants document).
 */

/** The worker/coin cost of a space as a short lead-in, e.g. "2 workers" or "1 worker + 1 coin". */
function costLead(space: ActionSpaceDef): string {
  const workers = `${space.workers} worker${space.workers === 1 ? '' : 's'}`;
  const coin = space.coinCost ? ` + ${space.coinCost} coin` : '';
  return `${workers}${coin}`;
}

/** A readable colour phrase for a track-extension space's allowed colours (pg. 9). */
function colorPhrase(colors: readonly TrackColor[]): string {
  if (colors.length >= 5) return 'any unlocked colour';
  return colors.join(' or ');
}

/**
 * The tip for one Dispatch Hall enamel plate — cost + effect, derived from the space definition (pg. 7–16,
 * 22). Covers the coins/track/locomotive/industry/doubler/temp-worker/turn-order spaces and the last-round
 * tile, so a new space gets sensible help for free.
 */
export function spaceTip(space: ActionSpaceDef): string {
  const lead = costLead(space);
  const openNote = space.neverOccupies ? ' Always open — never blocked, any number of workers.' : '';
  switch (space.kind) {
    case 'coins':
      // pg. 14 — the coins action space.
      return `${lead}: take 2 coins.`;
    case 'track': {
      // pg. 8–9 — a track-extension space grants single track steps under a build lock.
      const moves = space.track?.moves ?? 0;
      const colors = colorPhrase(space.track?.colors ?? []);
      return `${lead}: build ${moves} track step${moves === 1 ? '' : 's'} (${colors}), one space at a time.${openNote}`;
    }
    case 'locomotive':
      // pg. 12 — the locomotive/factory spaces.
      return space.loco === 'and'
        ? `${lead}: build a locomotive AND a factory (you choose which first).`
        : `${lead}: build a locomotive or a factory — your choice.`;
    case 'industry': {
      // pg. 13–14, 22 — advance the wrench on the industry track (capped by unfilled factory gaps).
      const advance = space.industry?.advance ?? 0;
      const wood = space.industry?.woodMove ? ` and move 1 wood track` : '';
      return `${lead}: advance your wrench ${advance} step${advance === 1 ? '' : 's'} on the industry track${wood}. Gaps must be filled with factories first.`;
    }
    case 'doubler':
      // pg. 14 — take a doubler tile onto the Trans-Siberian.
      return `${lead}: take a doubler tile onto the leftmost open Trans-Siberian space (it doubles that space's points).`;
    case 'temp-workers':
      // pg. 15 — take the 2 turquoise temporary workers for the round.
      return `${lead}: take 2 extra workers to use this round only.`;
    case 'turn-order':
      // pg. 16 — claim a better departure position for next round.
      return `${lead}: claim ${space.id === 'turnorder-1' ? 'first' : 'second'} place in next round's turn order.`;
    default:
      return `${lead}: ${space.label}.`;
  }
}

/** Use-a-coin-instead-of-a-worker help for a space's secondary "Use coin" button (pg. 14). */
export const USE_COIN_TIP =
  'Spend a coin instead of a worker to take this action (pg. 14) — useful when your workers are all placed.';

/** The pass affordance (pg. 7): you're done placing for the round. */
export const PASS_TIP =
  'Pass for the round: place no more workers. Once everyone passes, the round scores and turn order is rearranged.';

/** An engineer's effect as one short clause (pg. 15–16, 48) — derived from its action data. */
function engineerEffect(action: EngineerAction): string {
  switch (action.kind) {
    case 'moveTrack':
      return `move ${action.count} track${action.count === 1 ? '' : 's'} forward 1 space`;
    case 'coins':
      return `take ${action.count} coins`;
    case 'doubler':
      return `take a doubler tile and score +${action.points} points`;
    case 'score':
      return `score +${action.points} points`;
    case 'scoreEngineers':
      return 'score points equal to the sum of your engineer numbers';
    case 'scoreLocomotives':
      return "score points equal to your two highest locomotives' numbers";
    case 'endBonus':
      return `take another end-bonus card, or score +${action.points} points`;
    case 'inert':
      return 'no effect yet in this edition';
  }
}

/** Tip for the hiring space (pg. 15): pay 1 coin to take the engineer as a private once-per-round action. */
export function hireTip(engineer: Engineer): string {
  return `Pay 1 coin to hire Engineer #${engineer.number}: ${engineerEffect(engineer.action)}. Its action becomes yours, usable once per round.`;
}

/** Tip for a public variable engineer space (pg. 15–16): place 1 worker to use its action now. */
export function variableTip(engineer: Engineer): string {
  return `Place 1 worker to use Engineer #${engineer.number} now: ${engineerEffect(engineer.action)}.`;
}

/** Tip for one of your own hired engineers (pg. 15): use it once this round. */
export function hiredEngineerTip(engineer: Engineer): string {
  return `Engineer #${engineer.number} — ${engineerEffect(engineer.action)}. Once per round.`;
}

/** A route special space's trigger + reward (pp. 18–19) — derived from its type. */
export function specialTip(special: RouteSpecial): string {
  const loco = special.requiresLoco ? ' with a locomotive also reaching it' : '';
  switch (special.type) {
    case 'new-worker':
      return `New worker: reach space ${special.space} with your track${loco} to gain a permanent extra worker.`;
    case 'key':
      return `End-station key: reach the route's end (space ${special.space}) for the key bonus — advance a track and score, or +10 points.`;
    case 'idea-token':
      return `Idea token: reach space ${special.space} with your track${loco} to take an idea (engineer) card.`;
    case 'route-doubling':
      return `Route doubling: reach space ${special.space} with your green track${loco} to double this route's points each round.`;
    case 'bonus-star':
      return `Bonus star (${special.points ?? 0}): reach space ${special.space}${loco} to score the cumulative star bonus each round.`;
  }
}

/** Note used on the never-occupied bottom track space's green lamp (pg. 9). */
export const ALWAYS_OPEN_TIP =
  'This space is always open — any number of players may use it each round (pg. 9). One wood or green track step.';
