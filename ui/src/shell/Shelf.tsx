import { clientFor } from '@/games/registry';
import { GameIcon } from '@/shell/GameIcon';
import { OpenTables } from '@/shell/OpenTables';
import type { GameInfo, GameSummary, Lobby } from '@/lib/api';

/**
 * The shelf — the Game Hub's front door (Card Table redesign): a shelf of **box lids**, one per hosted
 * game, over the felt "Open tables" band and a join-by-code strip. It replaces the old pill picker +
 * combined new-game form; clicking a lid opens that game's detail screen.
 *
 * **Game-agnostic** (roadmap C2): the lids come from the server catalog, in catalog order — no hardcoded
 * game list. A lid's mark (`client.Icon`) and one-line description come from the game's own UI plugin via
 * the registry (`clientFor`, the sanctioned lookup); the shell never names or imports a game itself. A
 * game with no `Icon` gets a neutral cream lid stamped with its initial.
 */
export interface ShelfProps {
  readonly catalog: GameInfo[];
  /** Open a game's detail screen (pass-and-play / play-online). */
  readonly onOpen: (gameType: string) => void;
  readonly busy: boolean;

  // The "Open tables" band (waiting + in-progress), passed straight through.
  readonly openLobbies: Lobby[];
  readonly activeGames: GameSummary[];
  readonly displayName: string;
  readonly onDisplayNameChange: (name: string) => void;
  readonly onJoinWaiting: (lobbyId: string) => void;
  readonly onRejoinWaiting: (lobbyId: string, seat: number) => void;
  readonly onResume: (gameId: string, playerId: string) => void;
  readonly onResumeHotseat: (gameId: string) => void;
  readonly confirmingAbandon: string | null;
  readonly onConfirmAbandon: (gameId: string | null) => void;
  readonly onAbandon: (gameId: string) => void;
}

export function Shelf({
  catalog,
  onOpen,
  busy,
  openLobbies,
  activeGames,
  displayName,
  onDisplayNameChange,
  onJoinWaiting,
  onRejoinWaiting,
  onResume,
  onResumeHotseat,
  confirmingAbandon,
  onConfirmAbandon,
  onAbandon,
}: ShelfProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1 pb-1 text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-brass">The Games Room</h2>
        <p className="text-sm text-muted-foreground">
          Self-hosted board games for your table — no accounts, just a shared code. Pick a box off the shelf.
        </p>
      </div>

      {/* The shelf of box lids. Two-up on phones, three-up from `sm`, so it reflows cleanly to 320px. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" data-testid="game-shelf">
        {catalog.map((entry) => {
          const client = clientFor(entry.id);
          return (
            <li key={entry.id}>
              <button
                type="button"
                data-testid={`pick-game-${entry.id}`}
                disabled={busy}
                onClick={() => onOpen(entry.id)}
                className="group flex w-full flex-col overflow-hidden rounded-xl border-2 border-wood/30 bg-card text-left shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <div className="border-b border-wood/20">
                  <GameIcon
                    Icon={client?.Icon}
                    initial={entry.name.slice(0, 1)}
                    className="aspect-[5/4] h-auto w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <div className="font-display text-base leading-tight font-semibold text-ink">{entry.name}</div>
                  <div className="text-xs font-medium text-muted-foreground">
                    {entry.minPlayers}–{entry.maxPlayers} players
                  </div>
                  {client?.blurb && <p className="line-clamp-2 text-xs text-muted-foreground">{client.blurb}</p>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <OpenTables
        catalog={catalog}
        openLobbies={openLobbies}
        activeGames={activeGames}
        busy={busy}
        displayName={displayName}
        onDisplayNameChange={onDisplayNameChange}
        onJoinWaiting={onJoinWaiting}
        onRejoinWaiting={onRejoinWaiting}
        onResume={onResume}
        onResumeHotseat={onResumeHotseat}
        confirmingAbandon={confirmingAbandon}
        onConfirmAbandon={onConfirmAbandon}
        onAbandon={onAbandon}
      />
    </div>
  );
}
