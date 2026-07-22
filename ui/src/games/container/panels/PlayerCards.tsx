import type { Action, GameView } from '@game-hub/engine/container';
import type { BuyPick } from './PlayerCard';
import { PlayerCard } from './PlayerCard';

export interface PlayerCardsProps {
  readonly game: GameView;
  /** Each seat's picked colour (playerId → palette id), passed down to each card's tint. */
  readonly colors?: Readonly<Record<string, string>>;
  readonly legal: readonly Action[];
  readonly can: (type: Action['type']) => boolean;
  readonly sailActions: readonly Extract<Action, { type: 'SAIL' }>[];
  readonly botIds: readonly string[];
  readonly canDrive: boolean;
  readonly busy: boolean;
  readonly mustDeliverNow: boolean;
  readonly produceLot: number;
  readonly setProduceLot: (price: number) => void;
  readonly pick: BuyPick | null;
  readonly act: (playerId: string, action: Action) => void;
  readonly toggleBuy: (district: 'factory' | 'harbor', sellerId: string, index: number) => void;
  readonly commitBuy: () => void;
}

export function PlayerCards({
  game,
  colors,
  legal,
  can,
  sailActions,
  botIds,
  canDrive,
  busy,
  mustDeliverNow,
  produceLot,
  setProduceLot,
  pick,
  act,
  toggleBuy,
  commitBuy,
}: PlayerCardsProps) {
  return (
    <section
      aria-label="Player boards"
      data-testid="board"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {game.players.map((player, index) => (
        <PlayerCard
          key={player.id}
          game={game}
          colors={colors}
          player={player}
          index={index}
          legal={legal}
          can={can}
          sailActions={sailActions}
          botIds={botIds}
          canDrive={canDrive}
          busy={busy}
          mustDeliverNow={mustDeliverNow}
          produceLot={produceLot}
          setProduceLot={setProduceLot}
          pick={pick}
          act={act}
          toggleBuy={toggleBuy}
          commitBuy={commitBuy}
        />
      ))}
    </section>
  );
}
