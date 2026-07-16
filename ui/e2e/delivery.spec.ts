import { expect, test, type Page } from '@playwright/test';

// Play the chain up to the delivery auction: Ann sells to Bob's ship, Bob sails it to the island.
// Leaves the page showing the open auction, with no bids placed yet.
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

/**
 * Enter one seat's sealed bid on a shared screen: take the device, type the amount, commit.
 * The seats are prompted in order, so this always answers for the next one still to bid.
 */
async function bidAs(page: Page, amount: string) {
  await page.getByTestId('reveal-bid-entry').click();
  await page.getByTestId('bid-input').fill(amount);
  await page.getByTestId('submit-bid').click();
}

test('bids stay secret until every opponent has committed', async ({ page }) => {
  // The whole point of routing bids through the server (A1). Previously the deliverer typed every
  // bid on their own screen, so they chose whether to buy out already knowing what they'd be paid.
  await reachAuction(page);

  await expect(page.getByTestId('bidder-p1')).toContainText('thinking');
  await bidAs(page, '3'); // Ann

  // Ann has committed. That she bid is public; the amount is nowhere on the page, and there is no
  // Deliver button yet because the auction has not reached the reveal.
  await expect(page.getByTestId('bidder-p1')).toContainText('bid');
  await expect(page.getByTestId('bidder-p3')).toContainText('thinking');
  await expect(page.getByTestId('auction-reveal')).toHaveCount(0);
  await expect(page.getByTestId('deliver')).toHaveCount(0);
  await expect(page.getByTestId('auction')).not.toContainText('$3');

  await bidAs(page, '0'); // Cid bluffs $0

  // Everyone has bid, so everything is revealed at once and Bob may now decide.
  await expect(page.getByTestId('auction-reveal')).toBeVisible();
  await expect(page.getByTestId('revealed-p1')).toContainText('$3');
  await expect(page.getByTestId('revealed-p3')).toContainText('$0');
  await expect(page.getByTestId('deliver')).toBeVisible();
});

test('deliver: the highest bidder wins the cargo into their scoring area', async ({ page }) => {
  await reachAuction(page);
  await bidAs(page, '3'); // Ann bids $3
  await bidAs(page, '0'); // Cid bids $0
  await page.getByTestId('deliver').click();

  await expect(page.getByTestId('scoring-p1').locator('span[title]')).toHaveCount(1);
  await expect(page.getByTestId('money-p1')).toHaveText('$17'); // Ann paid her $3 bid
  await expect(page.getByTestId('money-p2')).toHaveText('$26'); // Bob: $3 bid + $3 subsidy
  await expect(page.getByTestId('turn-info')).toContainText('Cid');
  await expect(page.getByTestId('auction')).toHaveCount(0); // the auction is over
});

test('buyout: the deliverer keeps the cargo and no bidder pays', async ({ page }) => {
  await reachAuction(page);
  await bidAs(page, '3');
  await bidAs(page, '0');
  await expect(page.getByTestId('buyout')).toContainText('$3');
  await page.getByTestId('buyout').click();

  await expect(page.getByTestId('scoring-p2').locator('span[title]')).toHaveCount(1); // Bob keeps it
  await expect(page.getByTestId('money-p2')).toHaveText('$17'); // Bob paid the $3 buyout
  await expect(page.getByTestId('money-p1')).toHaveText('$20'); // Ann's bid returned
  await expect(page.getByTestId('turn-info')).toContainText('Cid');
});

test('a broke opponent can take a loan mid-auction so they can still bid', async ({ page }) => {
  // Rulebook pg. 16: a loan is legal during another player's turn, "even during delivery auctions",
  // precisely so being out of cash never locks you out of bidding.
  await reachAuction(page);
  await expect(page.getByTestId('auction-loan')).toBeVisible();
  await page.getByTestId('auction-loan').click();

  await expect(page.getByTestId('money-p1')).toHaveText('$30'); // Ann borrowed $10 off-turn
  await bidAs(page, '25'); // and can now bid beyond her original $20
  await bidAs(page, '0');
  await expect(page.getByTestId('revealed-p1')).toContainText('$25');
});
