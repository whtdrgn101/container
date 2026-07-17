import { expect, test } from '@playwright/test';

/**
 * Can't Stop end-to-end through the real shell — the C3 proof on the UI side: a second game's board
 * plugs into the same hub, picked from the landing screen's game picker (which only appears now that
 * two games are registered).
 *
 * The dice are the live server's, so this drives the turn *loop* rather than any specific roll: roll →
 * a pairing appears → choose it → a runner is out → stop. The first roll of a turn can never bust
 * (every column is still open and markers are free), so a pairing choice always follows.
 */
test('pick Can\'t Stop and play a turn: roll, choose a pairing, stop', async ({ page }) => {
  await page.goto('/');

  // Two games are hosted, so the picker is shown. Choose Can't Stop, then start a hotseat game.
  await page.getByTestId('pick-game-cantstop').click();
  await page.getByTestId('start-game').click();

  await expect(page.getByTestId('board')).toBeVisible();
  // The eleven columns are drawn (7 is the tall middle one).
  await expect(page.getByTestId('column-7')).toBeVisible();

  // Roll the dice server-side; the board moves into the pairing choice and shows the four dice.
  await page.getByTestId('cantstop-roll').click();
  await expect(page.getByTestId('die-0')).toBeVisible();

  // Pick whichever pairing came up.
  const pairing = page.locator('[data-testid^="cantstop-select-"]').first();
  await expect(pairing).toBeVisible();
  await pairing.click();

  // A runner is now on the board and banking is offered; stop to end the turn.
  const stop = page.getByTestId('cantstop-stop');
  await expect(stop).toBeEnabled();
  await stop.click();

  // The turn passed and the board is still live.
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('cantstop-roll')).toBeVisible();
});
