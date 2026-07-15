import type { Action, GameState, PlayerState, ShipLocation } from '@container/engine';
import { ShipSvg } from '@/components/art/Ship';
import { cn } from '@/lib/utils';

/** Distinct hull tints per seat, so each player's ship reads apart on the water. */
const SHIP_TINTS = ['#4f46e5', '#0d9488', '#e11d48', '#d97706', '#7c3aed'];

type SailAction = Extract<Action, { type: 'SAIL' }>;

/** Stable key for a ship location, used to match ships and sail targets to board nodes. */
function locKey(loc: ShipLocation): string {
  switch (loc.kind) {
    case 'ocean':
      return 'ocean';
    case 'island':
      return 'island';
    case 'bank':
      return 'bank';
    case 'harbor':
      return `harbor:${loc.playerId}`;
  }
}

type Node = { key: string; left: number; top: number; label: string; testid: string };

/** Percentage-positioned board nodes: the fixed locations plus one harbor per player. */
function boardNodes(players: readonly PlayerState[]): Node[] {
  const n = players.length;
  const harbors = players.map((p, i) => ({
    key: `harbor:${p.id}`,
    left: n === 1 ? 50 : 12 + (76 * i) / (n - 1),
    top: 84,
    label: `${p.name}'s harbor`,
    testid: `board-sail-harbor-${p.id}`,
  }));
  return [
    { key: 'island', left: 50, top: 25, label: 'Container Island', testid: 'board-sail-island' },
    { key: 'bank', left: 86, top: 22, label: 'Off-Shore Bank', testid: 'board-sail-bank' },
    { key: 'ocean', left: 50, top: 57, label: 'Open ocean', testid: 'board-sail-ocean' },
    ...harbors,
  ];
}

/** An original island glyph: a green landmass on a sandy shoal with a palm. */
function IslandGlyph() {
  return (
    <svg viewBox="0 0 64 44" className="h-full w-full" aria-hidden focusable="false">
      <ellipse cx="32" cy="34" rx="28" ry="8" fill="#fcd34d" opacity="0.9" />
      <ellipse cx="32" cy="30" rx="21" ry="9" fill="#22c55e" />
      <ellipse cx="32" cy="26" rx="13" ry="7" fill="#16a34a" />
      <rect x="31" y="10" width="2.5" height="14" rx="1" fill="#78350f" />
      <g fill="#15803d">
        <path d="M32 11 Q22 6 15 11 Q24 10 32 14 Z" />
        <path d="M32 11 Q42 6 49 11 Q40 10 32 14 Z" />
        <path d="M32 10 Q30 3 24 3 Q31 6 32 13 Z" />
        <path d="M32 10 Q34 3 40 3 Q33 6 32 13 Z" />
      </g>
    </svg>
  );
}

/** An original off-shore bank glyph: a small pillared building on a platform. */
function BankGlyph() {
  return (
    <svg viewBox="0 0 48 44" className="h-full w-full" aria-hidden focusable="false">
      <rect x="4" y="34" width="40" height="6" rx="1.5" fill="#64748b" />
      <path d="M24 8 L42 18 H6 Z" fill="#cbd5e1" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <rect x="8" y="18" width="32" height="3" fill="#94a3b8" />
      <g fill="#e2e8f0" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8">
        <rect x="10" y="21" width="4" height="13" />
        <rect x="18" y="21" width="4" height="13" />
        <rect x="26" y="21" width="4" height="13" />
        <rect x="34" y="21" width="4" height="13" />
      </g>
      <text x="24" y="16" textAnchor="middle" fontSize="7" fill="#334155" fontWeight="bold">
        $
      </text>
    </svg>
  );
}

/** A small dock/pier glyph marking a player's harbor. */
function HarborGlyph({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 40 24" className="h-full w-full" aria-hidden focusable="false">
      <rect x="4" y="9" width="26" height="4" rx="1" fill={active ? '#f59e0b' : '#94a3b8'} />
      <g fill={active ? '#b45309' : '#64748b'}>
        <rect x="7" y="13" width="2.5" height="8" />
        <rect x="16" y="13" width="2.5" height="8" />
        <rect x="25" y="13" width="2.5" height="8" />
      </g>
      <rect x="28" y="5" width="8" height="4" rx="1" fill={active ? '#f59e0b' : '#94a3b8'} />
    </svg>
  );
}

