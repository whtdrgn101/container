import { useEffect, useRef, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@game-hub/ui-kit';
import type { ChatMessage, PresenceViewer } from '@/lib/api';

/**
 * In-game chat + presence — **shell chrome**, game-agnostic (design-patterns §1: the shell owns the
 * socket; a game knows nothing about chat). It renders beside whatever board the registry picked and
 * never reads game state — it takes plain seat identity (`players`, `controlledIds`, `activePlayerId`)
 * and the transport's accumulated `chat`/`presence`, exactly like the seat-binding rules do.
 *
 * Sender identity follows the platform's seat model: a seat-bound client speaks as its own seat; a
 * hotseat client (drives every seat) speaks as whoever is on the clock; a spectator holds no seat and is
 * **read-only**. Chat is table-public, so every viewer sees every message — there is nothing to redact.
 *
 * Solo/hotseat chat is pointless but must not break: the panel still renders, presence shows the one
 * local viewer, and sends go to the log (which only you read).
 */
export interface ChatPanelProps {
  readonly players: { id: string; name: string }[];
  /** Seats this client controls, or `null` for hotseat (drives every seat). */
  readonly controlledIds: string[] | null;
  readonly activePlayerId: string | null;
  readonly chat: ChatMessage[];
  readonly presence: PresenceViewer[];
  readonly busy: boolean;
  readonly onSend: (playerId: string, body: string) => void;
}

export function ChatPanel({ players, controlledIds, activePlayerId, chat, presence, busy, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // The seat this client speaks as: its own (seat-bound), the active seat (hotseat), or none (spectator,
  // read-only). `controlledIds === null` is hotseat; an empty array is an explicit spectator.
  const senderId =
    controlledIds === null
      ? (activePlayerId ?? players[0]?.id)
      : controlledIds.length > 0
        ? controlledIds[0]
        : undefined;
  const nameOf = (id: string) => players.find((player) => player.id === id)?.name ?? id;
  const canSend = senderId !== undefined;

  // Keep the newest message in view as the log grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  function submit() {
    const body = draft.trim();
    if (!body || !senderId || busy) return;
    onSend(senderId, body);
    setDraft('');
  }

  return (
    <Card data-testid="chat-panel" className="mt-6">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Chat</CardTitle>
          <span className="text-xs text-muted-foreground">{presence.length} watching</span>
        </div>
        {/* Presence roster — who is currently connected to this game. */}
        <div data-testid="presence" className="flex flex-wrap gap-1.5">
          {presence.map((viewer) => (
            <span
              key={viewer.id}
              data-testid="presence-viewer"
              className="inline-flex items-center gap-1 rounded-full border bg-accent/40 px-2 py-0.5 text-xs text-foreground"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {viewer.label}
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div
          ref={listRef}
          data-testid="chat-messages"
          className="flex max-h-64 min-h-24 flex-col gap-1.5 overflow-y-auto rounded-md border bg-muted/30 p-3"
        >
          {chat.length === 0 ? (
            <p data-testid="chat-empty" className="text-sm text-muted-foreground">
              No messages yet. Say hello!
            </p>
          ) : (
            chat.map((message) => (
              <p key={message.seq} data-testid="chat-message" className="text-sm break-words">
                <span className="font-semibold">{message.sender}:</span> <span>{message.body}</span>
              </p>
            ))
          )}
        </div>

        {canSend ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              data-testid="chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={500}
              placeholder={controlledIds === null ? `Message as ${nameOf(senderId!)}…` : 'Type a message…'}
              className={cn(
                'min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            />
            <Button type="submit" size="sm" data-testid="chat-send" disabled={busy || draft.trim().length === 0}>
              Send
            </Button>
          </form>
        ) : (
          <p data-testid="chat-readonly" className="text-sm text-muted-foreground">
            You’re spectating — take a seat to join the conversation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
