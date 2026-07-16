import { expect, test } from '@playwright/test';

/**
 * The home-screen "waiting for players" list: a host opens a game, and a second person — with no code
 * — sees it on the landing page, picks a display name, and joins straight into the lobby seated.
 */
test('browse an open game from the home screen and join with a display name', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  // Host opens a shared game and takes a seat so the listing shows a player.
  await host.goto('/');
  await host.getByTestId('create-lobby').click();
  const code = await host.getByTestId('lobby-code').getAttribute('data-lobby-id');
  expect(code).toBeTruthy();
  await host.getByTestId('seat-name').fill('Tim');
  await host.getByTestId('take-seat').click();
  // Still in the waiting room, so it's the hub — but the name follows you, which is what makes two
  // playtest windows tellable apart.
  await expect(host).toHaveTitle('Game Hub - [Tim]');

  // Guest lands on the home screen and finds the open game in the waiting-for-players list.
  await guest.goto('/');
  const row = guest.getByTestId(`waiting-game-${code}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Tim'); // shows who's already in

  // Guest can't join without a name, then joins with one and lands in the lobby seated as Sam.
  await expect(guest.getByTestId(`join-waiting-${code}`)).toBeDisabled();
  await guest.getByTestId('display-name').fill('Sam');
  await guest.getByTestId(`join-waiting-${code}`).click();
  await expect(guest.getByTestId('lobby')).toBeVisible();
  await expect(guest.getByTestId('lobby-seats')).toContainText('Sam');
  await expect(guest).toHaveTitle('Game Hub - [Sam]');

  // The host sees Sam appear live in the waiting room.
  await expect(host.getByTestId('lobby-seats')).toContainText('Sam');

  await hostCtx.close();
  await guestCtx.close();
});
