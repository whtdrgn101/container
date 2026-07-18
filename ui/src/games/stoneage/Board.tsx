import { useState } from 'react';
import {
  availableToPlace,
  buildingIndex,
  buildingPaymentError,
  cardIndex,
  HUNT_THRESHOLD,
  isBuildingPlace,
  paymentValue,
  placedBy,
  PLACE_RESOURCE,
  RESOURCE_THRESHOLD,
  RESOURCES,
} from '@game-hub/engine/stoneage';
import type { Building, BuildingCost, CardPlaceId, FixedPlaceId, PlaceId, Resource, StoneAgeView } from '@game-hub/engine/stoneage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GameOver } from '@/components/GameOver';
import { PanZoom } from '@/components/PanZoom';
import type { BoardProps } from '../types';
import * as stoneageApi from './api';
import { CardRow } from './CardRow';
import { BoardMap } from './BoardMap';
import { FieldIcon, Hut, Meeple, ResourceIcon, ToolIcon } from './art';

const PLACE_LABEL: Record<FixedPlaceId, string> = {
  toolMaker: 'Tool maker',
  hut: 'Hut',
  field: 'Field',
  hunt: 'Hunt',
  forest: 'Forest',
  clayPit: 'Clay pit',
  quarry: 'Quarry',
  river: 'River',
};
/** A readable label for any place, including the building slots and card slots. */
const placeLabel = (place: PlaceId): string => {
  if (place in PLACE_LABEL) return PLACE_LABEL[place as FixedPlaceId];
  if (isBuildingPlace(place)) return `Building ${buildingIndex(place) + 1}`;
  return `Card ${cardIndex(place as CardPlaceId) + 1}`;
};
/** A short cost/scoring summary for a building tile. */
const costLabel = (cost: BuildingCost): string => {
  if (cost.kind === 'fixed') return RESOURCES.filter((r) => cost.resources[r]).map((r) => `${cost.resources[r]}× ${RESOURCE_LABEL[r]}`).join(' + ');
  if (cost.kind === 'choice') return `any ${cost.count} from ${cost.kinds} kinds`;
  return `any ${cost.min}–${cost.max} resources`;
};
/** Button labels for the non-dice `USE` places. */
const RESOURCE_LABEL: Record<Resource, string> = { wood: 'Wood', brick: 'Brick', stone: 'Stone', gold: 'Gold' };
/** Per-seat player colours (the game's palette: red, blue, green, yellow). */
const SEAT_COLOR = [
  { dot: 'bg-red-500', text: 'text-red-600', ring: 'ring-red-500' },
  { dot: 'bg-blue-500', text: 'text-blue-600', ring: 'ring-blue-500' },
  { dot: 'bg-green-600', text: 'text-green-700', ring: 'ring-green-600' },
  { dot: 'bg-yellow-400', text: 'text-yellow-600', ring: 'ring-yellow-500' },
] as const;

/**
 * Stone Age's board — the illustrated landscape (`BoardMap`) plus the buildings/cards markets, the
 * player boards, the floating gather panel, and the end-of-game results. The full game is playable
 * (SA1–SA11); the AI bot arrives in SA12.
 */
