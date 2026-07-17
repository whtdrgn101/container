import { useEffect, useState } from 'react';
import type { Action, Color, GameState, GameView, StoredContainer } from '@container/engine/container';
import { COLORS, FACTORY_BUILD_COSTS, legalActions } from '@container/engine/container';
import type { BoardProps } from '../types';
import * as containerApi from './api';
import type { DeliveryAuctionView } from './api';
import { isAuctionPush } from './api';
import { BoardMap } from './BoardMap';
import { GameLog } from './GameLog';
import { AuctionPanel } from './panels/AuctionPanel';
import { BankPanel } from './panels/BankPanel';
import { IdentityBanner } from './panels/IdentityBanner';
import { PlayerCards } from './panels/PlayerCards';
import type { BuyPick } from './panels/PlayerCard';
import { ResultsPanel } from './panels/ResultsPanel';
import { SupplyPanel } from './panels/SupplyPanel';

/**
 * Container's board — the whole game, as one plugin the shell renders (roadmap C2).
 *
 * **Everything Container knows lives at or below this file.** The shell owns navigation, the lobby,
 * seat binding and the transport; it hands this component an opaque state it never reads. Here the
 * state is pinned back to `GameView` and the engine is in scope again. If shell code ever needs to
 * import `@container/engine`, something belongs on this side of the seam instead.
 *
 * All Container-only UI state is held here rather than in the shell: which containers are selected to
 * buy, the bid being typed, Bank auction drafts. None of it means anything to another game.
 */
