import { expect, test } from '@playwright/test';

/**
 * Spades end-to-end through the real shell — game 9, installed from npm, and the second game to declare
 * table options.
 *
 * The thing this spec is really for is the **thirteen-card hand**. Every other card game on the hub deals
 * five or six; Spades deals thirteen, and the board has to stay usable at that width. The responsive spec
 * checks the page doesn't scroll sideways; this checks the hand is actually all there and clickable.
 */

test('pick Spades, agree a short game, bid and lead', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-spades').click();

  // House rules, built from the game's catalog declaration — the shell knows nothing about Spades.
  const options = page.getByTestId('table-options');
  await expect(options).toBeVisible();
  await expect(page.getByTestId('table-option-blindNil')).toBeVisible();
  await page.getByTestId('table-option-input-target').selectOption('200');

  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('spades-board')).toBeVisible();

  // The rules the table agreed are the rules it was dealt.
  await expect(page.getByTestId('spades-scores')).toContainText('to 200');

  // Four seats, and — the point of this spec — a full thirteen-card hand on screen.
  await expect(page.getByTestId('spades-seats').locator('[data-testid^="spades-seat-"]')).toHaveCount(4);
  const hand = page.getByTestId('spades-hand');
  await expect(hand.locator('[data-testid^="spades-card-"]')).toHaveCount(13);

  // Spades start unbroken, and the board says so rather than leaving it to be discovered.
  await expect(page.getByTestId('spades-broken')).toHaveText('♠ not broken');

  // ── Bidding ─────────────────────────────────────────────────────────────────────────────────────
  // Every number from nil to 13 is offered.
  await expect(page.getByTestId('spades-bid-0')).toHaveText('Nil');
  await expect(page.getByTestId('spades-bid-13')).toBeVisible();

  // All four bid; bids are public the moment they are made (the game's ruling R3).
  for (let seat = 0; seat < 4; seat += 1) {
    await page.getByTestId('spades-bid-3').click();
  }
  await expect(page.getByTestId('spades-seat-1')).toContainText('3');

  // ── Playing ─────────────────────────────────────────────────────────────────────────────────────
  // ⚠️ The leader may not choose a spade while they are unbroken (ruling R4), so every enabled card is
  // a non-spade. Clicking one puts it on the table.
  const playable = hand.locator('[data-testid^="spades-card-"]:not([disabled])').first();
  await expect(playable).toBeVisible();
  await playable.click();
  await expect(page.getByTestId('spades-trick').locator('[data-testid^="spades-played-"]')).toHaveCount(1);

  // The feed narrates in plain English.
  await expect(page.getByTestId('spades-log')).toContainText('bid 3');
});