export function BoardMap({
  game,
  sailActions,
  onSail,
  busy,
}: {
  game: GameState;
  sailActions: readonly SailAction[];
  onSail: (action: SailAction) => void;
  busy: boolean;
}) {
  const nodes = boardNodes(game.players);
  const activeId = game.players[game.activePlayerIndex]?.id;

  // Group ships by the node they occupy so several ships at one place fan out instead of overlapping.
  const shipsByNode = new Map<string, PlayerState[]>();
  for (const p of game.players) {
    const key = locKey(p.ship.location);
    const list = shipsByNode.get(key) ?? [];
    list.push(p);
    shipsByNode.set(key, list);
  }

  const sailFor = (nodeKey: string) => (busy ? undefined : sailActions.find((a) => locKey(a.to) === nodeKey));

  return (
    <div
      data-testid="board-map"
      role="img"
      aria-label="Game board showing each player's ship and the sea lanes between harbors, the Container Island, and the Off-Shore Bank"
      className="relative mb-4 aspect-[3/2] w-full overflow-hidden rounded-xl border shadow-sm sm:aspect-[5/2]"
    >
      {/* Ocean */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-200 to-sky-400 dark:from-sky-900 dark:to-slate-900" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
        <g stroke="#ffffff" strokeWidth="0.3" opacity="0.25" fill="none">
          <path d="M0 12 q5 -1.5 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0" />
          <path d="M0 22 q5 -1.5 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0" />
          <path d="M0 32 q5 -1.5 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0" />
        </g>
      </svg>

      {/* Location nodes */}
      {nodes.map((node) => {
        const sail = sailFor(node.key);
        const clickable = !!sail;
        const glyph =
          node.key === 'island' ? (
            <IslandGlyph />
          ) : node.key === 'bank' ? (
            <BankGlyph />
          ) : node.key === 'ocean' ? null : (
            <HarborGlyph active={node.key === `harbor:${activeId}`} />
          );
        const isOcean = node.key === 'ocean';
        return (
          <button
            key={node.key}
            type="button"
            data-testid={node.testid}
            title={clickable ? `Sail to ${node.label}` : node.label}
            aria-label={clickable ? `Sail to ${node.label}` : node.label}
            disabled={!clickable}
            onClick={() => sail && onSail(sail)}
            className={cn(
              'group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1',
              clickable ? 'cursor-pointer' : 'cursor-default',
            )}
            style={{ left: `${node.left}%`, top: `${node.top}%` }}
          >
            {glyph && (
              <span
                className={cn(
                  'block h-9 w-12 rounded-md transition-transform sm:h-11 sm:w-16',
                  clickable && 'motion-safe:group-hover:scale-110',
                  clickable && 'ring-2 ring-amber-400 ring-offset-1',
                )}
              >
                {glyph}
              </span>
            )}
            {isOcean && (
              <span
                className={cn(
                  'block h-3 w-16 rounded-full border-2 border-dashed border-white/50 transition-transform sm:w-24',
                  clickable && 'border-amber-400 motion-safe:group-hover:scale-110',
                )}
              />
            )}
            <span
              className={cn(
                'whitespace-nowrap rounded px-1 text-[9px] font-medium leading-tight sm:text-[10px]',
                'bg-black/30 text-white',
              )}
            >
              {node.label}
            </span>
          </button>
        );
      })}

      {/* Ships */}
      {nodes.map((node) => {
        const ships = shipsByNode.get(node.key) ?? [];
        return ships.map((p, i) => {
          const seat = game.players.indexOf(p);
          const isActive = p.id === activeId;
          // Fan ships out horizontally when several share a node.
          const spread = (i - (ships.length - 1) / 2) * 26;
          return (
            <div
              key={p.id}
              data-testid={`board-ship-${p.id}`}
              title={`${p.name} — ${p.ship.cargo.length} cargo`}
              className="pointer-events-none absolute flex flex-col items-center motion-safe:transition-[left,top] motion-safe:duration-700 motion-safe:ease-in-out"
              style={{
                left: `calc(${node.left}% + ${spread}px)`,
                top: `calc(${node.top}% - 20px)`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className={cn('block h-6 w-10 drop-shadow sm:h-7 sm:w-12', isActive && 'motion-safe:animate-pulse')}>
                <ShipSvg tint={SHIP_TINTS[seat % SHIP_TINTS.length]} />
              </span>
              <span
                className={cn(
                  'mt-0.5 rounded px-1 text-[8px] font-semibold leading-none sm:text-[9px]',
                  isActive ? 'bg-amber-400 text-black' : 'bg-black/40 text-white',
                )}
              >
                {p.name}
                {p.ship.cargo.length > 0 ? ` ·${p.ship.cargo.length}` : ''}
              </span>
            </div>
          );
        });
      })}
    </div>
  );
}
