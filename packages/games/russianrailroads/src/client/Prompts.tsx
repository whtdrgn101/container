import type { Action, LocoResolution, RussianRailroadsView } from '../engine';
import { Button } from '@game-hub/ui-kit';
import { SteamLoco, WrenchIcon } from './art';

/**
 * Russian Railroads' active-turn **lock / choice prompts** — the engine's binding "multi-step choices are
 * engine locks" model surfaced as focused panels (pp. 8–19, 46): the track-extension lock, the held
 * locomotive, the owed factory, the action pool, the starting-bonus / worker-reuse mini-phases, and the
 * key / idea-token / idea-card choices. Each renders only when its flag is set, in the same
 * `applyAction` precedence the board computes.
 *
 * These are interactive chrome that sits *above* the diegetic board, so they keep semantic tokens (they
 * re-theme in dark mode); only the small rules-objects inside a button (a `SteamLoco`, a `FactoryTile`) are
 * the hardcoded art. Every testid and asserted string is preserved from the pre-art board.
 */
export interface PromptsProps {
  readonly resolving: boolean;
  readonly pendingMoves: RussianRailroadsView['pendingMoves'];
  readonly resolvingLoco: boolean;
  readonly pendingLoco: RussianRailroadsView['pendingLoco'];
  readonly locoOptions: readonly LocoResolution[];
  readonly resolvingFactory: boolean;
  readonly pendingFactory: RussianRailroadsView['pendingFactory'];
  readonly pendingThen: RussianRailroadsView['pendingThen'];
  readonly factoryOptions: readonly Action[];
  readonly resolvingPool: boolean;
  readonly poolOptions: readonly Action[];
  readonly resolvingSetup: boolean;
  readonly resolvingReuse: boolean;
  readonly resolvingKey: boolean;
  readonly resolvingIdeaToken: boolean;
  readonly resolvingIdeaCard: boolean;
  readonly choiceOptions: readonly Action[];
  readonly busy: boolean;
  readonly doLoco: (action: Action) => void;
  readonly doFactory: (action: Action) => void;
  readonly doPool: (action: Action) => void;
  readonly doAction: (action: Action) => void;
}

/** Shared panel shell for a lock/choice prompt — the iron-rimmed "dispatcher's order" card. */
function Panel({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-primary bg-primary/5 p-3 text-sm font-medium shadow-sm"
    >
      {children}
    </div>
  );
}

