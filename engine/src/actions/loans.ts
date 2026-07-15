import { ACTIONS_PER_TURN, GameError, LOAN_AMOUNT, MAX_LOANS } from '../core';
import type { BankState, Color, GameState, PlayerState } from '../core';
import { payToBankCash, payToBankContainers, record, resolveBankWins, seatOf, tokenedContainerLots, withPlayer } from '../internal';

/** Request a $10 loan from the Off-Shore Bank (rulebook pg. 16). A free action — max 2 outstanding. */
export function requestLoan(state: GameState, playerId: string): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (player.loans >= MAX_LOANS) {
    throw new GameError('LOAN_LIMIT_REACHED', `Player "${playerId}" already has ${MAX_LOANS} loans`);
  }
  const updated: PlayerState = { ...player, money: player.money + LOAN_AMOUNT, loans: player.loans + 1 };
  return record(state, withPlayer(state, seat, updated), 'REQUEST_LOAN', playerId, {}, { loans: updated.loans });
}

/** Repay a loan: $10 from hand back to the supply, returning one loan card (rulebook pg. 17). */
export function repayLoan(state: GameState, playerId: string): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (player.loans <= 0) {
    throw new GameError('NO_LOANS_TO_REPAY', `Player "${playerId}" has no loans to repay`);
  }
  if (player.money < LOAN_AMOUNT) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot repay $${LOAN_AMOUNT}`);
  }
  const updated: PlayerState = { ...player, money: player.money - LOAN_AMOUNT, loans: player.loans - 1 };
  return record(state, withPlayer(state, seat, updated), 'REPAY_LOAN', playerId, {}, { loans: updated.loans });
}

/**
 * Default seizure (rulebook pg. 17): remove `count` containers, one at a time, from the first
 * location that has any — scoring area → ship → harbor → factory. Returns the updated player and the
 * seized colors (which the Bank keeps). If none can be seized, the interest is forgiven.
 */
function seizeContainers(player: PlayerState, count: number): { player: PlayerState; seized: Color[] } {
  const scoringArea = [...player.scoringArea];
  const cargo = [...player.ship.cargo];
  const harborStore = [...player.harborStore];
  const factoryStore = [...player.factoryStore];
  const seized: Color[] = [];
  for (let taken = 0; taken < count; taken += 1) {
    if (scoringArea.length > 0) {
      seized.push(scoringArea.pop()!);
    } else if (cargo.length > 0) {
      seized.push(cargo.pop()!);
    } else if (harborStore.length > 0) {
      seized.push(harborStore.pop()!.color);
    } else if (factoryStore.length > 0) {
      seized.push(factoryStore.pop()!.color);
    } else {
      break; // nothing left to seize → interest forgiven this turn
    }
  }
  return { player: { ...player, scoringArea, harborStore, factoryStore, ship: { ...player.ship, cargo } }, seized };
}

/** Settle the incoming player's start-of-turn interest — pay, else forced loan, else default. */
function settleInterest(
  players: readonly PlayerState[],
  index: number,
): { players: readonly PlayerState[]; seized: Color[]; interestPaid: number } {
  const player = players[index]!;
  if (player.loans === 0) {
    return { players, seized: [], interestPaid: 0 };
  }

  const interest = player.loans;
  let money = player.money;
  let loans = player.loans;
  let seizeCount = 0;
  let interestPaid = interest;

  if (money >= interest) {
    money -= interest;
  } else if (loans < MAX_LOANS) {
    money += LOAN_AMOUNT - interest; // take one loan to cover it
    loans += 1;
  } else {
    interestPaid = money; // pay what you can; default (seize) on the rest
    seizeCount = interest - money;
    money = 0;
  }

  let updated: PlayerState = { ...player, money, loans };
  let seized: Color[] = [];
  if (seizeCount > 0) {
    const result = seizeContainers(updated, seizeCount);
    updated = result.player;
    seized = result.seized;
  }
  return { players: players.map((current, i) => (i === index ? updated : current)), seized, interestPaid };
}

/**
 * Advance to the next player's turn: reset actions, bump the turn counter, then run the incoming
 * player's start-of-turn steps — pay loan interest (into the Bank cash lots; defaults feed the Bank
 * container lots) and win any Bank auction they lead. Used by both `endTurn` and `deliver`.
 */
export function advanceTurn(
  state: GameState,
  players: readonly PlayerState[],
  bank: BankState = state.bank,
): { players: readonly PlayerState[]; extra: Partial<GameState> } {
  const nextIndex = (state.activePlayerIndex + 1) % players.length;
  const { players: afterInterest, seized, interestPaid } = settleInterest(players, nextIndex);

  let nextBank = bank;
  if (interestPaid > 0) {
    nextBank = { ...nextBank, cashLots: payToBankCash(nextBank.cashLots, interestPaid) };
  }
  if (seized.length > 0) {
    nextBank = {
      ...nextBank,
      containerLots: payToBankContainers(nextBank.containerLots, seized, tokenedContainerLots(nextBank)),
    };
  }

  const wins = resolveBankWins(nextBank, afterInterest, nextIndex);
  return {
    players: wins.players,
    extra: { activePlayerIndex: nextIndex, actionsRemaining: ACTIONS_PER_TURN, turn: state.turn + 1, bank: wins.bank },
  };
}
