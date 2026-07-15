import { expect, test } from '@playwright/test';

test('add seats to start a 5-player game', async ({ page }) => {
  await page.goto('/');

  // Defaults to the 3-player minimum: no seat can be removed yet.
  await expect(page.getByTestId('remove-player-0')).toBeDisabled();

  // Add two seats to reach the 5-player maximum, then the Add button locks.
  await page.getByTestId('add-player').click();
  await page.getByTestId('add-player').click();
  await expect(page.getByTestId('player-name-4')).toBeVisible();
  await expect(page.getByTestId('add-player')).toBeDisabled();

  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.locator('[data-testid^="player-card-"]')).toHaveCount(5);
});

test('a blank seat name blocks starting', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('player-name-1').fill('');
  await expect(page.getByTestId('setup-hint')).toBeVisible();
  await expect(page.getByTestId('start-game')).toBeDisabled();
});
