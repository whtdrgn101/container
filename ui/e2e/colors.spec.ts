import { expect, test } from '@playwright/test';

/**
 * Player-colour picking — the cross-game feature. A host creates a shared 2-seat Can't Stop game,
 * claims both seats, picks a colour for each in the waiting room, and starts. We assert the picker's
 * live state (taken colours disabled, your pick highlighted) and that the started board actually shows
 * the picked colours (via the seat legend's `data-color`, not a pixel check).
 */
test('pick player colours in the waiting room and see them on the board', async ({ page }) => {
  await page.goto('/');

  // Can't Stop is a 2-player game, so we can make a 2-seat table (Container's minimum is 3).
  await page.getByTestId('pick-game-cantstop').click();
  // Bring the seat count down to 2 (Can't Stop's minimum).
  while ((await page.getByTestId('seat-count').textContent())?.trim() !== '2') {
    await page.getByTestId('seats-dec').click();
  }
  await page.getByTestId('create-lobby').click();
  await expect(page.getByTestId('lobby')).toBeVisible();

  // Claim both seats from this one window (a client may hold several — handy for solo testing).
  await page.getByTestId('seat-name').fill('Ann');
  await page.getByTestId('take-seat').click();
  await expect(page.getByTestId('lobby-seat-0')).toContainText('Ann');
  await page.getByTestId('seat-name').fill('Bob');
  await page.getByTestId('take-seat').click();
  await expect(page.getByTestId('lobby-seat-1')).toContainText('Bob');

  // The colour picker now offers a row per claimed seat, with the game's palette.
  await expect(page.getByTestId('color-picker')).toBeVisible();
  await expect(page.getByTestId('color-row-0')).toBeVisible();
  await expect(page.getByTestId('color-row-1')).toBeVisible();

  // Seat 0 picks emerald; seat 1 picks amber.
  await page.getByTestId('color-pick-0-emerald').click();
  await expect(page.getByTestId('color-pick-0-emerald')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('color-pick-1-amber').click();
  await expect(page.getByTestId('color-pick-1-amber')).toHaveAttribute('aria-pressed', 'true');

  // Uniqueness is enforced live: emerald (seat 0's pick) is disabled in seat 1's row.
  await expect(page.getByTestId('color-pick-1-emerald')).toBeDisabled();

  // Start the full table and land on the board.
  await page.getByTestId('start-lobby').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The board shows the picked colours: p1 (seat 0) is emerald, p2 (seat 1) is amber.
  await expect(page.getByTestId('seat-legend-p1')).toHaveAttribute('data-color', 'emerald');
  await expect(page.getByTestId('seat-legend-p2')).toHaveAttribute('data-color', 'amber');
});
