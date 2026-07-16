import { expect, test } from '@playwright/test';

/**
 * Resume without login: an in-progress game is persisted server-side, so a player who closed their
 * tab can find it on the home screen and rejoin by picking their seat — bound to that seat's identity.
 */
test('resume an in-progress game from the home screen by picking a seat', async ({ browser }) => {
  const firstCtx = await browser.newContext();
  const secondCtx = await browser.newContext();
  const starter = await firstCtx.newPage();
  const returner = await secondCtx.newPage();

  // Start a game (Ann/Bob/Cid) and grab its id.
  await starter.goto('/');
  await starter.getByTestId('start-game').click();
  await expect(starter.getByTestId('board')).toBeVisible();
  const code = await starter.getByTestId('game-code').getAttribute('data-game-id');
  expect(code).toBeTruthy();

  // A returning player opens the home screen, finds the game in progress, and resumes as Bob.
  await returner.goto('/');
  const row = returner.getByTestId(`active-game-${code}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Ann');
  await returner.getByTestId(`resume-${code}-p2`).click();

  // They're back in the game bound to Bob's seat: tab title, own card visible, others hidden.
  await expect(returner.getByTestId('board')).toBeVisible();
  await expect(returner).toHaveTitle('Container - [Bob]');
  await expect(returner.getByTestId('identity-banner')).toContainText('Bob');
  await expect(returner.getByTestId('scoring-card-p2')).not.toContainText('Secret'); // own seat
  await expect(returner.getByTestId('scoring-card-p1')).toContainText('Secret'); // Ann's, hidden
  // It's Ann's turn, so Bob is correctly locked out.
  await expect(returner.getByTestId('turn-status')).toContainText('Waiting for Ann');

  await firstCtx.close();
  await secondCtx.close();
});