export function Prompts(props: PromptsProps) {
  const { busy } = props;
  return (
    <>
      {/* The track-extension lock (pg. 8–9): click a route below to spend one move. */}
      {props.resolving && props.pendingMoves ? (
        <Panel testId="rr-pending">
          {props.pendingMoves.remaining} track move{props.pendingMoves.remaining > 1 ? 's' : ''} left — click a route
          below to build.
        </Panel>
      ) : null}

      {/* The locomotive lock (pg. 10–11): place, upgrade a lower one (a chain reaction), or flip to a factory. */}
      {props.resolvingLoco && props.pendingLoco ? (
        <Panel testId="rr-pending-loco">
          <div className="flex items-center gap-2">
            <SteamLoco number={props.pendingLoco.number} size={34} />
            <span>
              Locomotive #{props.pendingLoco.number} in hand — place it, upgrade a lower one, or flip it to a factory.
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {props.locoOptions.map((opt) =>
              opt.kind === 'place' ? (
                <Button
                  key={`place-${opt.route}`}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-loco-place-${opt.route}`}
                  disabled={busy}
                  onClick={() => props.doLoco({ type: 'PLACE_LOCO', route: opt.route })}
                >
                  Place on {opt.route}
                </Button>
              ) : opt.kind === 'replace' ? (
                <Button
                  key={`replace-${opt.route}-${opt.number}`}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-loco-replace-${opt.route}-${opt.number}`}
                  disabled={busy}
                  onClick={() => props.doLoco({ type: 'REPLACE_LOCO', route: opt.route, number: opt.number })}
                >
                  Upgrade #{opt.number} on {opt.route}
                </Button>
              ) : (
                <Button
                  key="flip"
                  variant="ghost"
                  size="sm"
                  data-testid="rr-loco-flip"
                  disabled={busy}
                  title="Return it to the supply as a factory (pg. 11)"
                  onClick={() => props.doLoco({ type: 'FLIP_LOCO' })}
                >
                  Flip to factory
                </Button>
              ),
            )}
          </div>
        </Panel>
      ) : null}

      {/* The factory lock (pg. 12): build the owed factory into the leftmost gap, or replace one. */}
      {props.resolvingFactory && props.pendingFactory ? (
        <Panel testId="rr-pending-factory">
          <div className="flex items-center gap-2">
            <WrenchIcon className="h-5 w-5" />
            <span>Factory to build{props.pendingThen ? ` (then a ${props.pendingThen})` : ''} — choose a tile:</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {props.factoryOptions.map((opt) =>
              opt.type === 'PLACE_FACTORY' ? (
                <Button
                  key={`place-${opt.from ?? 'low'}`}
                  variant="outline"
                  size="sm"
                  data-testid={opt.from === undefined ? 'rr-factory-place' : `rr-factory-place-${opt.from}`}
                  disabled={busy}
                  onClick={() => props.doFactory(opt)}
                >
                  Build {opt.from === undefined ? 'lowest loco' : `#${opt.from}`}
                </Button>
              ) : opt.type === 'REPLACE_FACTORY' ? (
                <Button
                  key={`replace-${opt.slot}-${opt.from ?? 'low'}`}
                  variant="outline"
                  size="sm"
                  data-testid={
                    opt.from === undefined
                      ? `rr-factory-replace-${opt.slot}`
                      : `rr-factory-replace-${opt.slot}-${opt.from}`
                  }
                  disabled={busy}
                  onClick={() => props.doFactory(opt)}
                >
                  Replace slot {opt.slot + 1} with {opt.from === undefined ? 'lowest loco' : `#${opt.from}`}
                </Button>
              ) : null,
            )}
          </div>
        </Panel>
      ) : null}

      {/* The action-pool prompt (pg. 13): spend each factory / industrialization credit, or skip the rest. */}
      {props.resolvingPool ? (
        <Panel testId="rr-pending-pool">
          <div>Factory actions available this turn — resolve or skip:</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {props.poolOptions.map((opt) =>
              opt.type === 'RESOLVE_POOL' ? (
                <Button
                  key={opt.id}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-pool-resolve-${opt.id}`}
                  disabled={busy}
                  onClick={() => props.doPool(opt)}
                >
                  Move a track
                </Button>
              ) : opt.type === 'SKIP_POOL' ? (
                <Button
                  key="skip"
                  variant="ghost"
                  size="sm"
                  data-testid="rr-pool-skip"
                  disabled={busy}
                  onClick={() => props.doPool(opt)}
                >
                  Skip remaining
                </Button>
              ) : null,
            )}
          </div>
        </Panel>
      ) : null}

      {/* The starting-bonus setup mini-phase (pg. 6): 4th → 3rd → 2nd pick a card at game start. */}
      {props.resolvingSetup ? (
        <Panel testId="rr-setup">
          <div>Starting bonus — pick a card (pg. 6):</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {props.choiceOptions.map((opt) =>
              opt.type === 'RESOLVE_SETUP_BONUS' ? (
                <Button
                  key={opt.card}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-setup-${opt.card}`}
                  disabled={busy}
                  onClick={() => props.doAction(opt)}
                >
                  {opt.card}
                </Button>
              ) : null,
            )}
          </div>
        </Panel>
      ) : null}

      {/* The between-round worker-reuse mini-phase (pg. 17): move the turn-order worker to a 1-worker space. */}
      {props.resolvingReuse ? (
        <Panel testId="rr-reuse">
          <div>Reuse your turn-order worker — resolve one 1-worker space (pg. 17):</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {props.choiceOptions.map((opt) =>
              opt.type === 'RESOLVE_REUSE' ? (
                <Button
                  key={opt.space}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-reuse-${opt.space}`}
                  disabled={busy}
                  onClick={() => props.doAction(opt)}
                >
                  {opt.space}
                </Button>
              ) : null,
            )}
          </div>
        </Panel>
      ) : null}

      {/* A pending key (pg. 19): advance a wood + any track, or score 10. */}
      {props.resolvingKey ? (
        <Panel testId="rr-key">
          <div>You received a key (pg. 19) — choose:</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {props.choiceOptions.map((opt) =>
              opt.type === 'RESOLVE_KEY' ? (
                <Button
                  key={opt.option}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-key-${opt.option}`}
                  disabled={busy}
                  onClick={() => props.doAction(opt)}
                >
                  {opt.option === 'moves' ? 'Advance a wood + any track' : 'Score 10 points'}
                </Button>
              ) : null,
            )}
          </div>
        </Panel>
      ) : null}

      {/* A pending idea-token choice (pp. 18–19, 46): spend one unused idea token. */}
      {props.resolvingIdeaToken ? (
        <Panel testId="rr-idea-token">
          <div>Choose an idea token (pg. 46):</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {props.choiceOptions.map((opt) =>
              opt.type === 'RESOLVE_IDEA_TOKEN' ? (
                <Button
                  key={opt.token}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-idea-token-${opt.token}`}
                  disabled={busy}
                  onClick={() => props.doAction(opt)}
                >
                  {opt.token}
                </Button>
              ) : null,
            )}
          </div>
        </Panel>
      ) : null}

      {/* A pending idea-card choice (pg. 46–47), granted by the end-bonus idea token. */}
      {props.resolvingIdeaCard ? (
        <Panel testId="rr-idea-card">
          <div>Choose an idea card (pg. 47):</div>
          <div className="mt-2 flex flex-wrap gap-2 font-normal">
            {props.choiceOptions.map((opt) =>
              opt.type === 'RESOLVE_IDEA_CARD' ? (
                <Button
                  key={opt.card}
                  variant="outline"
                  size="sm"
                  data-testid={`rr-idea-card-${opt.card}`}
                  disabled={busy}
                  onClick={() => props.doAction(opt)}
                >
                  {opt.card}
                </Button>
              ) : null,
            )}
          </div>
        </Panel>
      ) : null}
    </>
  );
}
