import { Ship as ShipIcon } from 'lucide-react';
import type { Action, PlayerView } from '@game-hub/engine/container';
import { SHIP_CAPACITY } from '@game-hub/engine/container';
import { Button } from '@/components/ui/button';
import { ShipSvg } from '../../art/Ship';
import { ContainerChip, sailTarget, shipLabel } from '../../chips';

type SailAction = Extract<Action, { type: 'SAIL' }>;

/**
 * Where each live cargo chip sits on the ship's deck (percent of the ship box) — mirroring the art's
 * 3-across + 2-on-top deck plan. Literal class strings so Tailwind generates them. The chips are the
 * real `cargo-<id>` `ContainerChip`s (exactly one span each — the e2e span-count contract), overlaid
 * on an *empty-deck* `ShipSvg` so nothing renders twice.
 */
const CARGO_SLOTS = [
  'absolute left-[33%] top-[46%] h-[13%] w-[13%]',
  'absolute left-[47%] top-[46%] h-[13%] w-[13%]',
  'absolute left-[61%] top-[46%] h-[13%] w-[13%]',
  'absolute left-[40%] top-[33%] h-[13%] w-[13%]',
  'absolute left-[54%] top-[33%] h-[13%] w-[13%]',
] as const;

export interface DockZoneProps {
  readonly player: PlayerView;
  readonly players: readonly PlayerView[];
  readonly hull: string;
  /** Active + drivable + no forced delivery — gates the sail/load controls living in this zone. */
  readonly showControls: boolean;
  readonly sailActions: readonly SailAction[];
  readonly can: (type: Action['type']) => boolean;
  readonly busy: boolean;
  readonly act: (playerId: string, action: Action) => void;
}

/**
 * The mat's dock (2026-07): the player's ship with its cargo visibly aboard, the location caption
 * (`ship-<id>` keeps the `shipLabel` text), and — on the active mat — the Sail buttons (rendered
 * from `sailActions` only: illegal targets are *absent*, the e2e counts on it) and Load-from-Bank.
 */
export function DockZone({ player, players, hull, showControls, sailActions, can, busy, act }: DockZoneProps) {
  return (
    <div className="rounded-lg bg-sky-500/10 p-2 dark:bg-sky-800/20">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
          <ShipIcon className="h-3.5 w-3.5" aria-hidden /> Dock
        </span>
        <span className="tabular-nums">
          {player.ship.cargo.length} / {SHIP_CAPACITY} aboard
        </span>
      </div>
      <div className="relative mx-auto w-full max-w-52">
        <ShipSvg tint={hull} className="h-auto w-full" />
        <span data-testid={`cargo-${player.id}`} className="absolute inset-0 block">
          {player.ship.cargo.map((color, cargoIndex) => (
            <ContainerChip key={cargoIndex} color={color} className={CARGO_SLOTS[cargoIndex] ?? CARGO_SLOTS[0]} />
          ))}
        </span>
      </div>
      <div className="text-center text-xs font-medium" data-testid={`ship-${player.id}`}>
        At {shipLabel(player.ship.location, players)}
      </div>
      {showControls && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1 border-t border-border/60 pt-2">
          {sailActions.map((sailAction) => {
            const target = sailTarget(sailAction.to, players);
            return (
              <Button
                key={target.testid}
                size="sm"
                variant="outline"
                data-testid={target.testid}
                disabled={busy}
                onClick={() => act(player.id, sailAction)}
              >
                <ShipIcon className="h-4 w-4" aria-hidden /> {target.label}
              </Button>
            );
          })}
          {can('LOAD_FROM_BANK') && (
            <Button
              size="sm"
              variant="outline"
              data-testid="load-bank"
              disabled={busy}
              onClick={() => act(player.id, { type: 'LOAD_FROM_BANK' })}
            >
              Load from Bank
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
