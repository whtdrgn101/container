import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Lobby } from '@/lib/api';

/**
 * The pre-game waiting room: share the code, watch seats fill, start when the table is full.
 *
 * Game-agnostic — a lobby is coordination state that knows only how many seats it has and who's in
 * them, which is true of every game. The seat *count* was the lobby's business when it was created;
 * by the time you're here it's just a number.
 */
export interface WaitingRoomProps {
  readonly lobby: Lobby;
  /** Seat indices this client has claimed (a solo tester can hold several). */
  readonly mySeats: number[];
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
  seatName,
  onSeatNameChange,
  busy,
  onTakeSeat,
  onAddBot,
  onStart,
  onLeave,
}: WaitingRoomProps) {
  const hasEmptySeat = lobby.members.some((member) => member === null);

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
              // eslint-disable-next-line react/no-array-index-key -- fixed positional seats
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

        {/* Fill the rest of the table with AI rather than waiting for people to show up. */}
        {hasEmptySeat && (
          <Button variant="outline" className="w-full" data-testid="add-bot-seat" disabled={busy} onClick={onAddBot}>
            🤖 Add an AI player
          </Button>
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
