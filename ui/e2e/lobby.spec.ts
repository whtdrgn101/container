import { expect, test } from '@playwright/test';

/**
 * The shared-game lobby: a host creates an empty room, players join by code and name their own seat,
 * and the game starts once every seat is filled — all live across two browser contexts.
 */
test('create an empty lobby, join and name seats by code, then start', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  // Host creates a 3-seat shared game (no names up front) and reads the shareable code.
  await host.goto('/');
  await host.getByTestId('create-lobby').click();
  await expect(host.getByTestId('lobby')).toBeVisible();
  const code = await host.getByTestId('lobby-code').getAttribute('data-lobby-id');
  expect(code).toBeTruthy();

  // Host claims the first two seats (a client may fill more than one seat — handy for solo testing).
  await host.getByTestId('seat-name').fill('Tim');
  await host.getByTestId('take-seat').click();
  await expect(host.getByTestId('lobby-seat-0')).toContainText('Tim');
  await host.getByTestId('seat-name').fill('Sam');
  await host.getByTestId('take-seat').click();
  await expect(host.getByTestId('lobby-seat-1')).toContainText('Sam');

  // Guest joins by the same code and lands in the lobby, seeing Tim & Sam already seated (via polling).
  await guest.goto('/');
  await guest.getByTestId('join-code').fill(code!);
  await guest.getByTestId('join-game').click();
  await expect(guest.getByTestId('lobby')).toBeVisible();
  await expect(guest.getByTestId('lobby-seat-0')).toContainText('Tim');
  await expect(guest.getByTestId('lobby-seat-1')).toContainText('Sam');

  // Guest takes the last seat, filling the room; the host sees it live and can now start.
  await guest.getByTestId('seat-name').fill('Lee');
  await guest.getByTestId('take-seat').click();
  await expect(host.getByTestId('lobby-seat-2')).toContainText('Lee');
  await expect(host.getByTestId('start-lobby')).toBeEnabled();

  await host.getByTestId('start-lobby').click();

  // Both clients transition into the started game with the entered names.
  await expect(host.getByTestId('board')).toBeVisible();
  await expect(host.getByTestId('turn-info')).toContainText('Tim');
  await expect(guest.getByTestId('board')).toBeVisible();
  await expect(guest.getByTestId('turn-info')).toContainText('Tim');

  // The window is bound to the seat each client joined as. Tim (host, seat 1) is active and can act;
  // Lee (guest, seat 3) is locked out and told to wait.
  await expect(host.getByTestId('turn-status')).toContainText('Your turn');
  await expect(guest.getByTestId('identity-banner')).toContainText('Lee');
  await expect(guest.getByTestId('turn-status')).toContainText('Waiting for Tim');
  await expect(guest.getByTestId('produce-p1')).toHaveCount(0); // guest can't drive the active seat

  // Each client sees only its own secret scoring card(s). The host holds seats 1 & 2, so it sees both.
  await expect(host.getByTestId('scoring-card-p1')).not.toContainText('Secret');
  await expect(host.getByTestId('scoring-card-p2')).not.toContainText('Secret');
  await expect(host.getByTestId('scoring-card-p3')).toContainText('Secret');
  await expect(guest.getByTestId('scoring-card-p1')).toContainText('Secret');
  await expect(guest.getByTestId('scoring-card-p3')).not.toContainText('Secret');

  // Advance to Lee's turn: the host drives its own two seats, then hands off to the guest.
  await host.getByTestId('end-turn').click(); // Tim → Sam
  await expect(host.getByTestId('turn-info')).toContainText('Sam');
  await host.getByTestId('end-turn').click(); // Sam → Lee (the guest's seat)
  await expect(host.getByTestId('turn-info')).toContainText('Lee');

  // Even though Lee is now active, the host (seats 1 & 2) must NOT see Lee's secret card — the bug fix.
  await expect(host.getByTestId('turn-status')).toContainText('Waiting for Lee');
  await expect(host.getByTestId('scoring-card-p3')).toContainText('Secret');
  await expect(host.getByTestId('scoring-card-p1')).not.toContainText('Secret');
  await expect(guest.getByTestId('turn-status')).toContainText('Your turn');

  await hostCtx.close();
  await guestCtx.close();
});

/**
 * Leaving a waiting room drops only *this window's* binding — the seat keeps your name server-side.
 * So getting back in must return you to your own seat, not claim another one.
 *
 * It used to claim: the only way back was "Join", which takes the next *empty* seat, so you came back
 * as a second player under your own name and could fill your own room.
 */
test('rejoin a lobby you already hold a seat in, rather than claiming another', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-lobby').click();
  const code = await page.getByTestId('lobby-code').getAttribute('data-lobby-id');
  await page.getByTestId('seat-name').fill('Tim');
  await page.getByTestId('take-seat').click();
  await expect(page.getByTestId('lobby-seat-0')).toContainText('Tim (you)');

  await page.getByTestId('leave-lobby').click();
  await expect(page.getByTestId(`waiting-game-${code}`)).toBeVisible();

  // Back in as yourself, in the seat you already had.
  await page.getByTestId(`rejoin-waiting-${code}-0`).click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  await expect(page.getByTestId('lobby-seat-0')).toContainText('Tim (you)');
  // …and no second Tim: the other seats are still free for real players.
  await expect(page.getByTestId('lobby-seat-1')).toContainText('Empty');
  await expect(page.getByTestId('lobby-seat-2')).toContainText('Empty');
});
