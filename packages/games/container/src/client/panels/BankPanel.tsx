import type { Dispatch, SetStateAction } from 'react';
import type { Action, GameView, PlayerView } from '../../engine';
import { ContainerChip, LOT_LABELS, nameOf } from '../chips';
import { CONTAINER_TIPS } from '../tips';
import { Button } from '@/components/ui/button';
import { ActionTip } from '@/components/ActionTip';
import { Card, CardContent } from '@/components/ui/card';

interface BankPanelProps {
  readonly game: GameView;
  readonly activePlayer: PlayerView | undefined;
  readonly legal: readonly Action[];
  readonly canDrive: boolean;
  readonly busy: boolean;
  readonly bankBid: Readonly<Record<number, number>>;
  readonly setBankBid: Dispatch<SetStateAction<Record<number, number>>>;
  readonly bankCount: Readonly<Record<number, number>>;
  readonly setBankCount: Dispatch<SetStateAction<Record<number, number>>>;
  readonly act: (playerId: string, action: Action) => void;
}

/** Container lots: bid cash to call one. */
function ContainerLots({
  game,
  activePlayer,
  legal,
  canDrive,
  busy,
  bankBid,
  setBankBid,
  act,
}: Pick<BankPanelProps, 'game' | 'activePlayer' | 'legal' | 'canDrive' | 'busy' | 'bankBid' | 'setBankBid' | 'act'>) {
  return (
    <div className="flex flex-wrap gap-3">
      {game.bank.containerLots.map((lot, i) => {
        const auction = game.bank.auctions.find((a) => a.lotKind === 'container' && a.lotIndex === i);
        // `lotKind` matters as much as the index: container and cash lots are numbered separately, so
        // without it a callable *cash* lot lights up its container twin (and the call is then refused).
        const callable =
          canDrive && legal.some((a) => a.type === 'CALL_BANK' && a.lotKind === 'container' && a.lotIndex === i);
        const minBid = auction ? auction.bid + 1 : 1;
        const bid = bankBid[i] ?? minBid;
        return (
          <div key={i} className="rounded-md border p-2" data-testid={`bank-container-${i}`}>
            <div className="mb-1 text-xs font-medium">Lot {LOT_LABELS[i]}</div>
            <div className="flex min-h-6 flex-wrap gap-1">
              {lot.length === 0 ? (
                <span className="text-xs text-muted-foreground">empty</span>
              ) : (
                lot.map((color, ci) => <ContainerChip key={ci} color={color} />)
              )}
            </div>
            {auction && (
              <div className="mt-1 text-xs text-muted-foreground" data-testid={`bank-auction-${i}`}>
                {nameOf(game.players, auction.highBidderId)} leads ${auction.bid}
              </div>
            )}
            {callable && activePlayer && (
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  min={minBid}
                  data-testid={`bank-bid-${i}`}
                  className="w-14 rounded border bg-background px-1 py-0.5 text-right text-xs"
                  value={bid}
                  onChange={(event) =>
                    setBankBid((prev) => ({
                      ...prev,
                      [i]: Math.max(minBid, Math.floor(Number(event.target.value) || minBid)),
                    }))
                  }
                />
                <ActionTip tip={auction ? CONTAINER_TIPS.bankContainerOutbid : CONTAINER_TIPS.bankContainerLot}>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`bank-call-${i}`}
                    disabled={busy}
                    onClick={() => act(activePlayer.id, { type: 'CALL_BANK', lotKind: 'container', lotIndex: i, bid })}
                  >
                    {auction ? 'Outbid' : 'Call'}
                  </Button>
                </ActionTip>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Cash lots: the bid is containers off your board, cheapest first. */
function CashLots({
  game,
  activePlayer,
  legal,
  canDrive,
  busy,
  bankCount,
  setBankCount,
  act,
}: Pick<
  BankPanelProps,
  'game' | 'activePlayer' | 'legal' | 'canDrive' | 'busy' | 'bankCount' | 'setBankCount' | 'act'
>) {
  return (
    <div className="flex flex-wrap gap-3">
      {game.bank.cashLots.map((cash, i) => {
        const auction = game.bank.auctions.find((a) => a.lotKind === 'cash' && a.lotIndex === i);
        const callable =
          canDrive && legal.some((a) => a.type === 'CALL_BANK' && a.lotKind === 'cash' && a.lotIndex === i);
        const minCount = auction ? auction.bid + 1 : 1;
        const count = bankCount[i] ?? minCount;
        const board = activePlayer
          ? [...activePlayer.factoryStore, ...activePlayer.harborStore].sort((a, b) => a.price - b.price)
          : [];
        return (
          <div key={i} className="rounded-md border p-2" data-testid={`bank-cash-lot-${i}`}>
            <div className="mb-1 text-xs font-medium">
              Cash {LOT_LABELS[i]} — ${cash}
            </div>
            {auction && (
              <div className="mb-1 text-xs text-muted-foreground" data-testid={`bank-cash-auction-${i}`}>
                {nameOf(game.players, auction.highBidderId)} leads {auction.bid} container
                {auction.bid === 1 ? '' : 's'}
              </div>
            )}
            {callable && activePlayer && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={minCount}
                  max={board.length}
                  data-testid={`bank-count-${i}`}
                  className="w-14 rounded border bg-background px-1 py-0.5 text-right text-xs"
                  value={count}
                  onChange={(event) =>
                    setBankCount((prev) => ({
                      ...prev,
                      [i]: Math.max(minCount, Math.floor(Number(event.target.value) || minCount)),
                    }))
                  }
                />
                <ActionTip tip={auction ? CONTAINER_TIPS.bankCashOutbid : CONTAINER_TIPS.bankCashLot}>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`bank-cash-call-${i}`}
                    disabled={busy || count > board.length}
                    onClick={() =>
                      act(activePlayer.id, {
                        type: 'CALL_BANK',
                        lotKind: 'cash',
                        lotIndex: i,
                        containerBid: board.slice(0, count),
                      })
                    }
                  >
                    {auction ? 'Outbid' : 'Bid'}
                  </Button>
                </ActionTip>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BankPanel(props: BankPanelProps) {
  const { game } = props;
  return (
    <Card className="mb-4" data-testid="bank">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">Off-Shore Bank</span>
          <span className="text-xs text-muted-foreground" data-testid="bank-tokens">
            Tokens: {game.bank.tokens}
          </span>
          <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            Cash lots:
            {game.bank.cashLots.map((cash, i) => (
              <span key={i} data-testid={`bank-cash-${i}`} className="tabular-nums">
                {LOT_LABELS[i]} ${cash}
              </span>
            ))}
          </span>
        </div>

        <ContainerLots {...props} />

        <CashLots {...props} />
      </CardContent>
    </Card>
  );
}
