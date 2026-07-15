import { expect, test } from '@playwright/test';

/**
 * Visual-regression baselines for the board minimap. The board at game start is deterministic
 * (every ship in the ocean; fixed island/bank/harbor labels), unlike the player cards, whose
 * factory color and secret scoring card come from a randomized deal. Playwright freezes CSS
 * animations for screenshots, so the pulsing active ship is captured in a stable frame.
 *
 * Baselines are generated per project (desktop-chromium + mobile-chromium), giving one snapshot
 * per viewport. Regenerate intentionally with `--update-snapshots` when the board art changes.
 */
test('board minimap matches its visual baseline', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  const board = page.getByTestId('board-map');
  await expect(board).toBeVisible();
  await expect(board.getByTestId('board-ship-p1')).toBeVisible();

  await expect(board).toHaveScreenshot('board-map.png', { maxDiffPixelRatio: 0.02 });
});
