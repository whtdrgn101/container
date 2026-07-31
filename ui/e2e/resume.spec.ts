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
  await starter.getByTestId('pick-game-container').click();
  await starter.getByTestId('start-game').click();
  await expect(starter.getByTestId('board')).toBeVisible();
  const code = await starter.getByTestId('game-code').getAttribute('data-game-id');
  expect(code).toBeTruthy();

  // A returning player opens the home screen, finds the game in progress, and resumes as Bob.
  await returner.goto('/');
  const row = returner.getByTestId(`active-game-${code}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('Ann');
  // The row names which game it is (its game type), not just the code.
  await expect(returner.getByTestId(`active-game-type-${code}`)).toHaveText('Container');
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

/**
 * A hotseat (pass-and-play) game you leave should be resumable as hotseat — driving *every* seat —
 * not silently rebound to a single seat. The "Play all seats" affordance does that; the tell is the
 * tab title has no "- [name]" suffix (that only appears when you're bound to specific seats).
 */
test('resume a hotseat game as pass-and-play keeps every seat', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('start-game').click(); // hotseat Container
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page).toHaveTitle('Container'); // hotseat: no seat binding
  const code = await page.getByTestId('game-code').getAttribute('data-game-id');

  // Leave to the home screen, find the game, and resume driving all seats.
  await page.getByTestId('home-link').click();
  await expect(page.getByTestId(`active-game-${code}`)).toBeVisible();
  await page.getByTestId(`resume-hotseat-${code}`).click();

  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page).toHaveTitle('Container'); // still hotseat — not "Container - [Ann]"
});
