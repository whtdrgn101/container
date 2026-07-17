import type { Color, GameView } from '@game-hub/engine/container';
import { MAX_LOANS } from '@game-hub/engine/container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DeliveryAuctionView } from '../api';
import { ContainerChip, nameOf } from '../chips';

export interface AuctionPanelProps {
  readonly game: GameView;
  /** The open auction as *this client* may see it, or `null` when none is due. */
  readonly auction: DeliveryAuctionView | null;
  /** The seats this client controls. `null` = hotseat, which answers for every seat in turn. */
  readonly controlledIds: readonly string[] | null;
  readonly busy: boolean;
  /** My seats that still owe a bid, in seat order. */
  readonly seatsStillToBid: readonly string[];
  readonly iAmDeliverer: boolean;
  readonly bidsOutstanding: number;
  readonly bidDraft: number;
  readonly setBidDraft: (value: number) => void;
  readonly bidderSeatId: string | null;
  readonly setBidderSeatId: (value: string | null) => void;
  readonly tieChoice: string | null;
  readonly setTieChoice: (value: string | null) => void;
  readonly submitBid: (playerId: string) => void;
  readonly resolveDelivery: (buyout: boolean, winnerId?: string) => void;
  readonly requestLoan: (playerId: string) => void;
}

/**
 * The delivery auction (A1). Deliberately top-level rather than inside the active
 * player's card: the people who need it most are the *opponents*, whose turn it isn't.
 * Each client only ever sees its own bid — the server holds the rest until the reveal.
 */
