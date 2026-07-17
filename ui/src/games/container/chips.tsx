import type { Color, PlayerView, ScoringCard, ShipLocation, StoredContainer } from '@game-hub/engine/container';
import { FACTORY_LOT_PRICES } from '@game-hub/engine/container';
import { ContainerSvg } from './art/Container';
import { cn } from '@/lib/utils';

/**
 * Container's small shared pieces: the container glyphs and the label helpers its panels all need.
 * Everything here is Container's own vocabulary — colors, lots, ships, scoring cards — so it lives
 * inside the plugin rather than in the shell's component folder.
 */

/** Display colors for the five container types (see engine COLORS). */
export const COLOR_HEX: Record<Color, string> = {
  white: '#f8fafc',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#eab308',
};

export const LOT_LABELS = ['I', 'II', 'III'];

/**
 * A single container glyph sized like the old colored swatch (h-4 w-6). Rendered as a
 * `<span title={color}>` so e2e selectors that count `span[title]` / `span` keep working.
 */
export function ContainerChip({ color, className }: { color: Color; className?: string }) {
  return (
    <span title={color} className={cn('inline-flex h-4 w-6 shrink-0', className)}>
      <ContainerSvg color={COLOR_HEX[color]} />
    </span>
  );
}

export const nameOf = (players: readonly PlayerView[], id: string) => players.find((p) => p.id === id)?.name ?? id;

/** Sort rank for a color on a scoring card ($10 color first, then the two-value color, then $6/$4/$2). */
export const cardRank = (card: ScoringCard, color: Color) => (color === card.twoValueColor ? 9 : card.values[color]);

/** Human-readable ship location, e.g. "Ocean" or "Bob's harbor". */
export function shipLabel(location: ShipLocation, players: readonly PlayerView[]): string {
  switch (location.kind) {
    case 'ocean':
      return 'Ocean';
    case 'island':
      return 'Container Island';
    case 'bank':
      return 'Off-Shore Bank';
    case 'harbor':
      return `${nameOf(players, location.playerId)}'s harbor`;
  }
}

/** Short label + testid suffix for a sail button target. */
export function sailTarget(location: ShipLocation, players: readonly PlayerView[]): { label: string; testid: string } {
  switch (location.kind) {
    case 'ocean':
      return { label: 'Ocean', testid: 'sail-ocean' };
    case 'island':
      return { label: 'Island', testid: 'sail-island' };
    case 'bank':
      return { label: 'Bank', testid: 'sail-bank' };
    case 'harbor':
      return { label: nameOf(players, location.playerId), testid: `sail-harbor-${location.playerId}` };
  }
}

/** Next factory lot price, wrapping around the track. */
export function nextFactoryLot(price: number): number {
  const index = FACTORY_LOT_PRICES.indexOf(price as (typeof FACTORY_LOT_PRICES)[number]);
  return FACTORY_LOT_PRICES[(index + 1) % FACTORY_LOT_PRICES.length]!;
}

export function StoredChip({
  container,
  testid,
  onClick,
  disabled,
  selected,
}: {
  container: StoredContainer;
  testid: string;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const swatch = (
    <span
      className={cn(
        'inline-flex h-4 w-6 rounded-sm',
        selected && 'ring-2 ring-ring ring-offset-1',
      )}
    >
      <ContainerSvg color={COLOR_HEX[container.color]} />
    </span>
  );
  const label = <span className="text-[10px] leading-none tabular-nums text-muted-foreground">${container.price}</span>;
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testid}
        title={`Reprice ${container.color} (1 action)`}
        disabled={disabled}
        onClick={onClick}
        className="flex flex-col items-center gap-0.5 rounded transition-transform hover:scale-110 disabled:opacity-50"
      >
        {swatch}
        {label}
      </button>
    );
  }
  return (
    <span data-testid={testid} className="flex flex-col items-center gap-0.5">
      {swatch}
      {label}
    </span>
  );
}
