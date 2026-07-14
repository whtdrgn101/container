import { expect, test, type Page } from '@playwright/test';

// Play the chain up to the delivery auction: Ann sells to Bob's ship, Bob sails it to the island.
// Leaves the page showing Bob's auction panel (no bids entered yet).
async function reachAuction(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann buys Bob's factory container into her harbor.
  await page.getByTestId('store-chip-p2-0').click();
  await page.getByTestId('buy-factory-p2').click();
  await expect(page.getByTestId('harbor-count-p1')).toHaveText('1 / 1');
  await page.getByTestId('end-turn').click();

  // Bob sails to Ann's harbor and loads the container (2 actions).
  await page.getByTestId('sail-harbor-p1').click();
  await page.getByTestId('harbor-chip-p1-0').click();
  await page.getByTestId('buy-harbor-p1').click();
  await expect(page.getByTestId('cargo-p2').locator('span')).toHaveCount(1);
  await page.getByTestId('end-turn').click();

  // Cycle back to Bob.
  await page.getByTestId('end-turn').click(); // Cid
  await page.getByTestId('end-turn').click(); // Ann
  await expect(page.getByTestId('turn-info')).toContainText('Bob');

  // Bob sails ocean → island → the delivery auction opens.
  await page.getByTestId('sail-ocean').click();
  await page.getByTestId('sail-island').click();
  await expect(page.getByTestId('auction')).toBeVisible();
}

test('deliver: the highest bidder wins the cargo into their scoring area', async ({ page }) => {
  await reachAuction(page);
  await page.getByTestId('bid-p1').fill('3'); // Ann bids $3, Cid $0
  await page.getByTestId('deliver').click();

  await expect(page.getByTestId('scoring-p1').locator('span[title]')).toHaveCount(1);
  await expect(page.getByTestId('money-p1')).toHaveText('$17'); // Ann paid her $3 bid
  await expect(page.getByTestId('money-p2')).toHaveText('$26'); // Bob: $3 bid + $3 subsidy
  await expect(page.getByTestId('turn-info')).toContainText('Cid');
});

test('buyout: the deliverer keeps the cargo and no bidder pays', async ({ page }) => {
  await reachAuction(page);
  await page.getByTestId('bid-p1').fill('3');
  await expect(page.getByTestId('buyout')).toContainText('$3');
  await page.getByTestId('buyout').click();

  await expect(page.getByTestId('scoring-p2').locator('span[title]')).toHaveCount(1); // Bob keeps it
  await expect(page.getByTestId('money-p2')).toHaveText('$17'); // Bob paid the $3 buyout
  await expect(page.getByTestId('money-p1')).toHaveText('$20'); // Ann's bid returned
  await expect(page.getByTestId('turn-info')).toContainText('Cid');
});

test('runoff: a tie opens a runoff and the higher total wins', async ({ page }) => {
  await reachAuction(page);
  await page.getByTestId('bid-p1').fill('2'); // Ann and Cid tie at $2
  await page.getByTestId('bid-p3').fill('2');
  await expect(page.getByTestId('runoff')).toBeVisible();

  await page.getByTestId('runoff-p1').fill('1'); // Ann adds $1 → total $3
  await page.getByTestId('deliver').click();

  await expect(page.getByTestId('scoring-p1').locator('span[title]')).toHaveCount(1);
  await expect(page.getByTestId('money-p1')).toHaveText('$17'); // Ann paid her $3 total
  await expect(page.getByTestId('money-p2')).toHaveText('$26'); // Bob: $3 + $3 subsidy
});
