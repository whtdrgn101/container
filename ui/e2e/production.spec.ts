import { expect, test } from '@playwright/test';

test('create a game and produce a container', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();

  await page.getByTestId('start-game').click();

  const board = page.getByTestId('board');
  await expect(board).toBeVisible();

  // Initial state: 1 starting container, $20, and 9 white containers left in the supply
  // (11 − 1 starting − 1 Bank seed).
  await expect(page.getByTestId('store-count-p1')).toHaveText('1 / 2');
  await expect(page.getByTestId('money-p1')).toHaveText('$20');
  await expect(page.getByTestId('supply-container-white')).toContainText('×9');

  // Action-spot tooltip: focusing Produce reveals its ActionTip help (keyboard/touch-reachable).
  await page.getByTestId('produce-p1').focus();
  await expect(page.getByRole('tooltip')).toContainText('one container per factory');

  await page.getByTestId('produce-p1').click();

  // Producing a white container draws one from the supply.
  await expect(page.getByTestId('supply-container-white')).toContainText('×8');

  // Produced 1 container; paid $1 union wage to the right neighbor (p2).
  await expect(page.getByTestId('store-count-p1')).toHaveText('2 / 2');
  await expect(page.getByTestId('money-p1')).toHaveText('$19');
  await expect(page.getByTestId('money-p2')).toHaveText('$21');
  await expect(page.getByTestId('money-p3')).toHaveText('$20');

  // Factory district is now full → Produce is disabled.
  await expect(page.getByTestId('produce-p1')).toBeDisabled();
});
