import { expect, test } from '@playwright/test';

test('the board minimap shows every ship and sails the active player by clicking a location', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board-map')).toBeVisible();

  // Every player's ship is drawn on the water.
  await expect(page.getByTestId('board-ship-p1')).toBeVisible();
  await expect(page.getByTestId('board-ship-p2')).toBeVisible();
  await expect(page.getByTestId('board-ship-p3')).toBeVisible();

  // Ann starts in the ocean; the Bank node is a legal destination, so clicking it sails her there.
  await page.getByTestId('board-sail-bank').click();
  await expect(page.getByTestId('ship-p1')).toContainText('Off-Shore Bank');
  await expect(page.getByTestId('board-ship-p1')).toHaveAttribute('title', /0 cargo/);
});