export function AuctionPanel({
  game,
  auction,
  controlledIds,
  busy,
  seatsStillToBid,
  iAmDeliverer,
  bidsOutstanding,
  bidDraft,
  setBidDraft,
  bidderSeatId,
  setBidderSeatId,
  tieChoice,
  setTieChoice,
  submitBid,
  resolveDelivery,
  requestLoan,
}: AuctionPanelProps) {
  if (!auction || game.status !== 'active') return null;

  return (
    <Card className="reveal-in mb-4 border-primary/50" data-testid="auction">
      <CardHeader>
        <CardTitle className="text-base">
          Delivery auction — {nameOf(game.players, auction.delivererId)} is delivering
          {auction.phase === 'runoff' && <span className="ml-2 text-destructive">· runoff!</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Cargo:</span>
          {auction.cargo.map((color, cargoIndex) => (
            <ContainerChip key={cargoIndex} color={color as Color} />
          ))}
        </div>

        {/*
          A runoff keeps the opening bids on the table (pg. 16): the tied players add cash
          knowing exactly what they're level on, which is the whole tension of the round.
        */}
        {auction.phase === 'runoff' && auction.revealed && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs" data-testid="runoff-banner">
            Tied at ${Math.max(0, ...Object.values(auction.revealed))} —{' '}
            {auction.bidders.map((b) => nameOf(game.players, b.playerId)).join(' and ')} add cash to their
            existing bid. Highest total wins.
          </p>
        )}

        {/* Who still owes a bid this round. That someone has bid is public; the amount is not. */}
        <div className="flex flex-wrap gap-2 text-xs" data-testid="auction-bidders">
          {auction.bidders.map((bidder) => (
            <span
              key={bidder.playerId}
              data-testid={`bidder-${bidder.playerId}`}
              className={cn(
                'rounded-full border px-2 py-0.5',
                bidder.hasBid ? 'border-primary/50 bg-primary/10' : 'text-muted-foreground',
              )}
            >
              {nameOf(game.players, bidder.playerId)} {bidder.hasBid ? '✓ bid' : '… thinking'}
            </span>
          ))}
        </div>

        {auction.phase !== 'decision' ? (
          seatsStillToBid.length > 0 ? (
            bidderSeatId === null ? (
              /*
                Pass-the-device gate. On a shared screen one client answers for every seat,
                so the bid box stays hidden until that player says they're looking — which
                is what makes a "secret" bid actually secret on one device.
              */
              <div className="space-y-2 rounded-md border border-dashed p-3 text-center">
                <p className="text-sm">
                  {controlledIds === null ? 'Pass the device to ' : 'Your turn to bid, '}
                  <span className="font-semibold">{nameOf(game.players, seatsStillToBid[0]!)}</span>
                </p>
                <Button
                  size="sm"
                  data-testid="reveal-bid-entry"
                  disabled={busy}
                  onClick={() => {
                    setBidderSeatId(seatsStillToBid[0]!);
                    setBidDraft(0);
                  }}
                >
                  I'm {nameOf(game.players, seatsStillToBid[0]!)} — enter my bid
                </Button>
              </div>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {auction.phase === 'runoff'
                      ? `${nameOf(game.players, bidderSeatId)} adds to their $${auction.revealed?.[bidderSeatId] ?? 0} bid`
                      : `${nameOf(game.players, bidderSeatId)}'s secret bid`}
                  </span>
                  <input
                    type="number"
                    min={0}
                    // A runoff bid stacks on top of the opening bid, so what's left to
                    // spend is the cash still in hand, not the whole pile.
                    max={
                      (game.players.find((p) => p.id === bidderSeatId)?.money ?? 0) -
                      (auction.phase === 'runoff' ? (auction.revealed?.[bidderSeatId] ?? 0) : 0)
                    }
                    autoFocus
                    data-testid="bid-input"
                    className="w-24 rounded-md border bg-background px-2 py-1 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={bidDraft}
                    onChange={(event) => setBidDraft(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  {auction.phase === 'runoff'
                    ? 'Added to your first bid — you never get that back. Highest total wins.'
                    : '$0 is a legal bluff. Nobody sees this until everyone has bid.'}
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  data-testid="submit-bid"
                  disabled={busy}
                  onClick={() => submitBid(bidderSeatId)}
                >
                  Place sealed bid
                </Button>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="auction-waiting">
              {iAmDeliverer
                ? `Waiting for ${bidsOutstanding} opponent${bidsOutstanding === 1 ? '' : 's'} to bid…`
                : 'Bid placed. Waiting for the other players…'}
            </p>
          )
        ) : (
          <div className="space-y-3" data-testid="auction-reveal">
            {/* Every bid is in, so revealing them all at once keeps the bidding simultaneous. */}
            <div className="space-y-1">
              {Object.keys(auction.revealed ?? {}).map((playerId) => {
                const opening = auction.revealed?.[playerId] ?? 0;
                const added = auction.runoffRevealed?.[playerId];
                const total = opening + (added ?? 0);
                return (
                  <div
                    key={playerId}
                    data-testid={`revealed-${playerId}`}
                    className={cn(
                      'flex justify-between rounded px-2 py-1 text-sm',
                      total === auction.winningBid && 'bg-primary/10 font-medium',
                    )}
                  >
                    <span>{nameOf(game.players, playerId)}</span>
                    <span className="tabular-nums">
                      {added === undefined ? (
                        `$${opening}`
                      ) : (
                        // Show the arithmetic: a runoff total is the opening bid *plus*
                        // the addition, and players will want to check it.
                        <>
                          <span className="text-muted-foreground">
                            ${opening} + ${added} ={' '}
                          </span>
                          ${total}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {iAmDeliverer ? (
              <>
                {/*
                  A runoff that ends level is the deliverer's call (pg. 16) — the engine
                  refuses to guess, so the choice must be made here before Deliver unlocks.
                */}
                {auction.choiceRequired.length > 0 && (
                  <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-2" data-testid="tie-choice">
                    <p className="text-xs font-medium text-destructive">
                      Still tied at ${auction.winningBid} — you choose who gets the cargo:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {auction.choiceRequired.map((playerId) => (
                        <Button
                          key={playerId}
                          size="sm"
                          variant={tieChoice === playerId ? 'default' : 'outline'}
                          data-testid={`choose-winner-${playerId}`}
                          onClick={() => setTieChoice(playerId)}
                        >
                          {nameOf(game.players, playerId)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    data-testid="deliver"
                    disabled={busy || (auction.choiceRequired.length > 0 && tieChoice === null)}
                    onClick={() => resolveDelivery(false, tieChoice ?? undefined)}
                  >
                    Deliver (earn ${(auction.winningBid ?? 0) * 2})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    data-testid="buyout"
                    disabled={busy}
                    // A buyout needs no winner: every tied bidder just takes their bid back.
                    onClick={() => resolveDelivery(true)}
                  >
                    Buy out (${auction.winningBid ?? 0})
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Waiting for {nameOf(game.players, auction.delivererId)} to accept or buy out…
              </p>
            )}
          </div>
        )}

        {/*
          Loans are the one action legal on someone else's turn (pg. 16) — precisely so a
          broke player can afford to bid. Without this the rule has nowhere to happen.
        */}
        {auction.phase === 'bidding' &&
          seatsStillToBid.length > 0 &&
          (game.players.find((p) => p.id === seatsStillToBid[0]!)?.loans ?? 0) < MAX_LOANS && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-xs"
              data-testid="auction-loan"
              disabled={busy}
              onClick={() => requestLoan(seatsStillToBid[0]!)}
            >
              Short on cash? Take a $10 Bank loan
            </Button>
          )}
      </CardContent>
    </Card>
  );
}
