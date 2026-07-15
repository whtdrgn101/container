import { expect, test } from '@playwright/test';

/**
 * B2 live sync: a second client joins an existing game by code and receives real-time updates over
 * the WebSocket stream when the first client acts — no manual refresh. Two isolated browser contexts
 * stand in for two devices.
 */
test('a joined client sees another client’s moves live', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  // Host creates a game and reads its shareable code.
  await host.goto('/');
  await host.getByTestId('start-game').click();
  await expect(host.getByTestId('board')).toBeVisible();
  const code = await host.getByTestId('game-code').getAttribute('data-game-id');
  expect(code).toBeTruthy();

  // Guest joins by code and lands in the same game.
  await guest.goto('/');
  await guest.getByTestId('join-code').fill(code!);
  await guest.getByTestId('join-game').click();
  await expect(guest.getByTestId('board')).toBeVisible();
  await expect(guest.getByTestId('turn-info')).toContainText('Ann');

  // Host ends the turn; the guest's view advances live to the next player via the stream.
  await host.getByTestId('end-turn').click();
  await expect(host.getByTestId('turn-info')).toContainText('Bob');
  await expect(guest.getByTestId('turn-info')).toContainText('Bob');

  // A second host action also propagates.
  await host.getByTestId('end-turn').click();
  await expect(guest.getByTestId('turn-info')).toContainText('Cid');

  await hostCtx.close();
  await guestCtx.close();
});
