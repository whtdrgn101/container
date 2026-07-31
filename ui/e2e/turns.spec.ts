import { expect, test } from '@playwright/test';

test('take actions, build, and end the turn', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-game-container').click();
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Ann starts with 2 actions.
  await expect(page.getByTestId('turn-info')).toContainText('Ann');
  await expect(page.getByTestId('turn-info')).toContainText('2 actions left');

  // Only the active player's card shows controls.
  await expect(page.getByTestId('player-card-p1')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('player-card-p2')).toHaveAttribute('data-active', 'false');

  // Build a red factory from the shared supply → spends one action.
  await expect(page.getByTestId('supply-factory-red')).toContainText('×1'); // 3p: 1 red left
  await page.getByTestId('supply-factory-red').click(); // select the color
  await page.getByTestId('build-factory').click(); // Build (one action)
  await expect(page.getByTestId('turn-info')).toContainText('1 action left');
  await expect(page.getByTestId('supply-factory-red')).toContainText('×0'); // supply drew down

  // Build a warehouse → spends the second action; warehouse count rises to 2.
  await page.getByTestId('build-warehouse').click();
  await expect(page.getByTestId('warehouses-p1')).toContainText('2');
  await expect(page.getByTestId('turn-info')).toContainText('0 actions left');

  // With no actions left, Produce is disabled but End turn remains.
  await expect(page.getByTestId('produce-p1')).toBeDisabled();

  // End the turn → play passes to Bob with a fresh 2 actions.
  await page.getByTestId('end-turn').click();
  await expect(page.getByTestId('turn-info')).toContainText('Bob');
  await expect(page.getByTestId('turn-info')).toContainText('2 actions left');
  await expect(page.getByTestId('player-card-p2')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('produce-p2')).toBeVisible();
});
