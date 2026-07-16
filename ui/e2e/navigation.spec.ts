import { expect, test } from '@playwright/test';

test('the Container title takes you back to the lobby, and the game is still there', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  const gameId = await page.getByTestId('game-code').getAttribute('data-game-id');

  await page.getByTestId('home-link').click();

  // Back at the landing screen…
  await expect(page.getByTestId('board')).toHaveCount(0);
  await expect(page.getByTestId('start-game')).toBeVisible();
  // …and leaving didn't destroy anything: the game is on the server, waiting to be rejoined.
  await expect(page.getByTestId(`resume-${gameId}-p1`)).toBeVisible();
  await page.getByTestId(`resume-${gameId}-p1`).click();
  await expect(page.getByTestId('board')).toBeVisible();
});

test('the title is only a link once you are in a game or lobby', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-link')).toHaveCount(0); // nothing to go back to yet

  await page.getByTestId('create-lobby').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  await expect(page.getByTestId('home-link')).toBeVisible(); // a lobby counts too
  await page.getByTestId('home-link').click();
  await expect(page.getByTestId('start-game')).toBeVisible();
});
