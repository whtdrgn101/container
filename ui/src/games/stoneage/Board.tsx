import { useState } from 'react';
import {
  availableToPlace,
  isGatherPlace,
  isUsePlace,
  placedBy,
  legalActions,
  PLACE_CAPACITY,
  PLACE_RESOURCE,
  PLACES,
  RESOURCE_THRESHOLD,
  RESOURCES,
} from '@game-hub/engine/stoneage';
import type { PlaceId, Resource, StoneAgeView } from '@game-hub/engine/stoneage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BoardProps } from '../types';
import * as stoneageApi from './api';

const PLACE_LABEL: Record<PlaceId, string> = {
  toolMaker: 'Tool maker',
  hut: 'Hut',
  field: 'Field',
  hunt: 'Hunt',
  forest: 'Forest',
  clayPit: 'Clay pit',
  quarry: 'Quarry',
  river: 'River',
};
/** Button labels for the non-dice `USE` places. */
const USE_LABEL: Record<string, string> = { toolMaker: 'Take tool', hut: 'Grow +1', field: 'Field +1' };
const RESOURCE_LABEL: Record<Resource, string> = { wood: 'Wood', brick: 'Brick', stone: 'Stone', gold: 'Gold' };
const RESOURCE_DOT: Record<Resource, string> = {
  wood: 'bg-amber-700',
  brick: 'bg-orange-500',
  stone: 'bg-slate-400',
  gold: 'bg-yellow-400',
};
/** Per-seat player colours (the game's palette: red, blue, green, yellow). */
const SEAT_COLOR = [
  { dot: 'bg-red-500', text: 'text-red-600', ring: 'ring-red-500' },
  { dot: 'bg-blue-500', text: 'text-blue-600', ring: 'ring-blue-500' },
  { dot: 'bg-green-600', text: 'text-green-700', ring: 'ring-green-600' },
  { dot: 'bg-yellow-400', text: 'text-yellow-600', ring: 'ring-yellow-500' },
] as const;

const occupancy = (place: Readonly<Record<string, number>>): number =>
  Object.values(place).reduce((sum, n) => sum + n, 0);

/**
 * Stone Age's board. **Placement phase (roadmap SA1) is live** — on your turn you place people on the
 * board's places; the action/feeding phases and buildings/cards arrive in later stages. The board is
 * still read-only outside the placement phase.
 */
