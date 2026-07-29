import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@game-hub/ui-kit';
import type { Lobby } from '@/lib/api';

/**
 * The pre-game waiting room: share the code, watch seats fill, start when the table is full.
 *
 * Game-agnostic — a lobby is coordination state that knows only how many seats it has and who's in
 * them, which is true of every game. The seat *count* was the lobby's business when it was created;
 * by the time you're here it's just a number.
 */
/**
 * Swatch fills for the colour picker. The palette ids come from the game's catalog entry, so the shell
 * stays game-agnostic; this only says how to *draw* an arbitrary id. A known id gets an exact hex; any
 * other falls back to using the id as a CSS colour (works for plain names like red/blue/teal/indigo).
 */
const SWATCH: Record<string, string> = {
  indigo: '#4f46e5',
  teal: '#0d9488',
  rose: '#e11d48',
  amber: '#d97706',
  violet: '#7c3aed',
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  sky: '#0ea5e9',
  emerald: '#10b981',
};
/** Draw an arbitrary palette id as a CSS colour. Shared with the landing's hotseat colour picker. */
export const swatchColor = (id: string): string => SWATCH[id] ?? id;

export interface WaitingRoomProps {
  readonly lobby: Lobby;
  /** Seat indices this client has claimed (a solo tester can hold several). */
  readonly mySeats: number[];
  /** The game's colour palette (ordered ids), from its catalog entry. Empty ⇒ no picker. */
  readonly palette: readonly string[];
  /** The game's AI difficulty tiers (CS4), from its catalog entry. Empty ⇒ no difficulty picker. */
  readonly botDifficulties: readonly string[];
  /** The difficulty a newly-added AI seat gets (CS4). */
  readonly botDifficulty: string;
  readonly onBotDifficultyChange: (difficulty: string) => void;
  /** Pick a colour for one of your claimed seats. */
  readonly onPickColor: (seat: number, color: string) => void;
  readonly seatName: string;
  readonly onSeatNameChange: (name: string) => void;
  readonly busy: boolean;
  readonly onTakeSeat: () => void;
  readonly onAddBot: () => void;
  readonly onStart: () => void;
  readonly onLeave: () => void;
}

export function WaitingRoom({
  lobby,
  mySeats,
  palette,
  botDifficulties,
  botDifficulty,
  onBotDifficultyChange,
  onPickColor,
  seatName,
  onSeatNameChange,
  busy,
  onTakeSeat,
  onAddBot,
  onStart,
  onLeave,
}: WaitingRoomProps) {
  const hasEmptySeat = lobby.members.some((member) => member === null);
  // Which seats this client holds and can pick a colour for, in seat order.
  const mineClaimed = mySeats.filter((seat) => lobby.members[seat] != null).sort((a, b) => a - b);

  return (
    <Card className="mx-auto max-w-md" data-testid="lobby">
      <CardHeader>
        <CardTitle>Waiting for players</CardTitle>
        <p className="text-sm text-muted-foreground">Share this code. The game starts once every seat is filled.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          type="button"
          data-testid="lobby-code"
          data-lobby-id={lobby.id}
          title="Copy game code"
          onClick={() => void navigator.clipboard?.writeText(lobby.id).catch(() => undefined)}
          className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 font-mono text-xs transition-colors hover:bg-accent"
        >
          <span aria-hidden>🔗</span> {lobby.id}
        </button>

        <ul className="space-y-1" data-testid="lobby-seats">
          {lobby.members.map((member, i) => (
            <li
              key={i}
              data-testid={`lobby-seat-${i}`}
              className={cn(
                'flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                mySeats.includes(i) && 'border-primary ring-1 ring-primary',
              )}
            >
              <span className="text-muted-foreground">Seat {i + 1}</span>
              <span className={member ? 'font-medium' : 'text-muted-foreground'}>
                {member ? `${member.bot ? '🤖 ' : ''}${member.name}` : 'Empty'}
                {mySeats.includes(i) ? ' (you)' : ''}
              </span>
            </li>
          ))}
        </ul>

        {/* Colour picker: one row per seat this client holds. Taken colours are disabled; your own
            current pick is ringed. The palette is the game's, from its catalog entry. */}
        {palette.length > 0 && mineClaimed.length > 0 && (
          <div className="space-y-2" data-testid="color-picker">
            {mineClaimed.map((seat) => {
              const mine = lobby.members[seat]?.color;
              const takenByOthers = new Set(
                lobby.members
                  .map((member, i) => (i === seat ? undefined : member?.color))
                  .filter((color): color is string => color !== undefined),
              );
              return (
                <div key={seat} className="flex items-center gap-2" data-testid={`color-row-${seat}`}>
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">Seat {seat + 1}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {palette.map((color) => {
                      const taken = takenByOthers.has(color);
                      const picked = mine === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          data-testid={`color-pick-${seat}-${color}`}
                          data-color={color}
                          aria-label={`${color}${picked ? ' (your colour)' : taken ? ' (taken)' : ''}`}
                          aria-pressed={picked}
                          title={color}
                          disabled={busy || taken}
                          onClick={() => onPickColor(seat, color)}
                          className={cn(
                            'h-6 w-6 rounded-full border transition-transform',
                            picked && 'ring-2 ring-primary ring-offset-1',
                            taken ? 'cursor-not-allowed opacity-30' : 'hover:scale-110',
                          )}
                          style={{ backgroundColor: swatchColor(color) }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasEmptySeat && (
          <div className="flex gap-2">
            <input
              aria-label="Your name"
              data-testid="seat-name"
              placeholder="Your name"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={seatName}
              onChange={(event) => onSeatNameChange(event.target.value)}
            />
            <Button data-testid="take-seat" disabled={busy || seatName.trim() === ''} onClick={onTakeSeat}>
              Take a seat
            </Button>
          </div>
        )}

        {/* Fill the rest of the table with AI rather than waiting for people to show up. The tier
            picker shows only when the game declares tiers (CS4); otherwise the button is exactly as
            before and every added bot plays the game's one behaviour. */}
        {hasEmptySeat && (
          <div className="flex gap-2">
            {botDifficulties.length > 0 && (
              <select
                data-testid="add-bot-difficulty"
                aria-label="AI difficulty for the next bot"
                className="rounded-md border bg-background px-2 py-1 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={botDifficulty}
                disabled={busy}
                onChange={(event) => onBotDifficultyChange(event.target.value)}
              >
                {botDifficulties.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            )}
            <Button variant="outline" className="flex-1" data-testid="add-bot-seat" disabled={busy} onClick={onAddBot}>
              🤖 Add an AI player
            </Button>
          </div>
        )}

        <Button className="w-full" data-testid="start-lobby" disabled={busy || hasEmptySeat} onClick={onStart}>
          {hasEmptySeat ? 'Waiting for all seats…' : 'Start game'}
        </Button>
        <Button variant="ghost" size="sm" className="w-full" data-testid="leave-lobby" onClick={onLeave}>
          Leave
        </Button>
      </CardContent>
    </Card>
  );
}
