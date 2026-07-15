import { expect, test } from '@playwright/test';

test('call a Bank auction, win it next turn, and load the containers', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann calls the Bank on container lot I with a $2 bid (reserved off her hand).
  await page.getByTestId('bank-bid-0').fill('2');
  await page.getByTestId('bank-call-0').click();
  await expect(page.getByTestId('bank-auction-0')).toContainText('Ann leads $2');
  await expect(page.getByTestId('money-p1')).toHaveText('$18');

  // Pass around the table; unopposed, Ann wins the auction as her next turn begins.
  await page.getByTestId('end-turn').click(); // Bob
  await page.getByTestId('end-turn').click(); // Cid
  await page.getByTestId('end-turn').click(); // Ann — wins
  await expect(page.getByTestId('turn-info')).toContainText('Ann');
  await expect(page.getByTestId('holding-p1').locator('span[title]')).toHaveCount(2); // lot I = 2 containers
  await expect(page.getByTestId('bank-auction-0')).toHaveCount(0); // auction resolved

  // Sail to the Bank and load the holding onto her ship.
  await page.getByTestId('sail-bank').click();
  await expect(page.getByTestId('ship-p1')).toContainText('Off-Shore Bank');
  await page.getByTestId('load-bank').click();
  await expect(page.getByTestId('cargo-p1').locator('span')).toHaveCount(2);
});

test('bid a container in a cash-lot auction and win the cash', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann bids her one factory container on cash lot III ($3). Cash bids cost containers, not money.
  await page.getByTestId('bank-cash-call-2').click();
  await expect(page.getByTestId('bank-cash-auction-2')).toContainText('Ann leads 1 container');
  await expect(page.getByTestId('store-count-p1')).toHaveText('0 / 2'); // container reserved off the board
  await expect(page.getByTestId('money-p1')).toHaveText('$20');

  // Pass around; unopposed, Ann wins the $3 as her next turn begins.
  await page.getByTestId('end-turn').click(); // Bob
  await page.getByTestId('end-turn').click(); // Cid
  await page.getByTestId('end-turn').click(); // Ann — wins
  await expect(page.getByTestId('turn-info')).toContainText('Ann');
  await expect(page.getByTestId('money-p1')).toHaveText('$23'); // + $3 from cash lot III
});
