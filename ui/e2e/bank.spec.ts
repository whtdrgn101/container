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
