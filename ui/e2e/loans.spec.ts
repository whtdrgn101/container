import { expect, test } from '@playwright/test';

test('take and repay a loan as free actions', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('money-p1')).toHaveText('$20');

  // Take a loan: +$10, a loan badge appears, and it costs no action.
  await page.getByTestId('request-loan').click();
  await expect(page.getByTestId('money-p1')).toHaveText('$30');
  await expect(page.getByTestId('loans-p1')).toContainText('1 loan');
  await expect(page.getByTestId('turn-info')).toContainText('2 actions left');

  // Repay it: −$10, badge gone.
  await page.getByTestId('repay-loan').click();
  await expect(page.getByTestId('money-p1')).toHaveText('$20');
  await expect(page.getByTestId('loans-p1')).toHaveCount(0);
});

test('interest is charged at the start of your next turn', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann takes 2 loans ($40, 2 loans).
  await page.getByTestId('request-loan').click();
  await page.getByTestId('request-loan').click();
  await expect(page.getByTestId('money-p1')).toHaveText('$40');
  await expect(page.getByTestId('loans-p1')).toContainText('2 loans');

  // Pass around the table back to Ann → $2 interest is auto-charged as her turn begins.
  await page.getByTestId('end-turn').click(); // Bob
  await page.getByTestId('end-turn').click(); // Cid
  await page.getByTestId('end-turn').click(); // Ann again
  await expect(page.getByTestId('turn-info')).toContainText('Ann');
  await expect(page.getByTestId('money-p1')).toHaveText('$38'); // $40 − $2 interest
  await expect(page.getByTestId('loans-p1')).toContainText('2 loans');
});
