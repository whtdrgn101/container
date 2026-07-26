import type { Action, EngineerAction, PlayerView, RussianRailroadsView } from '../engine';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CoinIcon } from './art';

/**
 * Russian Railroads' engineer strip as **the crew roster** (RR9, pp. 15–16, 22): read from the right, the
 * hiring card (gold-rimmed, a coin price), the two on-duty variable action cards, then the left-hand future
 * engineers as dark cards carrying the rounds-remaining countdown. Below it, the active seat's hired
 * engineers — its private once-per-round crew. Interactive chrome above the board, so it keeps semantic
 * tokens; the coin glyph is the one bit of hardcoded art.
 */
export interface EngineerStripProps {
  readonly strip: RussianRailroadsView['engineerStrip'];
  readonly roundsRemaining: number;
  readonly active: PlayerView | undefined;
  readonly canHire: boolean;
  readonly usableVarSlots: ReadonlySet<number>;
  readonly usableEngineers: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onEngineer: (action: Action) => void;
}

/** A short human label for an engineer's action (pg. 15–16, 48). */
function engActionText(action: EngineerAction): string {
  switch (action.kind) {
    case 'moveTrack':
      return `move ${action.count} track${action.count > 1 ? 's' : ''}`;
    case 'coins':
      return `+${action.count} coins`;
    case 'doubler':
      return `doubler +${action.points}`;
    case 'score':
      return `+${action.points} pts`;
    case 'scoreEngineers':
      return 'pts = Σ engineers';
    case 'scoreLocomotives':
      return 'pts = Σ 2 locos';
    case 'endBonus':
      return `end bonus / +${action.points} pts`;
    case 'inert':
      return 'inert';
  }
}

export function EngineerStrip({
  strip,
  roundsRemaining,
  active,
  canHire,
  usableVarSlots,
  usableEngineers,
  busy,
  onEngineer,
}: EngineerStripProps) {
  const stripLen = strip.length;
  return (
    <section aria-label="Engineers" data-testid="rr-engineer-strip">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Crew roster
      </h2>
      <div className="flex flex-wrap gap-2">
        {strip.map((engineer, i) => {
          const isHiring = i === stripLen - 1;
          const slot = i - (stripLen - 3); // 0 or 1 for the two variable spaces, else out of [0,1]
          const isVariable = slot === 0 || slot === 1;
          const region = isHiring ? 'Hiring' : isVariable ? `Variable ${slot + 1}` : 'Upcoming';
          return (
            <div
              key={i}
              data-testid={`rr-eng-slot-${i}`}
              className={cn(
                'w-40 rounded-lg border p-2 text-xs shadow-sm',
                isHiring
                  ? 'border-amber-500/70 bg-amber-500/10'
                  : isVariable
                    ? 'border-slate-500/40 bg-card'
                    : 'border-slate-700 bg-slate-900/80 text-slate-200',
              )}
            >
              <div
                className={cn(
                  'text-[10px] uppercase tracking-wide',
                  isHiring
                    ? 'text-amber-700 dark:text-amber-400'
                    : isVariable
                      ? 'text-muted-foreground'
                      : 'text-slate-400',
                )}
              >
                {region}
              </div>
              {engineer ? (
                <>
                  <div className="font-medium">
                    Engineer #{engineer.number}
                    <span
                      className={cn(
                        'ml-1 font-normal',
                        isHiring || isVariable ? 'text-muted-foreground' : 'text-slate-400',
                      )}
                    >
                      — {engActionText(engineer.action)}
                    </span>
                  </div>
                  {isHiring ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 gap-1"
                      data-testid="rr-hire"
                      disabled={busy || !canHire}
                      onClick={() => onEngineer({ type: 'HIRE_ENGINEER' })}
                    >
                      Hire <CoinIcon value={1} size={14} />
                    </Button>
                  ) : isVariable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1"
                      data-testid={`rr-var-${slot}`}
                      disabled={busy || !usableVarSlots.has(slot)}
                      onClick={() => onEngineer({ type: 'USE_VARIABLE_ENGINEER', slot })}
                    >
                      Use (1 worker)
                    </Button>
                  ) : null}
                </>
              ) : (
                <div className={isVariable ? 'text-muted-foreground' : 'text-slate-400'}>
                  {i === 0 ? `${roundsRemaining} round${roundsRemaining > 1 ? 's' : ''} left` : 'empty'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The active seat's hired engineers (pg. 15) — private indirect actions, each usable once per round. */}
      {active && active.hiredEngineers.length > 0 ? (
        <div className="mt-3" data-testid="rr-hired">
          <h3 className="mb-1 text-xs font-semibold">
            {active.name}'s engineers ({active.hiredEngineers.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {active.hiredEngineers.map((engineer) => {
              const used = active.usedEngineers.includes(engineer.id);
              const inert = engineer.action.kind === 'inert';
              return (
                <Button
                  key={engineer.id}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-use-${engineer.id}`}
                  disabled={busy || !usableEngineers.has(engineer.id)}
                  title={inert ? 'No resolvable action yet' : used ? 'Already used this round' : undefined}
                  onClick={() => onEngineer({ type: 'USE_ENGINEER', engineerId: engineer.id })}
                >
                  #{engineer.number} {engActionText(engineer.action)}
                  {used ? ' ✓' : ''}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
