import { expect, test } from '@playwright/test';

/**
 * Euchre end-to-end through the real shell — game 8, installed from npm like every other game, and the
 * **first hosted game to declare table options** (kernel 1.5.0).
 *
 * That last part is why this spec matters beyond "another game works". The option channel spans the
 * whole stack — a module declaration, the server catalog, a generic form in the shell, validation, the
 * resolved record reaching `createGame` — and this is the only place all of it runs at once, in a real
 * browser, against a real server. Every layer has its own unit tests; none of them can tell you that a
 * player who ticks a box gets a game dealt by that rule.
 *
 * The deal is the live server's, so this drives the *loop* and never assumes a particular card is in
 * hand.
 */

test('pick Euchre, agree the house rules, and play a hand on a real table', async ({ page }) => {
  await page.goto('/');

  // Open Euchre's box lid from the shelf.
  await page.getByTestId('pick-game-euchre').click();

  // ── The House rules section — built entirely from the game's catalog declaration ─────────────────
  // The shell knows nothing about Euchre. Everything here came off `GameInfo.tableOptions`.
  const options = page.getByTestId('table-options');
  await expect(options).toBeVisible();
  await expect(options).toContainText('House rules');
  await expect(page.getByTestId('table-option-stickTheDealer')).toBeVisible();
  await expect(page.getByTestId('table-option-defenderAlone')).toBeVisible();
  await expect(page.getByTestId('table-option-target')).toBeVisible();

  // Agree a non-default table: stick the dealer, and play to 11.
  await page.getByTestId('table-option-input-stickTheDealer').check();
  await page.getByTestId('table-option-input-target').selectOption('11');

  await page.getByTestId('start-game').click();

  // The board rendered — which already means the lazy chunk loaded out of node_modules.
  await expect(page.getByTestId('euchre-board')).toBeVisible();

  // ⚠️ The whole point: the rules the table agreed are the rules it was dealt.
  await expect(page.getByTestId('euchre-scores')).toContainText('to 11');

  // ── The table ───────────────────────────────────────────────────────────────────────────────────
  // Four seats in two partnerships, and the score bar names both.
  await expect(page.getByTestId('euchre-seats').locator('[data-testid^="euchre-seat-"]')).toHaveCount(4);
  // Seat 0 deals the first hand (the game's ruling R4).
  await expect(page.getByTestId('euchre-seat-0')).toContainText('D');

  // Five cards in the hand on the clock; hotseat shows the active seat's cards.
  const hand = page.getByTestId('euchre-hand');
  await expect(hand.locator('[data-testid^="euchre-card-"]')).toHaveCount(5);

  // ── Bidding ─────────────────────────────────────────────────────────────────────────────────────
  // Round one offers the upcard: pass, order it up, or order it up alone.
  await expect(page.getByTestId('euchre-order-up')).toBeVisible();
  await expect(page.getByTestId('euchre-order-up-alone')).toBeVisible();

  // Everyone passes, which turns the upcard down and opens round two.
  for (let seat = 0; seat < 4; seat += 1) {
    await page.getByTestId('euchre-pass').click();
  }

  // Round two names a suit. Exactly three of the four are offered — the turned-down suit is gone, which
  // is the rule the shell can only get right by rendering what the server sent.
  const namable = page.locator('[data-testid^="euchre-name-"]');
  await expect(namable).toHaveCount(3);

  // ⚠️ Stick the dealer, agreed above: once the first three have passed, the dealer has no Pass button
  // at all — a control you can never use is worse than no control.
  await page.getByTestId('euchre-pass').click();
  await page.getByTestId('euchre-pass').click();
  await page.getByTestId('euchre-pass').click();
  await expect(page.getByTestId('euchre-controls')).toBeVisible();
  await expect(page.getByTestId('euchre-pass')).toHaveCount(0);

  // The dealer must call. Naming a suit fixes trump and the cards come down.
  await namable.first().click();
  await expect(page.getByTestId('euchre-scores')).toContainText('Trump');

  // ── Playing ─────────────────────────────────────────────────────────────────────────────────────
  // The leader may play anything; a card click puts it on the table.
  const first = hand.locator('[data-testid^="euchre-card-"]:not([disabled])').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByTestId('euchre-trick').locator('[data-testid^="euchre-played-"]')).toHaveCount(1);

  // The activity feed narrates in plain English.
  await expect(page.getByTestId('euchre-log')).toContainText('trump');
});

test('a game with fixed rules shows no House rules section', async ({ page }) => {
  // The negative half of the feature: the seven games that predate table options declare none, put no
  // key on the wire, and must render exactly the setup form they always did.
  await page.goto('/');
  await page.getByTestId('pick-game-cantstop').click();
  await expect(page.getByTestId('hotseat-panel')).toBeVisible();
  await expect(page.getByTestId('table-options')).toHaveCount(0);
});
