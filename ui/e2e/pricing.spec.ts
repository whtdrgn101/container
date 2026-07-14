import { expect, test } from '@playwright/test';

test('produce into a chosen lot, then reprice a container', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  const store = page.getByTestId('store-p1');
  // Starts with the $2 starting container.
  await expect(store).toContainText('$2');

  // Produce into the $5 lot.
  await page.getByTestId('produce-lot-5').click();
  await page.getByTestId('produce-p1').click();
  await expect(page.getByTestId('store-count-p1')).toHaveText('2 / 2');
  await expect(store).toContainText('$5');

  // Reprice: clicking the produced ($5) container cycles it up to the next lot ($6).
  await page.getByTestId('store-chip-p1-1').click();
  await expect(store).toContainText('$6');
  await expect(store).not.toContainText('$5');

  // That used the second action — the turn is now out of actions.
  await expect(page.getByTestId('turn-info')).toContainText('0 actions left');
});
