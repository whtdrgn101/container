import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/api';
import type { GameMessage, GamePayload } from '@game-hub/kernel/client';

/**
 * The shell's live connection to one game (roadmap C2).
 *
 * Game-agnostic: it holds the state as an opaque value and never reads a field off it. Whichever
 * board the registry picked is the only thing that knows what's inside.
 *
 * **The shell owns the socket, not the board.** One game = one socket, whoever is playing: the
 * transport is platform infrastructure, exactly like the backend's `GameHub`. Everything that isn't
 * a `type: 'state'` push is handed back untouched as `lastMessage` for the board to interpret
 * (Container reads `type: 'auction'`) — the transport must never learn what an auction is.
 */
export interface GameTransport {
  readonly game: unknown;
  readonly gameType: string | null;
  readonly bots: string[];
  /** Each seat's chosen player colour (playerId → palette id). Beside the game, never inside it. */
  readonly colors: Record<string, string>;
  /** This game's id, or `null` off the board — derived from the state so callers needn't cast it. */
  readonly gameId: string | null;
  /**
   * Secret-free seat identity (REVIEW §3.3), carried on the payload so the shell names seats and gates
   * turns **without** reading the opaque `game` blob. `players` is `[]` and `activePlayerId` `null`
   * until a game is loaded.
   */
  readonly players: { id: string; name: string }[];
  readonly activePlayerId: string | null;
  /** The most recent non-state push, for the board to read. */
  readonly lastMessage: GameMessage | null;
  readonly apply: (payload: GamePayload) => void;
  readonly clear: () => void;
}

/**
 * A pushed state is dropped when it's older than what we already hold.
 *
 * A POST reply and a socket push race by nature: the server broadcasts before it replies, so the
 * push and the response describe the same move and can arrive either way round. Without this, a late
 * push overwrites newer state and the board flickers backwards.
 */
const versionOf = (game: unknown): number =>
  typeof game === 'object' && game !== null && typeof (game as { version?: unknown }).version === 'number'
    ? (game as { version: number }).version
    : 0;

export function useGameTransport(viewer: string | undefined): GameTransport {
  const [game, setGame] = useState<unknown>(null);
  const [gameType, setGameType] = useState<string | null>(null);
  const [bots, setBots] = useState<string[]>([]);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<GameMessage | null>(null);

  // Read inside the socket callback without making the subscription depend on it — re-subscribing on
  // every state change would tear the socket down on each move.
  const current = useRef<unknown>(null);
  current.current = game;

  const apply = useCallback((payload: GamePayload) => {
    setGame(payload.game);
    setGameType(payload.gameType);
    setBots(payload.bots);
    setColors(payload.colors);
    setPlayers(payload.players);
    setActivePlayerId(payload.activePlayerId);
  }, []);

  const clear = useCallback(() => {
    setGame(null);
    setGameType(null);
    setBots([]);
    setColors({});
    setPlayers([]);
    setActivePlayerId(null);
    setLastMessage(null);
  }, []);

  const gameId = typeof game === 'object' && game !== null ? (game as { id?: string }).id : undefined;

  useEffect(() => {
    if (!gameId) return;
    return api.subscribeGame(
      gameId,
      (push) => {
        if (versionOf(push.game) < versionOf(current.current)) return; // stale push; we know better
        setGame(push.game);
        setGameType(push.gameType);
        setBots(push.bots ?? []);
        setColors(push.colors ?? {});
        setPlayers(push.players ?? []);
        setActivePlayerId(push.activePlayerId ?? null);
      },
      viewer,
      setLastMessage,
    );
  }, [gameId, viewer]);

  return { game, gameType, bots, colors, gameId: gameId ?? null, players, activePlayerId, lastMessage, apply, clear };
}
