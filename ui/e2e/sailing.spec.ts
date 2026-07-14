import { expect, test } from '@playwright/test';

test('sail from the ocean to a harbor and back', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-game').click();
  await expect(page.getByTestId('board')).toBeVisible();

  // Everyone starts in the ocean.
  await expect(page.getByTestId('ship-p1')).toContainText('Ocean');

  // Ann cannot sail into her own harbor (no such button), only opponents / island / bank.
  await expect(page.getByTestId('sail-harbor-p1')).toHaveCount(0);

  // Sail to Bob's harbor (one action).
  await page.getByTestId('sail-harbor-p2').click();
  await expect(page.getByTestId('ship-p1')).toContainText("Bob's harbor");
  await expect(page.getByTestId('turn-info')).toContainText('1 action left');

  // From a harbor the only sail option is back to the ocean.
  await expect(page.getByTestId('sail-island')).toHaveCount(0);
  await page.getByTestId('sail-ocean').click();
  await expect(page.getByTestId('ship-p1')).toContainText('Ocean');
  await expect(page.getByTestId('turn-info')).toContainText('0 actions left');
});
