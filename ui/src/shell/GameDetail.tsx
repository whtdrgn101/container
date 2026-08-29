import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Card, CardContent, cn } from '@game-hub/ui-kit';
import { GameIcon } from '@/shell/GameIcon';
import { TableOptions } from '@/shell/TableOptions';
import { swatchColor } from '@/shell/WaitingRoom';
import type { AnyGameClient } from '@/games/registry';
import type { GameInfo } from '@/lib/api';
import type { TableOptions as TableOptionValues } from '@game-hub/kernel';

/**
 * A game's detail screen (Card Table redesign): the box lid writ large — the game's mark, name, player
 * count, description and "how to play" — with two clearly separated ways to sit down:
 *
 *   • **Pass and play** → the hotseat seat form (names, bot seats + difficulty tiers, colour picks).
 *   • **Play online**  → create a shared table (player count → create → share the code).
 *
 * Every capability of the old combined landing form is preserved verbatim; this only splits the two paths
 * behind a mode toggle (pass-and-play is the default, the zero-setup path for a room around one table).
 * **Game-agnostic** (roadmap C2): the description/rules/mark come from the game's own UI plugin (via the
 * registry, passed in as `client`); the palette and difficulty tiers come from the server catalog entry.
 */
export interface GameDetailProps {
  readonly selected: GameInfo;
  /** The game's UI plugin, for its mark/description/rules. From the registry; the shell names no game. */
  readonly client: AnyGameClient | undefined;
  readonly busy: boolean;
  readonly onBack: () => void;

  /**
   * The table's rule variants (kernel 1.5.0) and their setter. Shared by both ways of sitting down —
   * house rules are a property of the game being dealt, not of how the players got to the table — so
   * they render once, above the mode panels. A game that declares none renders nothing.
   */
  readonly tableOptions: TableOptionValues;
  readonly onTableOptionsChange: (values: TableOptionValues) => void;

  // Play online (shared lobby).
  readonly lobbySeats: number;
  readonly onLobbySeatsChange: (seats: number) => void;
  readonly onCreateLobby: () => void;

  // Pass and play (hotseat).
  readonly names: string[];
  readonly seatIsBot: boolean[];
  readonly seatColors: (string | undefined)[];
  readonly seatDifficulties: (string | undefined)[];
  readonly onNamesChange: (names: string[]) => void;
  readonly onSeatIsBotChange: (flags: boolean[]) => void;
  readonly onSeatColorsChange: (colors: (string | undefined)[]) => void;
  readonly onSeatDifficultiesChange: (difficulties: (string | undefined)[]) => void;
  readonly onStartHotseat: () => void;
  /** Fallback name for a newly added hotseat seat. */
  readonly nameForSeat: (index: number) => string;
}

