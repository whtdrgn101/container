import { expect, test } from '@playwright/test';

test('the title takes you back to the Game Hub, and the game is still there', async ({ page }) => {
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

/**
 * The heading names where you are: the Game Hub off the board, the game and your seat on it. The site
 * is a games room that has Container in it (Track C), so "Container" is not the name of the site.
 */
test('the heading is the Game Hub off the board and the game on it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('page-title')).toHaveText('Game Hub');
  await expect(page).toHaveTitle('Game Hub');

  // The waiting room is part of the hub, not part of a game — you haven't started one yet. Claiming
  // a seat adds your name, so two playtest windows stay tellable apart.
  await page.getByTestId('create-lobby').click();
  await expect(page.getByTestId('lobby')).toBeVisible();
  await expect(page.getByTestId('page-title')).toContainText('Game Hub');
  await page.getByTestId('seat-name').fill('Tim');
  await page.getByTestId('take-seat').click();
  await expect(page).toHaveTitle('Game Hub - [Tim]');
  await page.getByTestId('home-link').click();

  // Hotseat drives every seat, so no single name fits and the heading is just the game.
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('page-title')).toContainText('Container');
  await expect(page.getByTestId('page-title')).not.toContainText('Game Hub');
  await expect(page).toHaveTitle('Container');
});
