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
test("pick Can't Stop and play a turn: roll, choose a pairing, stop", async ({ page }) => {
  await page.goto('/');

  // Two games are hosted, so the picker is shown. Choose Can't Stop, then start a hotseat game.
  await page.getByTestId('pick-game-cantstop').click();
  await page.getByTestId('start-game').click();

  await expect(page.getByTestId('board')).toBeVisible();
  // The eleven columns are drawn (7 is the tall middle one).
  await expect(page.getByTestId('column-7')).toBeVisible();

  // Before rolling: no rolls taken, and all three markers are free.
  await expect(page.getByTestId('roll-count')).toHaveText('0');
  await expect(page.getByTestId('marker-free')).toHaveCount(3);
  await expect(page.getByTestId('marker-used')).toHaveCount(0);

  // Roll the dice server-side; the board moves into the pairing choice and shows the four dice.
  await page.getByTestId('cantstop-roll').click();
  await expect(page.getByTestId('die-0')).toBeVisible();
  // One roll taken now.
  await expect(page.getByTestId('roll-count')).toHaveText('1');

  // Pick whichever pairing came up.
  const pairing = page.locator('[data-testid^="cantstop-select-"]').first();
  await expect(pairing).toBeVisible();
  await pairing.click();

  // A pairing places at least one runner, so at least one marker is now in play.
  await expect(page.getByTestId('marker-used').first()).toBeVisible();

  // A runner is now on the board and banking is offered; stop to end the turn.
  const stop = page.getByTestId('cantstop-stop');
  await expect(stop).toBeEnabled();
  await stop.click();

  // The turn passed and the board is still live.
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('cantstop-roll')).toBeVisible();
});

test("a Can't Stop game with an AI seat plays the bot's turn automatically", async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-cantstop').click();
  // Hand seat 2 to the AI, then start.
  await page.getByTestId('toggle-bot-1').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Play the human's turn: roll, choose a pairing, stop.
  await page.getByTestId('cantstop-roll').click();
  await page.locator('[data-testid^="cantstop-select-"]').first().click();
  await page.getByTestId('cantstop-stop').click();

  // The bot seat took its whole turn server-side, so the board comes back with a roll available for the
  // next human seat — the person is never asked to act for the AI.
  await expect(page.getByTestId('cantstop-roll')).toBeEnabled();
});

test('rematch: finish a game and start a new one with the same players', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-cantstop').click();
  // An all-bot table plays itself out on create, so we land straight on the finished board.
  await page.getByTestId('toggle-bot-0').click();
  await page.getByTestId('toggle-bot-1').click();
  await page.getByTestId('toggle-bot-2').click();
  await page.getByTestId('start-game').click();

  await expect(page.getByTestId('results')).toBeVisible();
  const firstCode = (await page.getByTestId('game-code').textContent()) ?? '';

  // One click restarts (hotseat drives every seat), and everyone lands in the new game.
  await page.getByTestId('rematch').click();
  await expect(page.getByTestId('game-code')).not.toHaveText(firstCode);
  await expect(page.getByTestId('results')).toBeVisible(); // the new all-bot game also finishes
});

test('the landing shows a per-game blurb and a how-to-play (C4)', async ({ page }) => {
  await page.goto('/');
  // Default selection is the first hosted game (Container).
  await expect(page.getByTestId('game-blurb')).toContainText('Container');

  // Picking Can't Stop swaps in its blurb and its own rules.
  await page.getByTestId('pick-game-cantstop').click();
  await expect(page.getByTestId('game-blurb')).toContainText('push-your-luck');

  await page.getByTestId('how-to-play').locator('summary').click();
  await expect(page.getByTestId('how-to-play').getByRole('listitem').first()).toBeVisible();
  await expect(page.getByTestId('how-to-play')).toContainText('bust');
});

test('the board has no horizontal overflow at a narrow mobile width', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-cantstop').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('column-7')).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  // The eleven-column track scrolls within its own container, so the page itself must not overflow.
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
