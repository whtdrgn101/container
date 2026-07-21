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

/**
 * Stone Age's landscape (the Morning Valley art) — also deterministic at game start: the map shows
 * only the eight fixed places with zero placements; the randomized building stacks and card display
 * render *outside* `board-map`, so the shuffle can't move pixels here. Note both games share the
 * `board-map` testid — each test navigates its own game, and the snapshot filenames differ.
 */
test('stone age board matches its visual baseline', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-stoneage').click();
  await page.getByTestId('start-game').click();
  const board = page.getByTestId('board-map');
  await expect(board).toBeVisible();
  await expect(board.getByTestId('place-hut')).toBeVisible();

  await expect(board).toHaveScreenshot('stoneage-board-map.png', { maxDiffPixelRatio: 0.02 });
});