export function GameDetail({
  selected,
  client,
  busy,
  onBack,
  tableOptions,
  onTableOptionsChange,
  lobbySeats,
  onLobbySeatsChange,
  onCreateLobby,
  names,
  seatIsBot,
  seatColors,
  seatDifficulties,
  onNamesChange,
  onSeatIsBotChange,
  onSeatColorsChange,
  onSeatDifficultiesChange,
  onStartHotseat,
  nameForSeat,
}: GameDetailProps) {
  // Pass-and-play is the default: a games room around one table starts there, and it's the zero-setup
  // path. "Play online" swaps in the shared-table panel.
  const [mode, setMode] = useState<'hotseat' | 'online'>('hotseat');

  const minPlayers = selected.minPlayers;
  const maxPlayers = selected.maxPlayers;
  // The game's player-colour palette and AI difficulty tiers, from its catalog entry. Empty ⇒ that
  // affordance simply doesn't render (a game with no tiers shows exactly the pre-CS4 setup).
  const palette = selected.colors ?? [];
  const botTiers = selected.botDifficulties ?? [];

  return (
    <div className="mx-auto max-w-md space-y-4" data-testid="game-detail">
      <Button
        variant="ghost"
        size="sm"
        data-testid="back-to-shelf"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground"
      >
        <span aria-hidden>←</span> Back to the shelf
      </Button>

      {/* The box lid, writ large. */}
      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0 overflow-hidden rounded-xl border-2 border-wood/30 shadow-md">
          <GameIcon Icon={client?.Icon} initial={selected.name.slice(0, 1)} className="aspect-square h-auto w-full" />
        </div>
        <div className="min-w-0 space-y-1 pt-1">
          <h2 className="font-display text-2xl leading-tight font-semibold text-ink">{selected.name}</h2>
          <p className="text-xs font-medium text-muted-foreground">
            {minPlayers}–{maxPlayers} players
          </p>
          <p className="text-sm text-muted-foreground" data-testid="game-blurb">
            <span className="sr-only">{selected.name} — </span>
            {client?.blurb ?? `${selected.name}.`}
          </p>
        </div>
      </div>

      {client?.rules && client.rules.length > 0 && (
        <details className="text-sm" data-testid="how-to-play">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            How to play
          </summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {client.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      )}

      {/* Two clearly separated ways to sit down. */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="How to play">
        <Button
          variant={mode === 'hotseat' ? 'default' : 'outline'}
          data-testid="mode-hotseat"
          aria-pressed={mode === 'hotseat'}
          disabled={busy}
          onClick={() => setMode('hotseat')}
        >
          Pass and play
        </Button>
        <Button
          variant={mode === 'online' ? 'default' : 'outline'}
          data-testid="mode-online"
          aria-pressed={mode === 'online'}
          disabled={busy}
          onClick={() => setMode('online')}
        >
          Play online
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          {/*
            House rules first, above the fork: they apply to a hotseat table and a shared one alike, and
            deciding them is the first thing a table does. Built entirely from the game's catalog entry —
            the shell names no option and knows no game.
          */}
          <TableOptions
            specs={selected.tableOptions ?? []}
            values={tableOptions}
            onChange={onTableOptionsChange}
            busy={busy}
          />
          {mode === 'online' ? (
            <div className="space-y-2" data-testid="online-panel">
              <div className="font-display text-base font-semibold text-ink">Create a shared table</div>
              <p className="text-xs text-muted-foreground">
                Make a room and share the code — each player joins from their own device and names their seat.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Players</span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Fewer players"
                  data-testid="seats-dec"
                  disabled={busy || lobbySeats <= minPlayers}
                  onClick={() => onLobbySeatsChange(Math.max(minPlayers, lobbySeats - 1))}
                >
                  −
                </Button>
                <span data-testid="seat-count" className="w-5 text-center text-sm tabular-nums">
                  {lobbySeats}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="More players"
                  data-testid="seats-inc"
                  disabled={busy || lobbySeats >= maxPlayers}
                  onClick={() => onLobbySeatsChange(Math.min(maxPlayers, lobbySeats + 1))}
                >
                  +
                </Button>
                <Button className="ml-auto" data-testid="create-lobby" disabled={busy} onClick={onCreateLobby}>
                  Create game
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3" data-testid="hotseat-panel">
              <div className="font-display text-base font-semibold text-ink">Pass and play on one device</div>
              <div className="space-y-2">
                {names.map((name, index) => {
                  // Colours already claimed by *other* seats — disabled here so two seats can't share one
                  // (the same uniqueness the waiting-room picker and the server both enforce).
                  const takenByOthers = new Set(
                    seatColors.filter((color, j): color is string => j !== index && color !== undefined),
                  );
                  return (
                    <div key={index} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-xs text-muted-foreground">Seat {index + 1}</span>
                        <input
                          aria-label={`Player ${index + 1} name`}
                          data-testid={`player-name-${index}`}
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={name}
                          onChange={(event) =>
                            onNamesChange(names.map((value, j) => (j === index ? event.target.value : value)))
                          }
                        />
                        <Button
                          variant={seatIsBot[index] ? 'default' : 'outline'}
                          size="sm"
                          aria-label={`Seat ${index + 1} is played by ${seatIsBot[index] ? 'the AI' : 'a person'}`}
                          aria-pressed={seatIsBot[index] === true}
                          title="Let the AI play this seat"
                          data-testid={`toggle-bot-${index}`}
                          disabled={busy}
                          onClick={() => {
                            const next = names.map((_, j) => seatIsBot[j] === true);
                            next[index] = !next[index];
                            onSeatIsBotChange(next);
                          }}
                        >
                          🤖
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove seat ${index + 1}`}
                          data-testid={`remove-player-${index}`}
                          disabled={busy || names.length <= minPlayers}
                          onClick={() => {
                            onNamesChange(names.filter((_, j) => j !== index));
                            onSeatIsBotChange(names.map((_, j) => seatIsBot[j] === true).filter((_, j) => j !== index));
                            onSeatColorsChange(names.map((_, j) => seatColors[j]).filter((_, j) => j !== index));
                            onSeatDifficultiesChange(
                              names.map((_, j) => seatDifficulties[j]).filter((_, j) => j !== index),
                            );
                          }}
                        >
                          ✕
                        </Button>
                      </div>
                      {/*
                        Compact per-seat colour picker (the hotseat parallel of the waiting-room one). A dot
                        per palette colour; the current pick is ringed, colours other seats hold are disabled.
                        Clicking the ringed dot clears back to the palette-order default.
                      */}
                      {palette.length > 0 && (
                        <div
                          className="flex flex-wrap items-center gap-1.5 pl-16"
                          data-testid={`hotseat-color-row-${index}`}
                        >
                          {palette.map((color) => {
                            const taken = takenByOthers.has(color);
                            const picked = seatColors[index] === color;
                            return (
                              <button
                                key={color}
                                type="button"
                                data-testid={`hotseat-color-${index}-${color}`}
                                data-color={color}
                                aria-label={`Seat ${index + 1} colour ${color}${picked ? ' (selected)' : taken ? ' (taken)' : ''}`}
                                aria-pressed={picked}
                                title={color}
                                disabled={busy || taken}
                                onClick={() =>
                                  // Map over `names` (not `seatColors`) so the array always has one entry per
                                  // seat, even though Add seat doesn't extend it (default is undefined).
                                  onSeatColorsChange(
                                    names.map((_, j) => (j === index ? (picked ? undefined : color) : seatColors[j])),
                                  )
                                }
                                className={cn(
                                  'h-5 w-5 rounded-full border transition-transform',
                                  picked && 'ring-2 ring-primary ring-offset-1',
                                  taken ? 'cursor-not-allowed opacity-30' : 'hover:scale-110',
                                )}
                                style={{ backgroundColor: swatchColor(color) }}
                              />
                            );
                          })}
                        </div>
                      )}
                      {/*
                        AI difficulty picker — shown only for a seat handed to the bot, and only when the game
                        declares tiers (CS4). A game with no tiers renders nothing here. Default 'normal'.
                      */}
                      {seatIsBot[index] && botTiers.length > 0 && (
                        <div className="flex items-center gap-2 pl-16" data-testid={`bot-difficulty-row-${index}`}>
                          <span className="text-xs text-muted-foreground">🤖 level</span>
                          <select
                            data-testid={`bot-difficulty-${index}`}
                            aria-label={`Seat ${index + 1} AI difficulty`}
                            className="rounded-md border bg-background px-2 py-1 text-xs capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={seatDifficulties[index] ?? 'normal'}
                            disabled={busy}
                            onChange={(event) =>
                              onSeatDifficultiesChange(
                                names.map((_, j) => (j === index ? event.target.value : seatDifficulties[j])),
                              )
                            }
                          >
                            {botTiers.map((tier) => (
                              <option key={tier} value={tier}>
                                {tier}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                data-testid="add-player"
                disabled={busy || names.length >= maxPlayers}
                onClick={() => onNamesChange([...names, nameForSeat(names.length)])}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add seat
              </Button>

              {names.some((name) => name.trim() === '') && (
                <p className="text-xs text-destructive" data-testid="setup-hint">
                  Every seat needs a name.
                </p>
              )}

              <Button
                className="w-full"
                data-testid="start-game"
                disabled={busy || names.some((name) => name.trim() === '')}
                onClick={onStartHotseat}
              >
                Start game ({names.length} player{names.length === 1 ? '' : 's'})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
