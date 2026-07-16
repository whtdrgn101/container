import { expect, test, type Page } from '@playwright/test';

test('the activity feed narrates what each player did, newest first', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('game-log-empty')).toBeVisible();

  await page.getByTestId('produce-p1').click();
  await expect(page.getByTestId('game-log')).toContainText('Ann produced 1 container (white)');

  await page.getByTestId('supply-factory-red').click(); // pick the color from the shared supply
  await page.getByTestId('build-factory').click();
  await expect(page.getByTestId('game-log')).toContainText('Ann built a red factory for $4');

  // Newest first: the most recent move is the first row in the list.
  const first = page.getByTestId('game-log').locator('li').first();
  await expect(first).toContainText('built a red factory');
});

test('the feed follows the AI’s moves too, and marks them as a bot', async ({ page }) => {
  // The whole point of the feed: seeing what the other players — human or not — actually did.
  await page.goto('/');
  await page.getByTestId('toggle-bot-1').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('game-log')).toContainText('🤖 Bob');
  await expect(page.getByTestId('game-log')).toContainText('Bob produced');
});

test('a delivery reports the winner and the winning bid, and never a losing one', async ({ page }) => {
  // The losing bids are secret and stay secret — the engine never records them, so they cannot
  // reach this feed. Ann bids $5 and Cid bids $2; only the $5 may ever be shown.
  await reachAuction(page);
  await bidAs(page, '5'); // Ann
  await bidAs(page, '2'); // Cid
  await page.getByTestId('deliver').click();

  // Scope the check to the delivery line itself: "$2" shows up legitimately elsewhere in the feed
  // (Ann's earlier $2 purchase), so asserting on the whole log would prove nothing.
  const delivery = page.getByTestId('game-log').locator('li', { hasText: 'delivered' });
  await expect(delivery).toContainText('Bob delivered 1 container');
  await expect(delivery).toContainText('Ann won the bidding at $5');
  await expect(delivery).not.toContainText('Cid'); // the loser isn't named…
  await expect(delivery).not.toContainText('$2'); // …and their sealed bid is nobody's business
});

// Same chain the delivery spec uses: Ann sells to Bob's ship, Bob sails it to the island.
async function reachAuction(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  await page.getByTestId('store-chip-p2-0').click();
  await page.getByTestId('buy-factory-p2').click();
  await page.getByTestId('end-turn').click();

  await page.getByTestId('sail-harbor-p1').click();
  await page.getByTestId('harbor-chip-p1-0').click();
  await page.getByTestId('buy-harbor-p1').click();
  await page.getByTestId('end-turn').click();

  await page.getByTestId('end-turn').click(); // Cid
  await page.getByTestId('end-turn').click(); // Ann
  await page.getByTestId('sail-ocean').click();
  await page.getByTestId('sail-island').click();
  await expect(page.getByTestId('auction')).toBeVisible();
}

async function bidAs(page: Page, amount: string) {
  await page.getByTestId('reveal-bid-entry').click();
  await page.getByTestId('bid-input').fill(amount);
  await page.getByTestId('submit-bid').click();
}
