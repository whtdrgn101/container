import type { ActionSpaceDef, SpacePlacement } from '../engine';
import { ActionTip, Button } from '@game-hub/ui-kit';
import { CoinIcon, Meeple } from './art';
import { spaceTip, USE_COIN_TIP } from './tips';

/**
 * One shared **action space** as a cream enamel plate on "The Dispatch Hall" board (RR9, rev-4 layout):
 * the label sits TOP, the worker sockets BOTTOM — a dashed ring for each open socket, and, once claimed,
 * seat-coloured `Meeple`s and gold coins sitting in the sockets. The plate face is hardcoded diegetic
 * enamel (`#e8e2d4` + a `#17181c` rim) that does not re-theme; the action `Button`s over it are the
 * interactive chrome and keep their own tokens. Every testid is preserved from the pre-art board.
 */
export interface PlateAffordances {
  readonly workerSpaces: ReadonlySet<string>;
  readonly coinSpaces: ReadonlySet<string>;
  readonly legalBuild: (spaceId: string, build: 'loco' | 'factory') => boolean;
  readonly legalFirst: (spaceId: string, first: 'loco' | 'factory') => boolean;
  readonly busy: boolean;
  readonly doPlace: (
    space: string,
    opts?: { coins?: number; build?: 'loco' | 'factory'; first?: 'loco' | 'factory' },
  ) => void;
  readonly nameOf: (id: string) => string;
  readonly seatHex: (id: string) => string;
}

/** The occupancy sockets: seat-coloured meeples + coins per placement, or dashed-ring open sockets + "Empty". */
function Sockets({
  space,
  placements,
  nameOf,
  seatHex,
}: {
  space: ActionSpaceDef;
  placements: readonly SpacePlacement[];
  nameOf: (id: string) => string;
  seatHex: (id: string) => string;
}) {
  if (placements.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid={`rr-occupied-${space.id}`}>
        {placements.map((p, k) => (
          <span key={k} className="inline-flex items-center gap-0.5" title={nameOf(p.ownerId)}>
            {Array.from({ length: p.workers }, (_, w) => (
              <Meeple key={`w${w}`} className="h-4 w-4 shrink-0 drop-shadow-sm" fill={seatHex(p.ownerId)} />
            ))}
            {Array.from({ length: p.coins }, (_, c) => (
              <CoinIcon key={`c${c}`} size={14} />
            ))}
            <span className="text-[10px] font-medium" style={{ color: '#3a3d32' }}>
              {nameOf(p.ownerId)}
            </span>
          </span>
        ))}
        {space.neverOccupies ? (
          <span className="text-[10px] italic" style={{ color: '#6a6f78' }}>
            open to all
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: Math.max(1, space.workers) }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block h-4 w-4 rounded-full border border-dashed"
          style={{ borderColor: '#6a6f78' }}
        />
      ))}
      <span className="text-[11px]" style={{ color: '#6a6f78' }}>
        Empty
      </span>
    </div>
  );
}

/** The green "always open" signal on the never-occupied bottom track space (pg. 9). */
function GreenLamp() {
  return (
    <span
      aria-hidden
      title="Always open"
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{ background: '#4f9d5a', boxShadow: '0 0 4px 1px rgba(79,157,90,0.7)' }}
    />
  );
}

export function ActionPlate({
  space,
  placements,
  aff,
}: {
  space: ActionSpaceDef;
  placements: readonly SpacePlacement[];
  aff: PlateAffordances;
}) {
  const { busy, doPlace } = aff;
  const coinCost = space.coinCost ?? 0;
  const tip = spaceTip(space);
  return (
    <div
      data-testid={`rr-space-${space.id}`}
      className="rounded-lg border-2 p-2.5 shadow-sm"
      style={{ background: '#e8e2d4', borderColor: '#17181c' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight" style={{ color: '#17181c' }}>
          {space.neverOccupies && space.kind === 'track' ? <GreenLamp /> : null}
          {space.label}
        </span>
        <span className="whitespace-nowrap text-[10px] font-medium" style={{ color: '#4a4d53' }}>
          {space.workers}w{coinCost ? ` +${coinCost}c` : ''}
        </span>
      </div>

      <div className="mt-2">
        <Sockets space={space} placements={placements} nameOf={aff.nameOf} seatHex={aff.seatHex} />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {space.kind === 'locomotive' ? (
          space.loco === 'and' ? (
            <>
              <ActionTip tip={tip}>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`rr-place-${space.id}`}
                  disabled={busy || !aff.legalFirst(space.id, 'loco')}
                  onClick={() => doPlace(space.id, { first: 'loco' })}
                >
                  Loco first
                </Button>
              </ActionTip>
              <ActionTip tip={tip}>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`rr-build-factory-${space.id}`}
                  disabled={busy || !aff.legalFirst(space.id, 'factory')}
                  onClick={() => doPlace(space.id, { first: 'factory' })}
                >
                  Factory first
                </Button>
              </ActionTip>
            </>
          ) : (
            <>
              <ActionTip tip={tip}>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`rr-place-${space.id}`}
                  disabled={busy || !aff.legalBuild(space.id, 'loco')}
                  onClick={() => doPlace(space.id, { build: 'loco' })}
                >
                  Build loco
                </Button>
              </ActionTip>
              <ActionTip tip={tip}>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`rr-build-factory-${space.id}`}
                  disabled={busy || !aff.legalBuild(space.id, 'factory')}
                  onClick={() => doPlace(space.id, { build: 'factory' })}
                >
                  Build factory
                </Button>
              </ActionTip>
            </>
          )
        ) : (
          <>
            <ActionTip tip={tip}>
              <Button
                variant="outline"
                size="sm"
                data-testid={`rr-place-${space.id}`}
                disabled={busy || !aff.workerSpaces.has(space.id)}
                onClick={() => doPlace(space.id)}
              >
                {coinCost ? 'Place worker + coin' : 'Place worker'}
              </Button>
            </ActionTip>
            {coinCost === 0 ? (
              <ActionTip tip={USE_COIN_TIP}>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`rr-place-coin-${space.id}`}
                  disabled={busy || !aff.coinSpaces.has(space.id)}
                  onClick={() => doPlace(space.id, { coins: space.workers })}
                >
                  Use coin
                </Button>
              </ActionTip>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