export default function StoneAgeBoard({ gameId, game, bots, controlledIds, viewer, busy, guard, onPayload, onLeave }: BoardProps<StoneAgeView>) {
  // In-progress building payment, per stack index (the resources you'll pay when you press Build).
  const [pay, setPay] = useState<Record<number, Partial<Record<Resource, number>>>>({});
  // Tools selected to add to the pending dice roll (by index into the player's tools).
  const [selectedTools, setSelectedTools] = useState<number[]>([]);

  const active = game.players[game.activePlayerIndex];
  const activeIsBot = !!active && bots.includes(active.id);
  const canDrive = !activeIsBot && (!controlledIds || (!!active && controlledIds.includes(active.id)));
  const placing = game.phase === 'placement';
  const acting = game.phase === 'actions';
  const feedingPhase = game.phase === 'feeding';

  const run = (work: () => Promise<stoneageApi.StoneAgePayload>) => guard(async () => onPayload(await work()));
  const doPlace = (place: PlaceId, count: number) => {
    if (!canDrive || !active) return;
    void run(() => stoneageApi.act(gameId, active.id, { type: 'PLACE', place, count }, viewer));
  };
  const doGather = (place: PlaceId) => {
    if (!canDrive || !active) return;
    setSelectedTools([]);
    void run(() => stoneageApi.gather(gameId, active.id, place, viewer));
  };
  const toggleTool = (i: number) =>
    setSelectedTools((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  const doTake = (toolIndices: number[]) => {
    if (!canDrive || !active) return;
    setSelectedTools([]);
    void run(() => stoneageApi.act(gameId, active.id, { type: 'TAKE_GATHER', toolIndices }, viewer));
  };
  const doUse = (place: PlaceId) => {
    if (!canDrive || !active) return;
    void run(() => stoneageApi.act(gameId, active.id, { type: 'USE', place }, viewer));
  };
  const doFeed = (payWithResources: boolean) => {
    if (!canDrive || !active) return;
    void run(() => stoneageApi.act(gameId, active.id, { type: 'FEED', payWithResources }, viewer));
  };
  const doBuild = (stack: number, resources: Partial<Record<Resource, number>>) => {
    if (!canDrive || !active) return;
    void run(() => stoneageApi.act(gameId, active.id, { type: 'BUILD', stack, resources }, viewer));
  };
  const doAcquire = (slot: number, resources: Partial<Record<Resource, number>>) => {
    if (!canDrive || !active) return;
    void run(() => stoneageApi.act(gameId, active.id, { type: 'ACQUIRE_CARD', slot, resources }, viewer));
  };
  const bumpPay = (stack: number, resource: Resource, by: number, owned: number) =>
    setPay((prev) => {
      const draft = prev[stack] ?? {};
      const next = Math.max(0, Math.min(owned, (draft[resource] ?? 0) + by));
      return { ...prev, [stack]: { ...draft, [resource]: next } };
    });

  // A rolled gather awaiting the take (SA4b): show the dice, let the player add tools, preview the yield.
  const pending = game.pendingGather;
  const gatherPreview = pending && active
    ? (() => {
        const diceTotal = pending.dice.reduce((sum, d) => sum + d, 0);
        const boost = selectedTools.reduce((sum, i) => sum + (active.tools[i] ?? 0), 0);
        const total = diceTotal + boost;
        const threshold = pending.place === 'hunt' ? HUNT_THRESHOLD : RESOURCE_THRESHOLD[PLACE_RESOURCE[pending.place]];
        const kind = pending.place === 'hunt' ? 'food' : RESOURCE_LABEL[PLACE_RESOURCE[pending.place]];
        return { diceTotal, boost, total, amount: Math.floor(total / threshold), kind };
      })()
    : null;

  // Feeding maths for the active player (pg. 7): food-track production first, then 1 food per person.
  const feed = active
    ? (() => {
        const produced = active.food + active.foodTrack;
        const shortfall = Math.max(0, active.people - produced);
        const resourcesOnHand = RESOURCES.reduce((sum, r) => sum + active.resources[r], 0);
        return { produced, shortfall, canPay: resourcesOnHand >= shortfall };
      })()
    : { produced: 0, shortfall: 0, canPay: true };

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
          ? 'Your turn — use your placed people (gather, take actions, buy buildings)'
          : `Waiting for ${waitingFor} to take their actions…`
        : canDrive
          ? 'Feeding phase — feed your people (1 food each)'
          : `Waiting for ${waitingFor} to feed…`;

  const playerName = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
  const seatColorOf = (id: string) => SEAT_COLOR[game.players.findIndex((p) => p.id === id) % SEAT_COLOR.length] ?? SEAT_COLOR[0];
  /** A row of worker figures for the people on a place, each tinted to its owner (with an SR label). */
  const meeplesFor = (byPlayer: Readonly<Record<string, number>>) =>
    Object.entries(byPlayer).map(([id, n]) => (
      <span key={id} className="flex items-center gap-0.5" title={`${playerName(id)} ×${n}`}>
        {Array.from({ length: n }, (_, k) => <Meeple key={k} className={cn('h-4 w-4 drop-shadow-sm', seatColorOf(id).text)} />)}
        <span className="sr-only">{playerName(id)} ×{n}</span>
      </span>
    ));
  const describeMove = (entry: StoneAgeView['log'][number]): string => {
    const who = playerName(entry.playerId);
    const p = (entry.payload ?? {}) as Record<string, unknown>;
    if (entry.type === 'PLACE') return `${who} placed ${p['count']} on ${placeLabel(p['place'] as PlaceId)}`;
    if (entry.type === 'GATHER') return `${who} rolled ${(p['dice'] as number[])?.join('+')} at ${placeLabel(p['place'] as PlaceId)}`;
    if (entry.type === 'TAKE') {
      const boost = p['boost'] as number;
      return `${who} took ${p['amount']} ${p['kind']}${boost > 0 ? ` (+${boost} from tools)` : ''}`;
    }
    if (entry.type === 'USE') {
      const place = p['place'] as PlaceId;
      const effect = place === 'toolMaker' ? 'took a tool' : place === 'hut' ? 'grew (+1 person)' : 'raised food production';
      return `${who} ${effect}`;
    }
    if (entry.type === 'FEED') {
      if (p['starved'] !== undefined) return `${who} went hungry — −${p['penalty']} points`;
      if (p['paidResources'] !== undefined) return `${who} fed ${p['need']} people (${p['paidResources']} from resources)`;
      return `${who} fed ${p['need']} people`;
    }
    if (entry.type === 'BUILD') {
      if (p['declined']) return `${who} passed on a building`;
      return `${who} built (+${p['points']} points)`;
    }
    if (entry.type === 'ACQUIRE_CARD') {
      if (p['declined']) return `${who} passed on a card`;
      return `${who} took a civilization card`;
    }
    return `${who}: ${entry.type.toLowerCase()}`;
  };

  return (
    <div data-testid="board" className="space-y-4">
      {game.status === 'ended' && game.results && (
        <GameOver winnerNames={game.winnerIds.map((id) => playerName(id))} onNewGame={onLeave}>
          <table className="w-full text-sm" data-testid="sa-results">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Player</th>
                <th className="px-1 font-medium">Cards²</th>
                <th className="px-1 font-medium">Farm</th>
                <th className="px-1 font-medium">Tools</th>
                <th className="px-1 font-medium">Build</th>
                <th className="px-1 font-medium">Shaman</th>
                <th className="px-1 font-medium">Res</th>
                <th className="pl-1 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...game.results]
                .sort((a, b) => b.total - a.total)
                .map((r) => (
                  <tr key={r.playerId} data-testid={`sa-result-${r.playerId}`} className="border-t">
                    <td className={cn('py-1 pr-2 font-medium', seatColorOf(r.playerId).text)}>{playerName(r.playerId)}</td>
                    <td className="px-1 tabular-nums text-muted-foreground">{r.breakdown.green}</td>
                    <td className="px-1 tabular-nums text-muted-foreground">{r.breakdown.farmers}</td>
                    <td className="px-1 tabular-nums text-muted-foreground">{r.breakdown.toolMakers}</td>
                    <td className="px-1 tabular-nums text-muted-foreground">{r.breakdown.builders}</td>
                    <td className="px-1 tabular-nums text-muted-foreground">{r.breakdown.shamen}</td>
                    <td className="px-1 tabular-nums text-muted-foreground">{r.breakdown.resources}</td>
                    <td className="pl-1 text-right font-semibold tabular-nums">{r.total}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </GameOver>
      )}
      <div
        data-testid="sa-banner"
        className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
      >
        <span className="font-medium">{banner}</span>
        {active && <span className="text-xs text-muted-foreground">{active.name}’s turn</span>}
      </div>

      {/* Feeding phase (pg. 7): pay 1 food per person; cover any shortfall with resources or take −10. */}
      {feedingPhase && canDrive && active && (
        <div data-testid="feed-panel" className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
          <span>
            {active.name} needs <span className="font-medium tabular-nums">{active.people}</span> food · has{' '}
            <span className="font-medium tabular-nums">{feed.produced}</span>
            {active.foodTrack > 0 && <span className="text-muted-foreground"> (incl. +{active.foodTrack} produced)</span>}
          </span>
          {feed.shortfall === 0 ? (
            <Button size="sm" className="ml-auto" data-testid="feed-go" disabled={busy} onClick={() => doFeed(true)}>
              Feed people
            </Button>
          ) : (
            <span className="ml-auto flex items-center gap-2">
              <span className="text-destructive">short {feed.shortfall}</span>
              {feed.canPay && (
                <Button size="sm" data-testid="feed-go" disabled={busy} onClick={() => doFeed(true)}>
                  Pay {feed.shortfall} resources
                </Button>
              )}
              <Button size="sm" variant="outline" data-testid="feed-penalty" disabled={busy} onClick={() => doFeed(false)}>
                Take −10
              </Button>
            </span>
          )}
        </div>
      )}

      {/* The board (pg. 4) as an illustrated landscape you place workers on. Zoomable/pannable for small
          screens; the gather panel floats over it during the action phase (SA13). */}
      <div className="relative">
        <PanZoom className="h-[26rem] w-full rounded-xl border border-amber-900/20 shadow-sm sm:h-[30rem]" maxScale={3}>
          <BoardMap
            game={game}
            canDrive={canDrive}
            busy={busy}
            onPlace={(place, count) => doPlace(place, count)}
            onGather={(place) => doGather(place)}
            onUse={(place) => doUse(place)}
            seatColorOf={seatColorOf}
            playerName={playerName}
          />
        </PanZoom>

        {/* The gather panel floats over the board during the action phase (SA13). */}
        {pending && gatherPreview && canDrive && active && (
          <div className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-background/60 p-3 backdrop-blur-sm">
            <div data-testid="gather-panel" className="reveal-in w-full max-w-md space-y-2 rounded-lg border bg-card p-3 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Gathering — {placeLabel(pending.place)}</span>
                <span className="text-xs text-muted-foreground">
                  rolled {pending.dice.length} {pending.dice.length === 1 ? 'die' : 'dice'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {pending.dice.map((d, i) => (
                  // eslint-disable-next-line react/no-array-index-key -- dice are positional
                  <span key={i} data-testid={`die-${i}`} className="grid h-8 w-8 place-items-center rounded-md border-2 border-amber-900/30 bg-[#f6efe0] text-sm font-bold tabular-nums text-amber-950 shadow-inner">
                    {d}
                  </span>
                ))}
                <span className="ml-1 text-sm text-muted-foreground">
                  = {gatherPreview.diceTotal}
                  {gatherPreview.boost > 0 && ` + ${gatherPreview.boost} tools = ${gatherPreview.total}`}
                </span>
              </div>
              {active.tools.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground"><ToolIcon className="h-3.5 w-3.5" /> Add tools:</span>
                  {active.tools.map((value, i) => {
                    const toolUsed = active.toolsUsed[i];
                    const selected = selectedTools.includes(i);
                    return (
                      <Button key={i} size="sm" variant={selected ? 'default' : 'outline'} data-testid={`tool-${i}`} aria-pressed={selected} disabled={busy || toolUsed} title={toolUsed ? 'Already used this round' : `Tool +${value}`} onClick={() => toggleTool(i)}>
                        +{value}{toolUsed ? ' ·used' : ''}
                      </Button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-sm">
                  →{' '}
                  <span className="font-medium" data-testid="gather-yield">{gatherPreview.amount} {gatherPreview.kind}</span>
                </span>
                <Button size="sm" data-testid="take-gather" disabled={busy} onClick={() => doTake(selectedTools)}>Take</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The building stacks (pg. 5, 7): place a worker on a stack's top tile, then buy it in the action
          phase. `?? []` keeps pre-SA9 games (created before buildings existed, no `buildings` field) from
          crashing the board — they simply show no Buildings row. */}
      {(game.buildings ?? []).length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Buildings</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(game.buildings ?? []).map((stack, i) => {
              const placeId = `building${i + 1}` as PlaceId;
              const top: Building | undefined = stack[0];
              const occupants = Object.entries(game.placements[placeId] ?? {});
              const mineHere = !!active && (game.placements[placeId]?.[active.id] ?? undefined) !== undefined;
              const canPlaceHere = canDrive && placing && !!top && occupants.length === 0 && !!active && availableToPlace(game, active.id) >= 1;
              const draft = pay[i] ?? {};
              const draftCount = RESOURCES.reduce((sum, r) => sum + (draft[r] ?? 0), 0);
              const canBuild = acting && canDrive && mineHere && !!top && !!active && draftCount > 0 && buildingPaymentError(top, draft, active) === null;
              return (
                <div key={placeId} data-testid={`place-${placeId}`} className="flex flex-col rounded-md border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Building {i + 1}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{stack.length} left</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Hut className="h-3.5 w-3.5" /> {top ? costLabel(top.cost) : 'empty'}</div>
                  {occupants.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-0.5">{meeplesFor(game.placements[placeId] ?? {})}</div>}
                  {canPlaceHere && (
                    <Button size="sm" className="mt-2 self-end" data-testid={`place-${placeId}-go`} disabled={busy} onClick={() => doPlace(placeId, 1)}>
                      Place worker
                    </Button>
                  )}
                  {acting && canDrive && mineHere && top && active && !pending && (
                    <div className="mt-2 space-y-1.5 border-t pt-2">
                      {RESOURCES.filter((r) => active.resources[r] > 0).map((r) => (
                        <div key={r} className="flex items-center gap-1 text-xs">
                          <ResourceIcon resource={r} className="h-4 w-4" />
                          <span className="w-9">{RESOURCE_LABEL[r]}</span>
                          <Button size="sm" variant="outline" aria-label={`Less ${r}`} data-testid={`pay-${i}-${r}-dec`} disabled={busy} onClick={() => bumpPay(i, r, -1, active.resources[r])}>−</Button>
                          <span className="w-4 text-center tabular-nums" data-testid={`pay-${i}-${r}`}>{draft[r] ?? 0}</span>
                          <Button size="sm" variant="outline" aria-label={`More ${r}`} data-testid={`pay-${i}-${r}-inc`} disabled={busy} onClick={() => bumpPay(i, r, 1, active.resources[r])}>+</Button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-1 pt-1">
                        <span className="text-xs text-muted-foreground" data-testid={`build-value-${i}`}>+{paymentValue(draft)} pts</span>
                        <span className="flex gap-1">
                          <Button size="sm" variant="outline" data-testid={`decline-${i}`} disabled={busy} onClick={() => doBuild(i, {})}>Pass</Button>
                          <Button size="sm" data-testid={`build-${i}`} disabled={busy || !canBuild} onClick={() => doBuild(i, draft)}>Build</Button>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* The civilization-card display (pg. 4, 6, SA10) — its own component to keep this file small. */}
      <CardRow
        game={game}
        active={active}
        canDrive={canDrive}
        placing={placing}
        acting={acting}
        pending={!!pending}
        busy={busy}
        onPlace={(place) => doPlace(place, 1)}
        onAcquire={doAcquire}
        playerName={playerName}
        seatColorOf={seatColorOf}
      />

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
                  <Meeple className={cn('h-3.5 w-3.5', seatColorOf(player.id).text)} />
                  People: <span className="font-medium tabular-nums">{placedBy(game, player.id)}/{player.people}</span> placed
                </span>
                <span>🍖 Food: <span className="font-medium tabular-nums">{player.food}</span></span>
                <span className="flex items-center gap-1"><FieldIcon className="h-3.5 w-3.5" /> Food track: <span className="font-medium tabular-nums">{player.foodTrack}</span></span>
                <span className="flex items-center gap-1"><ToolIcon className="h-3.5 w-3.5" /> Tools: <span className="font-medium tabular-nums">{player.tools.join(', ') || '—'}</span></span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {RESOURCES.map((resource) => (
                  <span key={resource} className="flex items-center gap-1">
                    <ResourceIcon resource={resource} className="h-4 w-4" />
                    <span className="tabular-nums">{player.resources[resource]}</span>
                  </span>
                ))}
                <span className="flex items-center gap-1 text-muted-foreground">· 🃏 {player.civCards.length} · <Hut className="h-3.5 w-3.5" /> {player.buildings}</span>
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
