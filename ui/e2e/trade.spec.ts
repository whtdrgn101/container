import { expect, test } from '@playwright/test';

test('the full trade chain: factory purchase, then harbor purchase', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann (p1, active) selects Bob's (p2) starting factory container, then buys it into her harbor.
  await expect(page.getByTestId('harbor-count-p1')).toHaveText('0 / 1');
  await page.getByTestId('store-chip-p2-0').click(); // select
  await page.getByTestId('buy-factory-p2').click(); // one action buys everything selected
  await expect(page.getByTestId('harbor-count-p1')).toHaveText('1 / 1');
  await expect(page.getByTestId('money-p1')).toHaveText('$18'); // paid $2
  await expect(page.getByTestId('money-p2')).toHaveText('$22'); // Bob earned $2

  // Pass to Bob, who sails to Ann's harbor and loads the container onto his ship.
  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('turn-info')).toContainText('Bob');

  await page.getByTestId('sail-harbor-p1').click();
  await expect(page.getByTestId('ship-p2')).toContainText("Ann's harbor");

  // Ann's harbor container is now buyable by the docked Bob → select + load onto his ship.
  await page.getByTestId('harbor-chip-p1-0').click(); // select
  await page.getByTestId('buy-harbor-p1').click();
  await expect(page.getByTestId('cargo-p2').locator('span')).toHaveCount(1);
  await expect(page.getByTestId('harbor-count-p1')).toHaveText('0 / 1');
  await expect(page.getByTestId('turn-info')).toContainText('0 actions left');
});
