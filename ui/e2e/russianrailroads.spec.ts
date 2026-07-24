import { expect, test } from '@playwright/test';

/**
 * Russian Railroads end-to-end through the real shell — the RR1 proof on the UI side, and the Track D
 * pilot: a game whose board ships from its own in-workspace **package** (`@game-hub/game-russianrailroads`)
 * plugs into the same hub, picked from the landing screen's game picker.
 *
 * RR1 is the worker-placement spine, so this drives it: pick the game, place a worker on the take-2-coins
 * space (the seat gains coins), then pass — and the activity feed narrates both.
 */
test('pick Russian Railroads and play the worker-placement spine: place, pass', async ({ page }) => {
  await page.goto('/');

  // Five games are hosted, so the picker is shown. Choose Russian Railroads, then start a hotseat game.
  await page.getByTestId('pick-game-russianrailroads').click();
  await expect(page.getByTestId('game-blurb')).toContainText('worker-placement');
  await page.getByTestId('start-game').click();

  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('turn-info')).toContainText('Round 1');

  // Both action spaces render; the take-2-coins space starts empty.
  await expect(page.getByTestId('rr-space-coins')).toContainText('Take 2 coins');
  await expect(page.getByTestId('rr-space-track-bottom')).toBeVisible();
  await expect(page.getByTestId('rr-space-coins')).toContainText('Empty');

  // The active seat places a worker on the coins space and gains 2 coins.
  await page.getByTestId('rr-place-coins').click();
  await expect(page.getByTestId('rr-occupied-coins')).toBeVisible();
  await expect(page.getByTestId('rr-log')).toContainText('placed a worker');
  await expect(page.getByTestId('rr-log')).toContainText('+2 coins');

  // The next seat is now on the clock; it passes.
  await page.getByTestId('rr-pass').click();
  await expect(page.getByTestId('rr-log')).toContainText('passed');
});
