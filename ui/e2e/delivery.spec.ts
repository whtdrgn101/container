import { expect, test } from '@playwright/test';

// Full path: Ann sells to Bob's ship, Bob sails it to the island and auctions it off.
test('deliver cargo to the island and resolve the auction', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Turn 1 — Ann buys Bob's factory container into her harbor.
  await page.getByTestId('store-chip-p2-0').click();
  await page.getByTestId('buy-factory-p2').click();
  await expect(page.getByTestId('harbor-count-p1')).toHaveText('1 / 1');
  await page.getByTestId('end-turn').click();

  // Bob sails to Ann's harbor and loads the container onto his ship (2 actions).
  await expect(page.getByTestId('turn-info')).toContainText('Bob');
  await page.getByTestId('sail-harbor-p1').click();
  await page.getByTestId('harbor-chip-p1-0').click();
  await page.getByTestId('buy-harbor-p1').click();
  await expect(page.getByTestId('cargo-p2').locator('span')).toHaveCount(1);
  await page.getByTestId('end-turn').click();

  // Cycle back around to Bob.
  await expect(page.getByTestId('turn-info')).toContainText('Cid');
  await page.getByTestId('end-turn').click(); // Cid
  await expect(page.getByTestId('turn-info')).toContainText('Ann');
  await page.getByTestId('end-turn').click(); // Ann
  await expect(page.getByTestId('turn-info')).toContainText('Bob');

  // Bob sails ocean → island, which forces the delivery auction.
  await page.getByTestId('sail-ocean').click();
  await page.getByTestId('sail-island').click();
  await expect(page.getByTestId('auction')).toBeVisible();

  // Ann bids $3, Cid bids $0 → Ann wins the container into her scoring area.
  await page.getByTestId('bid-p1').fill('3');
  await page.getByTestId('deliver').click();

  await expect(page.getByTestId('scoring-p1').locator('span[title]')).toHaveCount(1); // Ann's island area
  await expect(page.getByTestId('money-p1')).toHaveText('$17'); // paid her $3 bid
  await expect(page.getByTestId('money-p2')).toHaveText('$26'); // bid $3 + $3 subsidy
  await expect(page.getByTestId('cargo-p2')).toHaveText(''); // ship emptied
  await expect(page.getByTestId('turn-info')).toContainText('Cid'); // turn ended, passed on
});
