import { useCallback, useEffect, useState } from 'react';
import * as api from '@/lib/api';
import type { GameInfo, GameSummary, Lobby } from '@/lib/api';

/**
 * What the home screen shows: the games this server hosts, the rooms waiting for players, and the
 * games already in progress.
 *
 * Polling rather than a socket, deliberately: these are cheap list reads, they only matter while
 * someone is looking at the landing screen, and a dropped poll self-heals on the next tick. The
 * socket is for a game you're *in*.
 */
const POLL_MS = 3000;

export interface HomeLists {
  readonly catalog: GameInfo[];
  readonly openLobbies: Lobby[];
  readonly activeGames: GameSummary[];
  /** Drop a game from the list without waiting for the next poll (e.g. you just abandoned it). */
  readonly forget: (gameId: string) => void;
}

export function useHomeLists(enabled: boolean): HomeLists {
  const [catalog, setCatalog] = useState<GameInfo[]>([]);
  const [openLobbies, setOpenLobbies] = useState<Lobby[]>([]);
  const [activeGames, setActiveGames] = useState<GameSummary[]>([]);

  // The catalog is what this server *hosts* — it changes on deploy, not during a session, so it's
  // fetched once rather than polled.
  useEffect(() => {
    void api.listGameTypes().then(setCatalog, () => undefined);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => {
      void api
        .listLobbies()
        .then((list) => active && setOpenLobbies(list))
        .catch(() => undefined);
      void api
        .listActiveGames()
        .then((list) => active && setActiveGames(list))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled]);

  const forget = useCallback((gameId: string) => {
    setActiveGames((games) => games.filter((entry) => entry.id !== gameId));
  }, []);

  return { catalog, openLobbies, activeGames, forget };
}