export default function ContainerBoard({
  gameId,
  game,
  bots,
  controlledIds,
  viewer,
  busy,
  guard,
  onPayload,
  onLeave,
  lastMessage,
}: BoardProps<GameView>) {
  const [produceLot, setProduceLot] = useState<number>(2);
  // Which containers the active player has selected to buy (one district, one seller at a time).
  const [pick, setPick] = useState<BuyPick | null>(null);
  // Which factory color the active player has selected to build from the shared supply.
  const [buildColor, setBuildColor] = useState<Color | null>(null);
  // The open delivery auction as *this client* may see it — the server holds the sealed bids and
  // reveals them only once every opponent has committed (A1).
  const [auction, setAuction] = useState<DeliveryAuctionView | null>(null);
  // The bid being typed, and which seat is entering it. On a shared screen the seats bid one at a
  // time behind a "pass the device" gate, so only one seat is ever mid-bid.
  const [bidDraft, setBidDraft] = useState<number>(0);
  const [bidderSeatId, setBidderSeatId] = useState<string | null>(null);
  // Which tied bidder the deliverer has picked, when a runoff ends level (pg. 16).
  const [tieChoice, setTieChoice] = useState<string | null>(null);
  // Per-container-lot cash bids and per-cash-lot container-count bids for Bank auctions, by lot index.
  const [bankBid, setBankBid] = useState<Record<number, number>>({});
  const [bankCount, setBankCount] = useState<Record<number, number>>({});

  // The shell forwards every non-state push here without interpreting it; the auction frame is ours.
  useEffect(() => {
    if (lastMessage && isAuctionPush(lastMessage)) setAuction(lastMessage.auction);
  }, [lastMessage]);

  // The stream only pushes an auction when one *changes*, so a client that joins or reloads while
  // one is already open would see nothing until the next bid. Re-fetch whenever the game reaches (or
  // leaves) a delivery, which also means a dropped push can't strand the panel: the auction is
  // derived from the game state, never only from a message we hope arrived.
  const auctionKey = `${game.turn}:${game.activePlayerIndex}:${
    game.players[game.activePlayerIndex]?.ship.location.kind
  }:${game.players[game.activePlayerIndex]?.ship.cargo.length ?? 0}`;
  const bidSeat = controlledIds?.length === 1 ? controlledIds[0] : undefined;
  useEffect(() => {
    void containerApi.getAuction(gameId, bidSeat).then(setAuction, () => undefined);
  }, [gameId, auctionKey, bidSeat]);

  // legalActions is a pure read over observable state and never inspects hidden scoring cards,
  // so passing the redacted per-viewer view (which only nulls out opponents' cards) is safe.
  const legal = legalActions(game as unknown as GameState);
  const can = (type: Action['type']) => legal.some((action) => action.type === type);
  const buildableColors = legal
    .filter((action): action is Extract<Action, { type: 'BUILD_FACTORY' }> => action.type === 'BUILD_FACTORY')
    .map((action) => action.color);
  const sailActions = legal.filter((action): action is Extract<Action, { type: 'SAIL' }> => action.type === 'SAIL');
  const activePlayer = game.players[game.activePlayerIndex];
  // This client may drive the game only when it controls the active seat (or controls all seats, in
  // hotseat). This is what binds the window to the seat you joined as and locks other players' turns.
  // Never offer to act for an AI seat: the server plays those, and a click here would be a second
  // player at the same seat. In practice a bot has already moved by the time we render, but a
  // dropped push shouldn't hand its turn to a human.
  const activeIsBot = !!activePlayer && bots.includes(activePlayer.id);
  const canDrive = !activeIsBot && (!controlledIds || (!!activePlayer && controlledIds.includes(activePlayer.id)));
  const myNames = controlledIds ? game.players.filter((p) => controlledIds.includes(p.id)).map((p) => p.name) : null;

  const nextFactoryCost = activePlayer ? FACTORY_BUILD_COSTS[activePlayer.factories.length - 1] : undefined;
  const containersGone = COLORS.filter((color) => game.supply.containers[color] === 0).length;
  const mustDeliverNow =
    !!activePlayer && activePlayer.ship.location.kind === 'island' && activePlayer.ship.cargo.length > 0;

  // Which seats does this client answer for? Hotseat (`null`) drives every seat, so it must collect
  // every opponent's bid — one at a time, behind a pass-the-device gate. AI seats are never ours:
  // they bid and play themselves server-side, so prompting for them would deadlock the screen.
  const mySeatIds = (controlledIds ?? game.players.map((p) => p.id)).filter((id) => !bots.includes(id));
  const iAmDeliverer = !!auction && mySeatIds.includes(auction.delivererId);
  /** My seats that still owe a bid, in seat order. */
  const seatsStillToBid = auction
    ? auction.bidders.filter((b) => !b.hasBid && mySeatIds.includes(b.playerId)).map((b) => b.playerId)
    : [];
  const bidsOutstanding = auction ? auction.bidders.filter((b) => !b.hasBid).length : 0;

  const run = (work: () => Promise<containerApi.ContainerPayload>) =>
    guard(async () => onPayload(await work()));

  function act(playerId: string, action: Action) {
    if (!canDrive) return; // only the client controlling the active seat may submit moves
    setPick(null);
    setBuildColor(null);
    void run(() => containerApi.act(gameId, playerId, action, viewer));
  }

  /** Toggle a container into/out of the current buy selection. */
  function toggleBuy(district: 'factory' | 'harbor', sellerId: string, index: number) {
    setPick((prev) => {
      if (!prev || prev.district !== district || prev.sellerId !== sellerId) {
        return { district, sellerId, indices: [index] };
      }
      const indices = prev.indices.includes(index)
        ? prev.indices.filter((i) => i !== index)
        : [...prev.indices, index];
      return indices.length ? { district, sellerId, indices } : null;
    });
  }

  /**
   * Commit one seat's sealed bid. The amount goes straight to the server and is never held in this
   * client's state — that is what stops the deliverer's screen from seeing it.
   */
  function submitBid(playerId: string) {
    const amount = bidDraft;
    setBidderSeatId(null);
    setBidDraft(0);
    void run(async () => {
      await containerApi.placeBid(gameId, playerId, amount);
      // Re-read rather than trusting the local echo: this bid may have been the last one (flipping
      // the auction to `decision`), and any AI seats will have answered inside that request too.
      setAuction(await containerApi.getAuction(gameId, bidSeat));
      return await containerApi.getGameAs(gameId, viewer);
    });
  }

  /**
   * Deliverer only: accept the high bid (bid + matching subsidy), or buy out and keep the cargo.
   * `winnerId` is required exactly when a runoff ended level and the cargo is going to a bidder.
   */
  function resolveDelivery(buyout: boolean, winnerId?: string) {
    if (!auction) return;
    setPick(null);
    setBuildColor(null);
    setTieChoice(null);
    void run(() => containerApi.resolveAuction(gameId, auction.delivererId, buyout, viewer, winnerId));
  }

  /** Buy every selected container from the seller in a single action. */
  function commitBuy() {
    if (!pick) return;
    const active = game.players[game.activePlayerIndex];
    const seller = game.players.find((p) => p.id === pick.sellerId);
    if (!active || !seller) return;
    const store = pick.district === 'factory' ? seller.factoryStore : seller.harborStore;
    const bought = pick.indices
      .map((i) => store[i])
      .filter((c): c is StoredContainer => c !== undefined)
      .map((c) => ({ color: c.color, price: c.price }));
    const action: Action =
      pick.district === 'factory'
        ? { type: 'FACTORY_PURCHASE', sellerId: pick.sellerId, bought }
        : { type: 'HARBOR_PURCHASE', bought };
    setPick(null);
    void run(() => containerApi.act(gameId, active.id, action, viewer));
  }

  return (
    <>
      <IdentityBanner
        game={game}
        controlledIds={controlledIds}
        canDrive={canDrive}
        myNames={myNames}
        activePlayer={activePlayer}
      />

      <AuctionPanel
        game={game}
        auction={auction}
        controlledIds={controlledIds}
        busy={busy}
        seatsStillToBid={seatsStillToBid}
        iAmDeliverer={iAmDeliverer}
        bidsOutstanding={bidsOutstanding}
        bidDraft={bidDraft}
        setBidDraft={setBidDraft}
        bidderSeatId={bidderSeatId}
        setBidderSeatId={setBidderSeatId}
        tieChoice={tieChoice}
        setTieChoice={setTieChoice}
        submitBid={submitBid}
        resolveDelivery={resolveDelivery}
        requestLoan={(seat) => void run(() => containerApi.act(gameId, seat, { type: 'REQUEST_LOAN' }, viewer))}
      />

      <ResultsPanel game={game} resetToLanding={onLeave} />

      <SupplyPanel
        game={game}
        activePlayer={activePlayer}
        canDrive={canDrive}
        busy={busy}
        containersGone={containersGone}
        buildableColors={buildableColors}
        buildColor={buildColor}
        setBuildColor={setBuildColor}
        nextFactoryCost={nextFactoryCost}
        act={act}
      />

      <BankPanel
        game={game}
        activePlayer={activePlayer}
        legal={legal}
        canDrive={canDrive}
        busy={busy}
        bankBid={bankBid}
        setBankBid={setBankBid}
        bankCount={bankCount}
        setBankCount={setBankCount}
        act={act}
      />

      {activePlayer && (
        <BoardMap
          game={game}
          sailActions={canDrive ? sailActions : []}
          onSail={(action) => act(activePlayer.id, action)}
          busy={busy}
        />
      )}

      <PlayerCards
        game={game}
        legal={legal}
        can={can}
        sailActions={sailActions}
        botIds={bots}
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

      {/*
        Running feed of what everyone has done. Safe to render straight from `game.log`: the
        engine only records public information, and never a losing delivery bid (see GameLog).
      */}
      <GameLog log={game.log} players={game.players} botIds={bots} />
    </>
  );
}
