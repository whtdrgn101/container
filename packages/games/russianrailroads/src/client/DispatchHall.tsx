import { ACTION_SPACES, spaceAvailable } from '../engine';
import type { ActionSpaceKind, RussianRailroadsView } from '../engine';
import { ActionPlate } from './ActionPlate';
import type { PlateAffordances } from './ActionPlate';
import { DepartureBoard } from './DepartureBoard';

/**
 * The shared board — **"The Dispatch Hall"** (RR9, comps rev 4). The action spaces are cream enamel plates
 * grouped under iron-chrome headers (Track Gangs / Roundhouse / The Works / Stores), with the turn-order
 * departure board beside them. A thin muted clerestory skyline tops the hall. The group headers are the
 * mobile accordion seams (native `<details>`), so the hall collapses cleanly at 320px.
 *
 * The board surface is diegetic hardcoded art; the plates carry the live placement affordances (`aff`).
 */

/** The four iron-chrome groups, and which action-space kinds each collects (turn-order lives on the board). */
const GROUPS: readonly { readonly label: string; readonly kinds: readonly ActionSpaceKind[] }[] = [
  { label: 'Track Gangs', kinds: ['track'] },
  { label: 'Roundhouse', kinds: ['locomotive'] },
  { label: 'The Works', kinds: ['industry'] },
  { label: 'Stores', kinds: ['coins', 'doubler', 'temp-workers'] },
];

/** A muted clerestory skyline strip — decorative depth above the hall (stretch-safe, hardcoded). */
function Skyline() {
  return (
    <svg
      viewBox="0 0 100 8"
      preserveAspectRatio="none"
      aria-hidden
      className="h-4 w-full rounded-t-lg"
      style={{ display: 'block' }}
    >
      <rect width="100" height="8" fill="#2b2d32" />
      <g fill="#3a3d43">
        <rect x="4" y="3" width="6" height="5" />
        <rect x="12" y="1.5" width="3" height="6.5" />
        <rect x="20" y="4" width="8" height="4" />
        <rect x="34" y="2.5" width="4" height="5.5" />
        <rect x="42" y="4.5" width="10" height="3.5" />
        <rect x="58" y="1" width="3" height="7" />
        <rect x="66" y="3.5" width="7" height="4.5" />
        <rect x="78" y="2.8" width="5" height="5.2" />
        <rect x="88" y="4" width="9" height="4" />
      </g>
    </svg>
  );
}

/** One iron-chrome group: a `<details>` whose summary is the header (the mobile accordion seam). */
function HallGroup({
  label,
  spaces,
  game,
  aff,
}: {
  label: string;
  spaces: readonly (typeof ACTION_SPACES)[number][];
  game: RussianRailroadsView;
  aff: PlateAffordances;
}) {
  if (spaces.length === 0) return null;
  return (
    <details open className="overflow-hidden rounded-lg border" style={{ borderColor: '#17181c' }}>
      <summary
        className="cursor-pointer list-none px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em]"
        style={{ background: 'linear-gradient(180deg,#3a3d43,#2b2d32)', color: '#c9ced6' }}
      >
        {label}
      </summary>
      <div className="grid gap-2 p-2 sm:grid-cols-2" style={{ background: '#2b2d32' }}>
        {spaces.map((space) => (
          <ActionPlate key={space.id} space={space} placements={game.actionSpaces[space.id] ?? []} aff={aff} />
        ))}
      </div>
    </details>
  );
}

export function DispatchHall({
  game,
  aff,
  seatHex,
}: {
  game: RussianRailroadsView;
  aff: PlateAffordances;
  seatHex: (id: string) => string;
}) {
  const available = ACTION_SPACES.filter((space) => spaceAvailable(space, game.round, game.rounds));
  return (
    <section aria-label="The Dispatch Hall" className="space-y-3">
      <Skyline />
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          {GROUPS.map((group) => (
            <HallGroup
              key={group.label}
              label={group.label}
              spaces={available.filter((s) => group.kinds.includes(s.kind))}
              game={game}
              aff={aff}
            />
          ))}
        </div>
        <DepartureBoard game={game} aff={aff} seatHex={seatHex} />
      </div>
    </section>
  );
}