export default function StoneAgeBoard({ gameId, game, bots, controlledIds, viewer, busy, guard, onPayload }: BoardProps<StoneAgeView>) {
  // Draft count per place for the variable places (hunt / resource); fixed places ignore it.
  const [counts, setCounts] = useState<Partial<Record<PlaceId, number>>>({});

  const active = game.players[game.activePlayerIndex];
  const activeIsBot = !!active && bots.includes(active.id);
  const canDrive = !activeIsBot && (!controlledIds || (!!active && controlledIds.includes(active.id)));
  const placing = game.phase === 'placement';
  const acting = game.phase === 'actions';

  const run = (work: () => Promise<stoneageApi.StoneAgePayload>) => guard(async () => onPayload(await work()));
  const doPlace = (place: PlaceId, count: number) => {
    if (!canDrive || !active) return;
    void run(() => stoneageApi.act(gameId, active.id, { type: 'PLACE', place, count }, viewer));
  };
  const doGather = (place: PlaceId) => {
    if (!canDrive || !active) return;
    void run(() => stoneageApi.gather(gameId, active.id, place, viewer));
  };
  const doUse = (place: PlaceId) => {
    if (!canDrive || !active) return;
    void run(() => stoneageApi.act(gameId, active.id, { type: 'USE', place }, viewer));
  };

  // The active player's legal placements, collapsed to a {min,max} per place.
  const placeOptions = new Map<PlaceId, { min: number; max: number }>();
  if (canDrive && placing) {
    for (const a of legalActions(game)) {
      if (a.type !== 'PLACE') continue;
      const cur = placeOptions.get(a.place);
      placeOptions.set(a.place, {
        min: Math.min(cur?.min ?? a.count, a.count),
        max: Math.max(cur?.max ?? a.count, a.count),
      });
    }
  }
  const clampedCount = (place: PlaceId, min: number, max: number) => Math.max(min, Math.min(max, counts[place] ?? min));
  const bump = (place: PlaceId, by: number, min: number, max: number) =>
    setCounts((c) => ({ ...c, [place]: Math.max(min, Math.min(max, (c[place] ?? min) + by)) }));

  const remaining = active ? availableToPlace(game, active.id) : 0;
  const waitingFor = active?.name ?? 'the next player';
  const banner = game.status === 'ended'
    ? 'Game over.'
    : placing
      ? canDrive
        ? `Your turn — place your people (${remaining} still in hand)`
        : `Waiting for ${waitingFor} to place…`
      : acting
        ? canDrive
          ? 'Your turn — gather resources from your places (rolls the dice)'
          : `Waiting for ${waitingFor} to gather…`
        : 'Feeding phase — arrives in a later stage.';

  const playerName = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
  const seatColorOf = (id: string) => SEAT_COLOR[game.players.findIndex((p) => p.id === id) % SEAT_COLOR.length] ?? SEAT_COLOR[0];
  const describeMove = (entry: StoneAgeView['log'][number]): string => {
    const who = playerName(entry.playerId);
    const p = (entry.payload ?? {}) as Record<string, unknown>;
    if (entry.type === 'PLACE') return `${who} placed ${p['count']} on ${PLACE_LABEL[p['place'] as PlaceId]}`;
    if (entry.type === 'GATHER') return `${who} rolled ${(p['dice'] as number[])?.join('+')} → ${p['amount']} ${p['kind']}`;
    if (entry.type === 'USE') {
      const place = p['place'] as PlaceId;
      const effect = place === 'toolMaker' ? 'took a tool' : place === 'hut' ? 'grew (+1 person)' : 'raised food production';
      return `${who} ${effect}`;
    }
    return `${who}: ${entry.type.toLowerCase()}`;
  };

  return (
    <div data-testid="board" className="space-y-4">
      <div
        data-testid="sa-banner"
        className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
      >
        <span className="font-medium">{banner}</span>
        {active && <span className="text-xs text-muted-foreground">{active.name}’s turn</span>}
      </div>

      {/* The board places (pg. 4). During the placement phase the active player can place here. */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Board</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLACES.map((place) => {
            const used = occupancy(game.placements[place]);
            const resource = place in PLACE_RESOURCE ? PLACE_RESOURCE[place as keyof typeof PLACE_RESOURCE] : null;
            const cap = PLACE_CAPACITY[place];
            const option = placeOptions.get(place);
            const mine = !!active && game.placements[place][active.id] !== undefined;
            const canGather = acting && canDrive && mine && isGatherPlace(place);
            const canUse = acting && canDrive && mine && isUsePlace(place);
            return (
              <div key={place} data-testid={`place-${place}`} className="flex flex-col rounded-md border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{PLACE_LABEL[place]}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {used}/{cap === null ? '∞' : cap}
                  </span>
                </div>
                {resource && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', RESOURCE_DOT[resource])} aria-hidden />
                    {RESOURCE_LABEL[resource]} · per full {RESOURCE_THRESHOLD[resource]}
                  </div>
                )}
                {/* Whose people are here. */}
                {used > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                    {Object.entries(game.placements[place]).map(([id, n]) => (
                      <span key={id} className={cn('flex items-center gap-1 font-medium', seatColorOf(id).text)}>
                        <span className={cn('inline-block h-2 w-2 rounded-full', seatColorOf(id).dot)} aria-hidden />
                        {playerName(id)}×{n}
                      </span>
                    ))}
                  </div>
                )}
                {option && (
                  <div className="mt-2 flex items-center gap-1">
                    {option.min !== option.max && (
                      <>
                        <Button size="sm" variant="outline" aria-label="Fewer" data-testid={`place-${place}-dec`} disabled={busy} onClick={() => bump(place, -1, option.min, option.max)}>−</Button>
                        <span className="w-5 text-center text-xs tabular-nums" data-testid={`place-${place}-count`}>
                          {clampedCount(place, option.min, option.max)}
                        </span>
                        <Button size="sm" variant="outline" aria-label="More" data-testid={`place-${place}-inc`} disabled={busy} onClick={() => bump(place, 1, option.min, option.max)}>+</Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      className="ml-auto"
                      data-testid={`place-${place}-go`}
                      disabled={busy}
                      onClick={() => doPlace(place, clampedCount(place, option.min, option.max))}
                    >
                      Place {clampedCount(place, option.min, option.max)}
                    </Button>
                  </div>
                )}
                {canGather && (
                  <Button
                    size="sm"
                    className="mt-2 self-end"
                    data-testid={`gather-${place}`}
                    disabled={busy}
                    onClick={() => doGather(place)}
                  >
                    Gather
                  </Button>
                )}
                {canUse && (
                  <Button
                    size="sm"
                    className="mt-2 self-end"
                    data-testid={`use-${place}`}
                    disabled={busy}
                    onClick={() => doUse(place)}
                  >
                    {USE_LABEL[place]}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Each player's board (pg. 2). */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Players</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {game.players.map((player, seat) => (
            <div
              key={player.id}
              data-testid={`player-${player.id}`}
              className={cn(
                'rounded-lg border bg-card p-3',
                seat === game.activePlayerIndex && cn('ring-2', seatColorOf(player.id).ring),
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={cn('flex items-center gap-1.5 font-medium', seatColorOf(player.id).text)}>
                  <span className={cn('inline-block h-3 w-3 rounded-full', seatColorOf(player.id).dot)} aria-hidden />
                  {player.name}
                </span>
                <span className="text-xs text-muted-foreground" data-testid={`score-${player.id}`}>{player.score} pts</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <span className={cn('inline-block h-2.5 w-2.5 rounded-full', seatColorOf(player.id).dot)} aria-hidden />
                  People: <span className="font-medium tabular-nums">{placedBy(game, player.id)}/{player.people}</span> placed
                </span>
                <span>🍖 Food: <span className="font-medium tabular-nums">{player.food}</span></span>
                <span>🌾 Food track: <span className="font-medium tabular-nums">{player.foodTrack}</span></span>
                <span>🔨 Tools: <span className="font-medium tabular-nums">{player.tools.join(', ') || '—'}</span></span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {RESOURCES.map((resource) => (
                  <span key={resource} className="flex items-center gap-1">
                    <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', RESOURCE_DOT[resource])} aria-hidden />
                    <span className="tabular-nums">{player.resources[resource]}</span>
                  </span>
                ))}
                <span className="text-muted-foreground">· 🃏 {player.civCards.length} · 🏠 {player.buildings}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* A compact activity feed — everything Stone Age logs is public. */}
      {game.log.length > 0 && (
        <ul data-testid="sa-log" className="space-y-0.5 text-xs text-muted-foreground">
          {[...game.log]
            .slice(-6)
            .reverse()
            .map((entry) => (
              <li key={entry.seq}>{describeMove(entry)}</li>
            ))}
        </ul>
      )}
    </div>
  );
}
