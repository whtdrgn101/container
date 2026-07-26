import { actionSpace } from '../engine';
import type { RussianRailroadsView } from '../engine';
import { cn } from '@/lib/utils';
import { Meeple } from './art';
import { ActionPlate } from './ActionPlate';
import type { PlateAffordances } from './ActionPlate';

/**
 * The turn-order track as **the departure board** (RR9, rev-4, pg. 16): a black enamel board with brass
 * position numbers and a seat-coloured pawn on each row, first departure at the top. Beneath it sit the two
 * claim sockets (1st / 2nd place next round) as ordinary action plates — replaced in the final round by the
 * last-round tile, which the rules cover them with (pg. 22). The board face is hardcoded diegetic art; the
 * claim plates carry the live placement affordances.
 */
export function DepartureBoard({
  game,
  aff,
  seatHex,
}: {
  game: RussianRailroadsView;
  aff: PlateAffordances;
  seatHex: (id: string) => string;
}) {
  const nameOf = (seat: number) => game.players[seat]?.name ?? `Seat ${seat}`;
  const lastRound = game.round >= game.rounds;
  const claim1 = actionSpace('turnorder-1');
  const claim2 = actionSpace('turnorder-2');

  return (
    <section aria-label="Turn order" data-testid="rr-turnorder" className="space-y-2">
      <div className="rounded-lg p-3 shadow-sm" style={{ background: '#17181c', color: '#e8e2d4' }}>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: '#c8a24a' }}>
          Departures
        </div>
        <ol className="space-y-1">
          {game.turnOrder.map((seat, i) => (
            <li key={seat} className={cn('flex items-center gap-2 text-sm', i === 0 && 'font-semibold')}>
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-xs font-bold tabular-nums"
                style={{ color: '#c8a24a', border: '1px solid #c8a24a' }}
              >
                {i + 1}
              </span>
              <Meeple className="h-4 w-4 shrink-0 drop-shadow" fill={seatHex(game.players[seat]?.id ?? '')} />
              <span style={{ color: i === 0 ? '#e8e2d4' : '#b9bcc2' }}>{nameOf(seat)}</span>
            </li>
          ))}
        </ol>
      </div>

      {lastRound ? (
        <div
          data-testid="rr-last-round"
          className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-2 text-xs font-medium"
        >
          Last round (pg. 22): the last-round tile covers the turn-order claim spaces — instead, advance 3 industry
          steps (in The Works).
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {claim1 ? <ActionPlate space={claim1} placements={game.actionSpaces[claim1.id] ?? []} aff={aff} /> : null}
          {claim2 ? <ActionPlate space={claim2} placements={game.actionSpaces[claim2.id] ?? []} aff={aff} /> : null}
        </div>
      )}
    </section>
  );
}
