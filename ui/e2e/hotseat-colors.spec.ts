import { expect, test } from '@playwright/test';

/**
 * Player-colour picking on the **hotseat quick-start** — the landing screen's per-seat setup, which
 * (unlike the shared-game waiting room) had no picker, so colours silently defaulted. We pick a
 * non-default colour for seat 1, start the game, and assert the board actually paints it — via Can't
 * Stop's seat legend `data-color`, not a pixel check.
 *
 * Can't Stop is the vehicle: its palette is `['rose','sky','amber','emerald']`, so seat 0's default is
 * rose and amber is a genuinely non-default choice.
 */
test('pick a player colour in the hotseat setup and see it on the board', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('pick-game-cantstop').click();

  // Seat 0's picker offers the game's palette. Pick amber (not the rose default).
  await expect(page.getByTestId('hotseat-color-row-0')).toBeVisible();
  await page.getByTestId('hotseat-color-0-amber').click();
  await expect(page.getByTestId('hotseat-color-0-amber')).toHaveAttribute('aria-pressed', 'true');

  // Uniqueness is enforced live: seat 0's amber is disabled in seat 1's row.
  await expect(page.getByTestId('hotseat-color-1-amber')).toBeDisabled();

  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // The started board reflects the pick: p1 (seat 0) is amber; p2 keeps a palette-order default.
  await expect(page.getByTestId('seat-legend-p1')).toHaveAttribute('data-color', 'amber');
  await expect(page.getByTestId('seat-legend-p2')).not.toHaveAttribute('data-color', 'amber');
});
