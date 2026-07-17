import { expect, test } from '@playwright/test';

/**
 * Stone Age bootstrap (roadmap SA0) through the real shell — the platform proof that a third game
 * registers and renders. Read-only for now; the mechanics land one stage at a time.
 */
test('pick Stone Age and see the board scaffold', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await expect(page.getByTestId('game-blurb')).toContainText('worker-placement');

  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  // The board's places and the player boards render from the initial setup.
  await expect(page.getByTestId('place-forest')).toBeVisible();
  await expect(page.getByTestId('place-hunt')).toBeVisible();
  await expect(page.getByTestId('player-p1')).toBeVisible();
});
